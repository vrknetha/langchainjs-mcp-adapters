/**
 * This example demonstrates how to use the MCP adapter with a math server.
 *
 * To run this example:
 * 1. Run this example: node --loader ts-node/esm examples/math_example.ts
 *
 * The math server will be started automatically via stdio transport.
 */

import { MultiServerMCPClient } from '../src/client.js';

async function main() {
  try {
    // Create a client
    const client = new MultiServerMCPClient({
      math: {
        // No transport specified - will default to stdio
        command: 'python',
        args: ['./examples/math_server.py'],
      },
    });

    // Connect to the math server via stdio
    console.log('Connecting to math server via stdio...');
    const serverTools = await client.initializeConnections();
    console.log('Connected to math server');

    console.log(`Tool descriptions:`);
    for (const tool of serverTools) {
      console.log(`- ${tool.name}: ${tool.description}`);
    }

    // Add two numbers
    console.log('\nAdding 5 + 3...');
    const addTool = serverTools.find(tool => tool.name === 'add');
    if (!addTool) {
      throw new Error('add tool not found');
    }
    const addResult = await addTool.invoke({ a: 5, b: 3 });
    console.log(`Result: ${addResult}`);

    // Multiply two numbers
    console.log('\nMultiplying 4 * 7...');
    const multiplyTool = serverTools.find(tool => tool.name === 'multiply');
    if (!multiplyTool) {
      throw new Error('multiply tool not found');
    }
    const multiplyResult = await multiplyTool.invoke({ a: 4, b: 7 });
    console.log(`Result: ${multiplyResult}`);

    // Close the client
    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
