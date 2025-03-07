import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StructuredTool } from '@langchain/core/tools';
import { loadMcpTools } from './tools.js';
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

type StdioConnection = {
  transport: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
  encoding?: string;
  encodingErrorHandler?: 'strict' | 'ignore' | 'replace';
};

type SSEConnection = {
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
  useNodeEventSource?: boolean;
};

type ProgrammaticConnection = {
  transport: 'programmatic';
  server: Server;
};

type Connection = StdioConnection | SSEConnection | ProgrammaticConnection;

type MCPConfig = {
  servers: Record<string, Connection>;
};

/**
 * Client for connecting to multiple MCP servers and loading LangChain-compatible tools.
 */
export class MultiServerMCPClient {
  private clients: Map<string, Client> = new Map();
  private serverNameToTools: Map<string, StructuredTool[]> = new Map();
  private connections?: Record<string, Connection>;
  private cleanupFunctions: Array<() => Promise<void>> = [];

  /**
   * Create a new MultiServerMCPClient.
   *
   * @param connections - Optional connections to initialize
   */
  constructor(connections?: Record<string, any>) {
    if (connections) {
      // Process connections to ensure they have the correct format
      const processedConnections: Record<string, Connection> = {};

      for (const [serverName, config] of Object.entries(connections)) {
        if (typeof config === 'object' && config !== null) {
          if ('transport' in config && config.transport === 'sse') {
            // SSE connection
            if (!('url' in config) || typeof config.url !== 'string') {
              logger.warn(
                `Invalid SSE connection for server "${serverName}": missing or invalid URL`
              );
              continue;
            }

            const connection: SSEConnection = {
              transport: 'sse',
              url: config.url,
            };

            if (
              'headers' in config &&
              typeof config.headers === 'object' &&
              config.headers !== null
            ) {
              connection.headers = config.headers as Record<string, string>;
            }

            if ('useNodeEventSource' in config && typeof config.useNodeEventSource === 'boolean') {
              connection.useNodeEventSource = config.useNodeEventSource;
            }

            processedConnections[serverName] = connection;
          } else if ('transport' in config && config.transport === 'programmatic') {
            // Programmatic connection
            if (
              !('server' in config) ||
              typeof config.server !== 'object' ||
              config.server === null
            ) {
              logger.warn(
                `Invalid programmatic connection for server "${serverName}": missing or invalid server instance`
              );
              continue;
            }

            const connection: ProgrammaticConnection = {
              transport: 'programmatic',
              server: config.server,
            };

            processedConnections[serverName] = connection;
          } else {
            // Default to stdio connection
            if (!('command' in config) || typeof config.command !== 'string') {
              logger.warn(
                `Invalid stdio connection for server "${serverName}": missing or invalid command`
              );
              continue;
            }

            if (!('args' in config) || !Array.isArray(config.args)) {
              logger.warn(
                `Invalid stdio connection for server "${serverName}": missing or invalid args`
              );
              continue;
            }

            const connection: StdioConnection = {
              transport: 'stdio',
              command: config.command,
              args: config.args,
            };

            if ('env' in config && typeof config.env === 'object' && config.env !== null) {
              connection.env = config.env as Record<string, string>;
            }

            if ('encoding' in config && typeof config.encoding === 'string') {
              connection.encoding = config.encoding;
            }

            if (
              'encodingErrorHandler' in config &&
              typeof config.encodingErrorHandler === 'string' &&
              ['strict', 'ignore', 'replace'].includes(config.encodingErrorHandler)
            ) {
              connection.encodingErrorHandler = config.encodingErrorHandler as
                | 'strict'
                | 'ignore'
                | 'replace';
            }

            processedConnections[serverName] = connection;
          }
        }
      }

      this.connections = processedConnections;
    }
  }

