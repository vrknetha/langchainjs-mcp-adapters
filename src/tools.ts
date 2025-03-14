import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StructuredTool, StructuredToolInterface, Tool } from '@langchain/core/tools';
import { z } from 'zod';
import logger from './logger.js';

// Define the interfaces for content types
interface TextContent {
  type: 'text';
  text: string;
}

interface NonTextContent {
  type: string;
  [key: string]: unknown;
}

interface CallToolResult {
  isError?: boolean;
  content?: (TextContent | NonTextContent)[] | string | object;
  type?: string;
  [key: string]: unknown; // Allow other properties
}

/**
 * Custom error class for tool exceptions
 */
export class ToolException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolException';
  }
}

/**
 * Process the result from calling an MCP tool.
 * Extracts text content and non-text content for better agent compatibility.
 *
 * @param result - The result from the MCP tool call
 * @returns A tuple of [textContent, nonTextContent]
 */
function _convertCallToolResult(
  result: CallToolResult
): [string | string[], NonTextContent[] | null] {
  if (!result || !Array.isArray(result.content)) {
    return ['', null];
  }

  const textContents: TextContent[] = [];
  const nonTextContents: NonTextContent[] = [];

  // Separate text and non-text content
  for (const content of result.content) {
    if (content.type === 'text' && 'text' in content) {
      textContents.push(content as TextContent);
    } else {
      nonTextContents.push(content as NonTextContent);
    }
  }

  // Create the text content output
  const textOutput = textContents.map(content => content.text);
  const finalTextOutput = textOutput.length === 1 ? textOutput[0] : textOutput;

  // Check for errors
  if (result.isError) {
    logger.error('MCP tool returned an error result');
    throw new ToolException(
      typeof finalTextOutput === 'string' ? finalTextOutput : textOutput.join('\n')
    );
  }

  return [finalTextOutput, nonTextContents.length > 0 ? nonTextContents : null];
}

/**
 * Convert an MCP tool to a LangChain tool.
 *
 * @param client - The MCP client
 * @param tool - The MCP tool to convert
 * @returns A LangChain tool
 */
export function convertMcpToolToLangchainTool(
  client: Client,
  tool: { name: string; description?: string; inputSchema?: any }
): StructuredToolInterface {
  // Create a minimal MCPTool class extending StructuredTool
  class MCPTool extends StructuredTool {
    name = tool.name;
    description = tool.description || '';
    schema = z.object({}).passthrough();

    constructor() {
      super();
    }

    protected async _call(args: Record<string, unknown>): Promise<string> {
      try {
        const result = await client.callTool({
          name: tool.name,
          arguments: args,
        });

        const [textContent, _] = _convertCallToolResult({
          ...result,
          isError: result.isError === true,
          content: result.content || [],
        });

        return typeof textContent === 'string' ? textContent : textContent.join('\n');
      } catch (error) {
        if (error instanceof ToolException) {
          throw error;
        }
        throw new ToolException(`Error calling tool ${tool.name}: ${String(error)}`);
      }
    }
  }

  // Return an instance of our tool
  return new MCPTool();
}

/**
 * Load all tools from an MCP client.
 *
 * @param client - The MCP client
 * @returns A list of LangChain tools
 */
export async function loadMcpTools(client: Client): Promise<StructuredToolInterface[]> {
  try {
    // Get tools in a single operation
    const toolsResponse = await client.listTools();
    logger.info(`Found ${toolsResponse.tools?.length || 0} MCP tools`);

    // Filter out tools without names and convert in a single map operation
    return (toolsResponse.tools || [])
      .filter(tool => !!tool.name)
      .map(tool => {
        try {
          logger.debug(`Successfully loaded tool: ${tool.name}`);
          return convertMcpToolToLangchainTool(client, tool);
        } catch (error) {
          logger.error(`Failed to load tool "${tool.name}":`, error);
          return null;
        }
      })
      .filter(Boolean) as StructuredToolInterface[];
  } catch (error) {
    logger.error('Failed to list MCP tools:', error);
    return [];
  }
}
