/**
 * Example demonstrating how to connect to an MCP server programmatically.
 *
 * This example shows how to:
 * 1. Create an MCP server instance
 * 2. Connect to it using the new connectToServer method
 * 3. Use the tools provided by the server with Google's Gemini model
 */

import { MultiServerMCPClient } from '../src/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import logger from '../src/logger.js';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Set logger level to debug for more detailed logs
logger.level = 'debug';

async function main() {
  if (!process.env.GOOGLE_API_KEY) {
    // eslint-disable-next-line no-console
    console.error('Please set the GOOGLE_API_KEY environment variable in the .env file');
    process.exit(1);
  }

  // Create a new MCP server instance
  const server = new McpServer({
    name: 'example-server',
    version: '1.0.0',
  });

  // Register a tool on the server
  server.tool(
    'greet',
    'Greet a person by name',
    { name: z.string().describe('The name of the person to greet') },
    async ({ name }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Hello, ${name}! Nice to meet you.`,
          },
        ],
      };
    }
  );

  // Create a client
  const client = new MultiServerMCPClient();

  try {
    // Connect to the server programmatically
    await client.connectToServer('example-server', server.server);
    // eslint-disable-next-line no-console
    console.log('Connected to server programmatically');

    // Get tools
    const tools = client.getTools();
    const allTools = Array.from(tools.values()).flat();
    // eslint-disable-next-line no-console
    console.log(`Loaded ${allTools.length} tools`);

    // Create a Gemini model
    const model = new ChatGoogleGenerativeAI({
      temperature: 0,
      modelName: 'gemini-2.0-flash',
      apiKey: process.env.GOOGLE_API_KEY,
    });

    // Initialize the agent executor
    const executor = await initializeAgentExecutorWithOptions(allTools, model, {
      agentType: 'chat-zero-shot-react-description',
      verbose: true,
    });

    // Run the agent
    const result = await executor.invoke({
      input: 'Can you greet John for me?',
    });

    // eslint-disable-next-line no-console
    console.log('Agent result:', result.output);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error:', error);
  } finally {
    // Close the client
    await client.close();
    // eslint-disable-next-line no-console
    console.log('Client closed');
  }
}

// Run the example
main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', error);
  process.exit(1);
});