  /**
   * Load a configuration from a JSON file.
   *
   * @param configPath - Path to the configuration file
   * @returns A new MultiServerMCPClient
   */
  static fromConfigFile(configPath: string): MultiServerMCPClient {
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData) as MCPConfig;
      logger.info(`Loaded MCP configuration from ${configPath}`);
      return new MultiServerMCPClient(config.servers);
    } catch (error) {
      logger.error(`Failed to load MCP configuration from ${configPath}: ${error}`);
      throw new Error(`Failed to load MCP configuration: ${error}`);
    }
  }

  /**
   * Initialize connections to all servers.
   *
   * @returns A map of server names to arrays of tools
   */
  async initializeConnections(): Promise<Map<string, StructuredTool[]>> {
    if (!this.connections) {
      logger.warn('No connections to initialize');
      return new Map();
    }

    for (const [serverName, connection] of Object.entries(this.connections)) {
      try {
        logger.info(`Initializing connection to server "${serverName}"...`);

        let client: Client;
        let cleanup: () => Promise<void>;

        if (connection.transport === 'stdio') {
          const { command, args, env } = connection;

          logger.debug(
            `Creating stdio transport for server "${serverName}" with command: ${command} ${args.join(' ')}`
          );

          const transport = new StdioClientTransport({
            command,
            args,
            env,
          });

          client = new Client({
            name: 'langchain-mcp-adapter',
            version: '0.1.0',
          });
          await client.connect(transport);

          cleanup = async () => {
            logger.debug(`Closing stdio transport for server "${serverName}"`);
            await transport.close();
          };
        } else if (connection.transport === 'sse') {
          const { url, headers, useNodeEventSource } = connection;

          logger.debug(`Creating SSE transport for server "${serverName}" with URL: ${url}`);

          let transport;

          if (headers) {
            logger.debug(`Using custom headers for SSE transport to server "${serverName}"`);

            const transportOptions: any = {
              requestInit: {
                headers: headers,
              },
            };

            // If useNodeEventSource is true, set up the EventSource for Node.js
            if (useNodeEventSource) {
              try {
                // Dynamically import the eventsource package
                const EventSourceModule = await import('eventsource');
                const EventSource = EventSourceModule.default;

                // Define EventSource globally
                (globalThis as any).EventSource = EventSource;

                logger.debug(`Using Node.js EventSource for server "${serverName}"`);

                // Add eventSourceInit with fetch function for Node.js
                transportOptions.eventSourceInit = {
                  headers: headers,
                };
              } catch (error) {
                logger.warn(
                  `Failed to load eventsource package for server "${serverName}". Headers may not be applied to SSE connection: ${error}`
                );
              }
            }

            transport = new SSEClientTransport(new URL(url), transportOptions);
          } else {
            transport = new SSEClientTransport(new URL(url));
          }

          client = new Client({
            name: 'langchain-mcp-adapter',
            version: '0.1.0',
          });
          await client.connect(transport);

          cleanup = async () => {
            logger.debug(`Closing SSE transport for server "${serverName}"`);
            await transport.close();
          };
        } else if (connection.transport === 'programmatic') {
          const { server } = connection;

          logger.debug(`Creating programmatic connection for server "${serverName}"`);

          // Create a pair of linked in-memory transports
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

          // Connect the server to the transport
          server.connect(serverTransport);

          // Create a client and connect it to the transport
          client = new Client({
            name: 'langchain-mcp-adapter',
            version: '0.1.0',
          });

          await client.connect(clientTransport);

          cleanup = async () => {
            logger.debug(`Closing programmatic connection for server "${serverName}"`);
            await client.close();
          };
        } else {
          // This should never happen due to the validation in the constructor
          logger.error(`Unsupported transport type for server "${serverName}"`);
          continue;
        }

        this.clients.set(serverName, client);
        this.cleanupFunctions.push(cleanup);

        // Load tools for this server
        try {
          logger.debug(`Loading tools for server "${serverName}"...`);
          const tools = await loadMcpTools(client);
          this.serverNameToTools.set(serverName, tools);
          logger.info(`Successfully loaded ${tools.length} tools from server "${serverName}"`);
        } catch (error) {
          logger.error(`Failed to load tools from server "${serverName}": ${error}`);
        }
      } catch (error) {
        logger.error(`Failed to connect to server "${serverName}": ${error}`);
      }
    }

    return this.serverNameToTools;
  }

  /**
   * Get all tools from all servers.
   *
   * @returns A map of server names to arrays of tools
   */
  getTools(): Map<string, StructuredTool[]> {
    return this.serverNameToTools;
  }

  /**
   * Get a client for a specific server.
   *
   * @param serverName - The name of the server
   * @returns The client for the server, or undefined if the server is not connected
   */
  getClient(serverName: string): Client | undefined {
    return this.clients.get(serverName);
  }

  /**
   * Close all connections.
   */
  async close(): Promise<void> {
    logger.info('Closing all MCP connections...');

    for (const cleanup of this.cleanupFunctions) {
      try {
        await cleanup();
      } catch (error) {
        logger.error(`Error during cleanup: ${error}`);
      }
    }

    this.cleanupFunctions = [];
    this.clients.clear();
    this.serverNameToTools.clear();

    logger.info('All MCP connections closed');
  }

  /**
   * Connect to an MCP server programmatically by providing a Server instance.
   *
   * @param serverName - A name to identify this server
   * @param serverInstance - An instance of an MCP Server
   * @returns A map of server names to arrays of tools
   */
  async connectToServer(
    serverName: string,
    serverInstance: Server
  ): Promise<Map<string, StructuredTool[]>> {
    logger.info(`Connecting to server "${serverName}" programmatically...`);

    const connection: ProgrammaticConnection = {
      transport: 'programmatic',
      server: serverInstance,
    };

    const connections: Record<string, Connection> = {
      [serverName]: connection,
    };

    this.connections = connections;
    return this.initializeConnections();
  }

  /**
   * Connect to an MCP server via stdio transport.
   *
   * @param serverName - A name to identify this server
   * @param command - The command to run
   * @param args - Arguments for the command
   * @param env - Optional environment variables
   * @returns A map of server names to arrays of tools
   */
  async connectToServerViaStdio(
    serverName: string,
    command: string,
    args: string[],
    env?: Record<string, string>
  ): Promise<Map<string, StructuredTool[]>> {
    const connections: Record<string, Connection> = {
      [serverName]: {
        transport: 'stdio',
        command,
        args,
        env,
      },
    };

    this.connections = connections;
    return this.initializeConnections();
  }

  /**
   * Connect to an MCP server via SSE transport.
   *
   * @param serverName - A name to identify this server
   * @param url - The URL of the SSE server
   * @param headers - Optional headers to include in the requests
   * @param useNodeEventSource - Whether to use Node.js EventSource (requires eventsource package)
   * @returns A map of server names to arrays of tools
   */
  async connectToServerViaSSE(
    serverName: string,
    url: string,
    headers?: Record<string, string>,
    useNodeEventSource?: boolean
  ): Promise<Map<string, StructuredTool[]>> {
    const connection: SSEConnection = {
      transport: 'sse',
      url,
    };

    if (headers) {
      connection.headers = headers;
    }

    if (useNodeEventSource) {
      connection.useNodeEventSource = useNodeEventSource;
    }

    const connections: Record<string, Connection> = {
      [serverName]: connection,
    };

    this.connections = connections;
    return this.initializeConnections();
  }
}
