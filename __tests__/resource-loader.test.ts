import { Document } from '@langchain/core/documents';
import { MCPResourceLoader } from '../src/loaders/resource-loader.js';
import { MultiServerMCPClient } from '../src/client.js';
import { Resource, ResourceContent } from '../src/types/mcp-types.js';

// Mock the MultiServerMCPClient
jest.mock('../src/client.js', () => {
  const mockClient: any = {
    sendRequest: jest.fn().mockImplementation(async (req: any) => {
      if (req.method === 'resources/list') {
        return {
          resources: [
            {
              uri: 'mcp://resources/example1.txt',
              name: 'Example 1',
              description: 'First example resource',
              mimeType: 'text/plain',
            },
            {
              uri: 'mcp://resources/example2.txt',
              name: 'Example 2',
              description: 'Second example resource',
              mimeType: 'text/plain',
            },
            {
              uri: 'mcp://resources/example3.js',
              name: 'Example 3',
              description: 'JavaScript example',
              mimeType: 'application/javascript',
            },
          ],
        };
      } else if (req.method === 'resources/read') {
        const uri = req.params?.uri as string;
        if (uri === 'mcp://resources/example1.txt') {
          return {
            resource: {
              uri: 'mcp://resources/example1.txt',
              name: 'Example 1',
              description: 'First example resource',
              mimeType: 'text/plain',
            },
            content: {
              uri: 'mcp://resources/example1.txt',
              mimeType: 'text/plain',
              text: 'This is the content of example 1',
            },
          };
        } else if (uri === 'mcp://resources/example2.txt') {
          return {
            resource: {
              uri: 'mcp://resources/example2.txt',
              name: 'Example 2',
              description: 'Second example resource',
              mimeType: 'text/plain',
            },
            content: {
              uri: 'mcp://resources/example2.txt',
              mimeType: 'text/plain',
              text: 'This is the content of example 2',
            },
          };
        } else if (uri === 'mcp://resources/example3.js') {
          return {
            resource: {
              uri: 'mcp://resources/example3.js',
              name: 'Example 3',
              description: 'JavaScript example',
              mimeType: 'application/javascript',
            },
            content: {
              uri: 'mcp://resources/example3.js',
              mimeType: 'application/javascript',
              text: 'console.log("Hello, world!");',
            },
          };
        } else {
          throw new Error(`Resource not found: ${uri}`);
        }
      }
      throw new Error(`Unhandled method: ${req.method}`);
    }),
  };

  return {
    MultiServerMCPClient: jest.fn().mockImplementation(() => ({
      getClient: jest.fn().mockImplementation((serverName: string) => mockClient),
    })),
  };
});

describe('MCPResourceLoader', () => {
  let client: MultiServerMCPClient;

  beforeEach(() => {
    client = new MultiServerMCPClient();
    jest.clearAllMocks();
  });

  test('loads all resources from the server', async () => {
    const loader = new MCPResourceLoader(client, 'test-server');
    const documents = await loader.load();

    expect(documents).toHaveLength(3);
    expect(documents[0].pageContent).toBe('This is the content of example 1');
    expect(documents[0].metadata.resourceName).toBe('Example 1');
    expect(documents[1].pageContent).toBe('This is the content of example 2');
    expect(documents[2].pageContent).toBe('console.log("Hello, world!");');
  });

  test('loads specific resources by URI', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', [
      'mcp://resources/example1.txt',
      'mcp://resources/example3.js',
    ]);
    const documents = await loader.load();

    expect(documents).toHaveLength(2);
    expect(documents[0].pageContent).toBe('This is the content of example 1');
    expect(documents[1].pageContent).toBe('console.log("Hello, world!");');
  });

  test('filters resources by MIME type', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', undefined, {
      mimeTypeFilter: 'text/plain',
    });
    const documents = await loader.load();

    expect(documents).toHaveLength(2);
    expect(documents[0].metadata.mimeType).toBe('text/plain');
    expect(documents[1].metadata.mimeType).toBe('text/plain');
  });

  test('filters resources by regex pattern', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', undefined, {
      includePattern: /example[1-2]/,
    });
    const documents = await loader.load();

    expect(documents).toHaveLength(2);
    expect(documents[0].metadata.uri).toBe('mcp://resources/example1.txt');
    expect(documents[1].metadata.uri).toBe('mcp://resources/example2.txt');
  });

  test('excludes resources by regex pattern', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', undefined, {
      excludePattern: /\.js$/,
    });
    const documents = await loader.load();

    expect(documents).toHaveLength(2);
    expect(documents[0].metadata.uri).toBe('mcp://resources/example1.txt');
    expect(documents[1].metadata.uri).toBe('mcp://resources/example2.txt');
  });

  test('limits the number of resources loaded', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', undefined, { limit: 1 });
    const documents = await loader.load();

    expect(documents).toHaveLength(1);
  });

  test('combines multiple filters', async () => {
    const loader = new MCPResourceLoader(client, 'test-server', undefined, {
      mimeTypeFilter: 'text/plain',
      includePattern: /example1/,
    });
    const documents = await loader.load();

    expect(documents).toHaveLength(1);
    expect(documents[0].metadata.uri).toBe('mcp://resources/example1.txt');
  });

  test('handles errors when loading resources', async () => {
    // Create a mock client that throws an error for one resource
    const errorClient: any = {
      sendRequest: jest.fn().mockImplementation(async (req: any) => {
        if (req.method === 'resources/list') {
          return {
            resources: [
              { uri: 'mcp://resources/example1.txt' },
              { uri: 'mcp://resources/error.txt' },
            ],
          };
        } else if (req.method === 'resources/read') {
          const uri = req.params?.uri as string;
          if (uri === 'mcp://resources/example1.txt') {
            return {
              resource: {
                uri: 'mcp://resources/example1.txt',
                name: 'Example 1',
                mimeType: 'text/plain',
              },
              content: {
                uri: 'mcp://resources/example1.txt',
                mimeType: 'text/plain',
                text: 'This is the content of example 1',
              },
            };
          } else if (uri === 'mcp://resources/error.txt') {
            throw new Error('Resource not found');
          }
        }
        throw new Error(`Unhandled method: ${req.method}`);
      }),
    };

    const clientWithError = new MultiServerMCPClient();
    jest.spyOn(clientWithError, 'getClient').mockImplementation(() => errorClient);

    const loader = new MCPResourceLoader(clientWithError, 'test-server');
    const documents = await loader.load();

    // Should still return the successful resource
    expect(documents).toHaveLength(1);
    expect(documents[0].metadata.uri).toBe('mcp://resources/example1.txt');
  });
});
