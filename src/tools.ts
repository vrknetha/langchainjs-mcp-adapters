import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import logger from './logger.js';

// Define the interfaces that may not be directly exported from the SDK
interface ContentItem {
  type: string;
  text?: string;
  [key: string]: any;
}

interface CallToolResult {
  isError?: boolean;
  content: ContentItem[] | any;
  [key: string]: any;
}

// Custom error class for tool exceptions
class ToolException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolException';
  }
}

/**
 * Process the result from calling an MCP tool.
 * Extracts text content when available for better agent compatibility.
 *
 * @param result - The result from the MCP tool call
 * @returns The processed result
 */
function _convertCallToolResult(result: CallToolResult): any {
  logger.debug('Processing MCP tool result:', JSON.stringify(result, null, 2));

  // Check for error in the response
  if (result.isError) {
    // Find the first text content for error message
    if (Array.isArray(result.content)) {
      const textContent = result.content.find((item: ContentItem) => item.type === 'text');
      if (textContent && textContent.text) {
        throw new ToolException(textContent.text);
      }
    }
    throw new ToolException('Tool execution failed');
  }

  // Simple extraction logic prioritizing text content for agent compatibility
  if (Array.isArray(result.content)) {
    // Find text content first - most compatible with agents
    const textContent = result.content.find((item: ContentItem) => item.type === 'text');
    if (textContent && textContent.text !== undefined) {
      return textContent.text;
    }

    // Return single content item or full array as appropriate
    return result.content.length === 1 ? result.content[0] : result.content;
  }

  // Return as-is for other formats
  return result;
}

/**
 * Convert a JSON Schema to a Zod schema using a simple direct implementation.
 *
 * @param jsonSchema - The JSON Schema to convert
 * @returns A Zod schema
 */
function _convertJsonSchemaToZod(jsonSchema: any): z.ZodTypeAny {
  try {
    if (!jsonSchema || jsonSchema.type !== 'object' || !jsonSchema.properties) {
      return z.object({});
    }

    const schemaShape: Record<string, z.ZodTypeAny> = {};

    Object.entries(jsonSchema.properties).forEach(([key, value]) => {
      const propSchema = value as any;

      // Handle basic types with simple conversion
      if (propSchema.type === 'string') {
        schemaShape[key] = z.string();
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        schemaShape[key] = z.number();
      } else if (propSchema.type === 'boolean') {
        schemaShape[key] = z.boolean();
      } else if (propSchema.type === 'array') {
        // Simple array handling
        schemaShape[key] = z.array(z.any());
      } else if (propSchema.type === 'object' && propSchema.properties) {
        // Simple recursion for nested objects
        schemaShape[key] = _convertJsonSchemaToZod(propSchema);
      } else {
        // Fallback for unknown types
        schemaShape[key] = z.any();
      }
    });

    return z.object(schemaShape);
  } catch (error) {
    logger.warn(`Error converting JSON Schema to Zod: ${error}`);
    return z.object({});
  }
}

/**
 * Normalize input for MCP tools.
 * This handles common formatting issues from agents without implementing
 * tool-specific logic.
 *
 * @param input - The input to normalize
 * @returns Normalized input as a record
 */
function _normalizeInput(input: any): Record<string, any> {
  logger.debug('Normalizing input:', input);

  // If the input is already a properly structured object, return it
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length > 0
  ) {
    logger.debug('Input is already a valid object, returning as-is');
    return input;
  }

  // If input is a string, try to parse it as JSON or JSON-like format
  if (typeof input === 'string') {
    const inputStr = input.trim();

    // Handle markdown code blocks
    if (inputStr.includes('```')) {
      const codeBlockMatch = inputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          logger.debug('Successfully parsed JSON from code block:', parsed);
          return parsed;
        } catch (e) {
          logger.debug('Failed to parse JSON from code block, continuing with other methods');
        }
      }
    }

    // Try parsing as JSON-like string ({key: value} format)
    if (inputStr.startsWith('{') && inputStr.endsWith('}')) {
      try {
        // Fix common JSON issues with quotes
        const fixedJson = inputStr
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
          .replace(/:\s*'([^']*)'/g, ': "$1"');

        const parsed = JSON.parse(fixedJson);
        logger.debug('Successfully parsed JSON-like input:', parsed);
        return parsed;
      } catch (e) {
        logger.debug('Failed to parse as JSON, continuing with other methods');
      }
    }
  }

  // Return an empty object as fallback
  logger.debug('Returning empty object as fallback');
  return {};
}

