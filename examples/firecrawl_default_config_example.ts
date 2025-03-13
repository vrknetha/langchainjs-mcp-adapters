/**
 * Firecrawl MCP Server Example - Default Configuration
 *
 * This example demonstrates loading from default configuration file (mcp.json)
 * And getting tools from the Firecrawl server with automatic initialization
 */

import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END, START, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import logger from '../src/logger.js';

// MCP client imports
import { MultiServerMCPClient } from '../src/index.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Example demonstrating loading from default configuration
 */
async function runExample() {
  let client: MultiServerMCPClient | null = null;

  // Add a timeout to prevent the process from hanging indefinitely
  const timeout = setTimeout(() => {
    console.error('Example timed out after 30 seconds');
    process.exit(1);
  }, 30000);

  try {
    logger.info('Initializing MCP client from default configuration file...');

    // The client will automatically look for and load mcp.json from the current directory
    client = new MultiServerMCPClient();
    await client.initializeConnections();
    logger.info('Connected to servers from default configuration');

    // Get Firecrawl tools specifically
    const mcpTools = client.getTools() as StructuredToolInterface<z.ZodObject<any>>[];
    const firecrawlTools = mcpTools.filter(
      tool => client!.getServerForTool(tool.name) === 'firecrawl'
    );

    if (firecrawlTools.length === 0) {
      throw new Error('No Firecrawl tools found');
    }

    logger.info(
      `Loaded ${firecrawlTools.length} Firecrawl MCP tools: ${firecrawlTools
        .map(tool => tool.name)
        .join(', ')}`
    );

    // Create an OpenAI model and bind the tools to it
    const model = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
      temperature: 0,
    }).bindTools(firecrawlTools);

    // ================================================
    // Create a LangGraph agent flow
    // ================================================
    console.log('\n=== CREATING LANGGRAPH AGENT FLOW ===');

    // Create a tool node for the LangGraph
    const toolNode = new ToolNode(firecrawlTools);

    // Define the function that calls the model
    const llmNode = async (state: typeof MessagesAnnotation.State) => {
      console.log('Calling LLM with messages:', state.messages.length);
      const response = await model.invoke(state.messages);
      return { messages: [response] };
    };

    // Create a new graph with MessagesAnnotation
    const workflow = new StateGraph(MessagesAnnotation);

    // Add the nodes to the graph
    workflow.addNode('llm', llmNode);
    workflow.addNode('tools', toolNode);

    // Add edges - these define how nodes are connected
    workflow.addEdge(START as any, 'llm' as any);
    workflow.addEdge('tools' as any, 'llm' as any);

    // Conditional routing to end or continue the tool loop
    workflow.addConditionalEdges('llm' as any, state => {
      const lastMessage = state.messages[state.messages.length - 1];
      const aiMessage = lastMessage as AIMessage;

      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        console.log('Tool calls detected, routing to tools node');
        return 'tools' as any;
      }

      console.log('No tool calls, ending the workflow');
      return END as any;
    });

    // Compile the graph
    const app = workflow.compile();

    // Define a query for testing Firecrawl
    const query = 'Scrape the content from https://example.com and summarize it in bullet points';

    // ================================================
    // Test the LangGraph agent with the query
    // ================================================
    console.log('\n=== RUNNING LANGGRAPH AGENT ===');
    console.log(`\nQuery: ${query}`);

    try {
      // Set a timeout for the langgraph invocation
      const langgraphPromise = app.invoke({
        messages: [new HumanMessage(query)],
      });

      // Run with a 15-second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('LangGraph execution timed out after 15 seconds')),
          15000
        );
      });

      // Race between the LangGraph execution and the timeout
      const result = (await Promise.race([langgraphPromise, timeoutPromise])) as any;

      // Display the final response
      if (result && result.messages && result.messages.length > 0) {
        const finalMessage = result.messages[result.messages.length - 1];
        console.log(`\nResult: ${finalMessage.content}`);
      } else {
        console.log('No result received from LangGraph execution');
      }
    } catch (error) {
      console.error('LangGraph execution error:', error);
      console.log('Continuing with cleanup...');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clear the global timeout
    clearTimeout(timeout);

    // Close all client connections
    if (client) {
      await client.close();
      console.log('\nClosed all connections');
    }

    // Exit after a short delay to allow for cleanup
    setTimeout(() => {
      console.log('Example completed, exiting process.');
      process.exit(0);
    }, 500);
  }
}

// Run the example
runExample();
