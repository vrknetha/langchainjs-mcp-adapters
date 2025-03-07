import { MultiServerMCPClient, logger } from '../src/index.js';

// Set logger to debug level for maximum information
logger.level = 'debug';

/**
 * Helper function to list all methods available on an object
 */
function listAllMethods(obj: any, depth = 1): void {
  if (!obj || depth > 3) return;

  console.log(`\nMethods available on ${obj.constructor?.name || 'object'}:`);

  // Get own property names
  const properties = [
    ...Object.getOwnPropertyNames(obj),
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(obj) || {}),
  ].filter(prop => prop !== 'constructor');

  // Display each property
  properties.forEach(prop => {
    try {
      const value = obj[prop];
      const type = typeof value;

      if (type === 'function') {
        console.log(`- ${prop}() [Method]`);
      } else if (type === 'object' && value !== null) {
        console.log(`- ${prop} [Object]`);
        // Recursively list methods on nested objects for the first level
        if (depth === 1) {
          listAllMethods(value, depth + 1);
        }
      } else {
        console.log(`- ${prop}: ${type}`);
      }
    } catch (error) {
      console.log(`- ${prop}: [Error accessing]`);
    }
  });
}

async function main() {
  console.log('Starting Client Methods Test...');

  const client = new MultiServerMCPClient();

  try {
    // Connect to the prompt server
    await client.connectToServerViaStdio('prompt-server', 'python', [
      './examples/prompt_server.py',
    ]);

    console.log('Connected to server');

    // Get the MCP client for the server
    const mcpClient = client.getClient('prompt-server');

    if (!mcpClient) {
      throw new Error('Failed to get MCP client');
    }

    console.log('\n--- MCP Client Analysis ---');
    console.log('Type:', typeof mcpClient);
    console.log('Constructor name:', mcpClient.constructor?.name);

    // List all available methods and properties
    listAllMethods(mcpClient);

    // Try to inspect the protocol
    try {
      // @ts-ignore - accessing potential private property
      const protocol = (mcpClient as any)._protocol;
      if (protocol) {
        console.log('\n--- Protocol Object Analysis ---');
        listAllMethods(protocol);

        // Try to call sendRequest directly on the protocol
        try {
          const result = await protocol.sendRequest('prompts/list', {});
          console.log('\nSuccessfully called protocol.sendRequest:');
          console.log(JSON.stringify(result, null, 2));
        } catch (err) {
          console.error('Error calling protocol.sendRequest:', err);
        }
      }
    } catch (error) {
      console.error('Error inspecting protocol:', error);
    }

    // Try to directly call methods on the client
    try {
      // @ts-ignore - Method may not exist
      const result = await mcpClient.handleRequest({ method: 'prompts/list', params: {} });
      console.log('\nSuccessfully called handleRequest:');
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error calling handleRequest:', err);
    }
  } catch (error) {
    console.error('Error in test:', error);
  } finally {
    // Close all connections
    await client.close();
    console.log('Client closed');
  }
}

main().catch(console.error);