/**
 * Convert an MCP tool to a LangChain tool.
 *
 * @param client - The MCP client
 * @param toolName - The name of the tool
 * @param toolDescription - The description of the tool
 * @param toolSchema - The schema of the tool
 * @returns A LangChain tool implementing StructuredToolInterface
 */
export function convertMcpToolToLangchainTool(
  client: Client,
  toolName: string,
  toolDescription: string,
  toolSchema: any
): StructuredToolInterface<z.ZodObject<any>> {
  // Convert the JSON schema to a Zod schema
  let zodSchema: z.ZodObject<any>;

  try {
    // Convert schema with simplified implementation
    if (toolSchema) {
      const convertedSchema = _convertJsonSchemaToZod(toolSchema);

      // Ensure we always have a ZodObject
      if (convertedSchema instanceof z.ZodObject) {
        zodSchema = convertedSchema;
      } else {
        // If it's not an object schema, wrap it
        zodSchema = z.object({ input: convertedSchema });
      }
    } else {
      logger.warn(
        `Tool "${toolName}" has no input schema definition. Some LLMs and agent implementations (especially React agents and Gemini models) require tools to have parameters.`
      );
      zodSchema = z.object({});
    }

    // Check if the schema is empty
    if (Object.keys(zodSchema.shape).length === 0) {
      logger.warn(
        `Tool "${toolName}" has an empty input schema. Some LLMs and agent implementations (especially React agents and Gemini models) require tools to have parameters.`
      );
      logger.debug(
        `Adapter will handle empty schema tools by accepting empty input objects for tool "${toolName}".`
      );
    }
  } catch (error) {
    logger.warn(`Error creating Zod schema for tool ${toolName}:`, error);
    zodSchema = z.object({});
  }

  // Create a class that extends StructuredTool
  class MCPToolAdapter extends StructuredTool {
    name = toolName;
    description = toolDescription;
    schema = zodSchema;

    constructor() {
      super();
    }

    // Simplified call method with clear error handling
    async call(input: unknown): Promise<string> {
      logger.debug(
        `Tool call received for ${this.name} with input:`,
        typeof input === 'string' ? `"${input}"` : JSON.stringify(input)
      );

      try {
        // For string inputs or non-object inputs, normalize
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
          const normalizedInput = _normalizeInput(input);
          return this._call(normalizedInput);
        }

        // For object inputs, use parent validation and handling
        return super.call(input);
      } catch (error: any) {
        // Simple fallback for validation errors only
        if (error.message?.includes('validation')) {
          logger.debug('Schema validation failed, trying with normalized input');
          return this._call(_normalizeInput(input));
        }
        throw error;
      }
    }

    // Simplified _call implementation
    protected async _call(input: Record<string, any>): Promise<string> {
      try {
        logger.debug(`Executing tool ${this.name} with input:`, input);

        // Call the tool with minimal preprocessing
        const result = await client.callTool({
          name: this.name,
          arguments: input,
        });

        // Process the result
        const typedResult: CallToolResult = {
          isError: result.isError === true,
          content: result.content || [],
        };

        const processedResult = _convertCallToolResult(typedResult);

        // Ensure string output for agent compatibility
        const finalResult = String(processedResult);
        logger.debug(`Final result from MCP tool ${this.name}:`, finalResult);

        return finalResult;
      } catch (error) {
        logger.error(`Error calling tool ${this.name}:`, error);
        throw new ToolException(`Error calling tool ${this.name}: ${error}`);
      }
    }
  }

  return new MCPToolAdapter();
}

/**
 * Load all tools from an MCP client.
 *
 * @param client - The MCP client
 * @returns A list of LangChain tools
 */
export async function loadMcpTools(
  client: Client
): Promise<StructuredToolInterface<z.ZodObject<any>>[]> {
  const tools: StructuredToolInterface<z.ZodObject<any>>[] = [];
  logger.debug('Listing available MCP tools...');
  const toolsResponse = await client.listTools();
  const toolsInfo = toolsResponse.tools;

  logger.info(`Found ${toolsInfo.length} MCP tools`);

  for (const toolInfo of toolsInfo) {
    logger.debug(`Converting MCP tool "${toolInfo.name}" to LangChain tool`);
    const tool = convertMcpToolToLangchainTool(
      client,
      toolInfo.name,
      toolInfo.description || '',
      toolInfo.inputSchema
    );
    tools.push(tool);
  }

  return tools;
}
