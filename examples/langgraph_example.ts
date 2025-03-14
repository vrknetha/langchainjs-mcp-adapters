/**
 * LangGraph Example with MCP Tools Integration
 *
 * This example demonstrates how to use LangGraph with MCP tools to create a flexible agent workflow.
 *
 * LangGraph is a framework for building stateful, multi-actor applications with LLMs. It provides:
 * - A graph-based structure for defining complex workflows
 * - State management with type safety
 * - Conditional routing between nodes based on the state
 * - Built-in persistence capabilities
 *
 * In this example, we:
 * 1. Set up an MCP client to connect to a Python-based math server
 * 2. Create a LangGraph workflow with two nodes: one for the LLM and one for tools
 * 3. Define the edges and conditional routing between the nodes
 * 4. Execute the workflow with example queries
 *
 * The main benefits of using LangGraph with MCP tools:
 * - Clear separation of responsibilities: LLM reasoning vs. tool execution
 * - Explicit control flow through graph-based routing
 * - Type safety for state management
 * - Ability to expand the graph with additional nodes for more complex workflows
 */

import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END, START, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import logger from '../src/logger.js';

// MCP client imports
import { MultiServerMCPClient } from '../src/index.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Example demonstrating how to use MCP tools with LangGraph agent flows
 * This example connects to a math server and uses its tools
 */
async function runExample() {
  let client: MultiServerMCPClient | null = null;

  try {
    logger.info('Initializing MCP client...');

    // Create a client with configurations for the math server only
    client = new MultiServerMCPClient({
      math: {
        transport: 'stdio',
        command: 'python',
        args: ['./examples/math_server.py'],
      },
    });

    // Initialize connections to the server
    await client.initializeConnections();
    logger.info('Connected to server');

    // Connect to the math server
    await client.connectToServerViaStdio('math', 'npx', [
      '-y',
      '@modelcontextprotocol/server-math',
    ]);

    // Get the tools (flattened array is the default now)
    const mcpTools = client.getTools() as StructuredToolInterface<z.ZodObject<any>>[];

    if (mcpTools.length === 0) {
      throw new Error('No tools found');
    }

    logger.info(
      `Loaded ${mcpTools.length} MCP tools: ${mcpTools.map(tool => tool.name).join(', ')}`
    );

    // Create an OpenAI model and bind the tools
    const model = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4-turbo-preview',
      temperature: 0,
    }).bindTools(mcpTools);

    // Create a tool node for the LangGraph
    const toolNode = new ToolNode(mcpTools);

    // ================================================
    // Create a LangGraph agent flow
    // ================================================
    console.log('\n=== CREATING LANGGRAPH AGENT FLOW ===');

    /**
     * MessagesAnnotation provides a built-in state schema for handling chat messages.
     * It includes a reducer function that automatically:
     * - Appends new messages to the history
     * - Properly merges message lists
     * - Handles message ID-based deduplication
     */

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
    // START -> llm: Entry point to the graph
    // tools -> llm: After tools are executed, return to LLM for next step
    workflow.addEdge(START as any, 'llm' as any);
    workflow.addEdge('tools' as any, 'llm' as any);

    // Conditional routing to end or continue the tool loop
    // This is the core of the agent's decision-making process
    workflow.addConditionalEdges('llm' as any, state => {
      const lastMessage = state.messages[state.messages.length - 1];

      // If the last message has tool calls, we need to execute the tools
      // Cast to AIMessage to access tool_calls property
      const aiMessage = lastMessage as AIMessage;
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        console.log('Tool calls detected, routing to tools node');
        return 'tools' as any;
      }

      // If there are no tool calls, we're done
      console.log('No tool calls, ending the workflow');
      return END as any;
    });

    // Compile the graph
    // This creates a runnable LangChain object that we can invoke
    const app = workflow.compile();

    // Define queries for testing
    const queries = ['What is 5 + 3?', 'What is 7 * 9?'];

    // Test the LangGraph agent with the queries
    console.log('\n=== RUNNING LANGGRAPH AGENT ===');
    for (const query of queries) {
      console.log(`\nQuery: ${query}`);

      // Run the LangGraph agent with the query
      // The query is converted to a HumanMessage and passed into the state
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
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1); // Exit with error code
  } finally {
    // Close all client connections
    if (client) {
      await client.close();
      console.log('\nClosed all MCP connections');
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
