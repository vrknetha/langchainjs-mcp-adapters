/**
 * Firecrawl MCP Server Example - Custom Configuration
 *
 * This example demonstrates using the Firecrawl MCP server with a custom configuration file.
 * It creates a new configuration file specifically for the Firecrawl server and uses it to
 * initialize the client.
 */

import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END, START, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import logger from '../src/logger.js';

// MCP client imports
import { MultiServerMCPClient } from '../src/index.js';

// Load environment variables from .env file
dotenv.config();

// Path for our custom config file
const customConfigPath = path.join(process.cwd(), 'examples', 'firecrawl_config.json');

/**
 * Create a custom configuration file for the Firecrawl server
 */
function createCustomConfigFile() {
  const configContent = {
    servers: {
      firecrawl: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'firecrawl-mcp'],
        env: {
          FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',
          // Optional configurations
          FIRECRAWL_RETRY_MAX_ATTEMPTS: '5',
          FIRECRAWL_RETRY_INITIAL_DELAY: '2000',
          FIRECRAWL_RETRY_MAX_DELAY: '30000',
          FIRECRAWL_RETRY_BACKOFF_FACTOR: '3',
        },
      },
    },
  };

  fs.writeFileSync(customConfigPath, JSON.stringify(configContent, null, 2));
  logger.info(`Created custom configuration file at ${customConfigPath}`);
}

/**
 * Example demonstrating how to use Firecrawl MCP tools with LangGraph agent flows
 * This example creates and loads a custom configuration file
 */
async function runExample() {
  let client: MultiServerMCPClient | null = null;

  try {
    // Create the custom configuration file first
    createCustomConfigFile();

    logger.info('Initializing MCP client from custom configuration file...');

    // Create a client from the custom configuration file
    client = MultiServerMCPClient.fromConfigFile(customConfigPath);

    // Initialize connections to all servers in the configuration
    await client.initializeConnections();
    logger.info('Connected to servers from custom configuration');

    // Get all tools from all servers
    const mcpTools = client.getTools() as StructuredToolInterface<z.ZodObject<any>>[];

    if (mcpTools.length === 0) {
      throw new Error('No tools found');
    }

    logger.info(
      `Loaded ${mcpTools.length} MCP tools: ${mcpTools.map(tool => tool.name).join(', ')}`
    );

    // Create an OpenAI model and bind the tools
    const model = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
      temperature: 0,
    }).bindTools(mcpTools);

    // Create a tool node for the LangGraph
    const toolNode = new ToolNode(mcpTools);

    // ================================================
    // Create a LangGraph agent flow
    // ================================================
    console.log('\n=== CREATING LANGGRAPH AGENT FLOW ===');

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

    // Define a query for testing the search functionality
    const query = 'Search for information about "climate change solutions" and provide a summary';

    // Test the LangGraph agent with the query
    console.log('\n=== RUNNING LANGGRAPH AGENT ===');
    console.log(`\nQuery: ${query}`);

    // Run the LangGraph agent with the query
    const result = await app.invoke({
      messages: [new HumanMessage(query)],
    });

    // Display the result and all messages in the final state
    console.log(`\nFinal Messages (${result.messages.length}):`);
    result.messages.forEach((msg: BaseMessage, i: number) => {
      const msgType = 'type' in msg ? msg.type : 'unknown';
      console.log(
        `[${i}] ${msgType}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`
      );
    });

    const finalMessage = result.messages[result.messages.length - 1];
    console.log(`\nResult: ${finalMessage.content}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1); // Exit with error code
  } finally {
    // Close all client connections
    if (client) {
      await client.close();
      console.log('\nClosed all connections');
    }

    // Clean up our custom config file
    if (fs.existsSync(customConfigPath)) {
      fs.unlinkSync(customConfigPath);
      logger.info(`Cleaned up custom configuration file at ${customConfigPath}`);
    }

    // Exit process after a short delay to allow for cleanup
    setTimeout(() => {
      console.log('Example completed, exiting process.');
      process.exit(0);
    }, 500);
  }
}

// Run the example
runExample();
