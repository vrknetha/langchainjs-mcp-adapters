import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { JSONSchemaToZod } from '@dmitryrechkin/json-schema-to-zod';
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
 * Ensure the tool schema is valid for OpenAI by fixing common issues.
 *
 * @param schema - The tool schema to validate
 * @returns A valid schema
 */
function _ensureValidToolSchema(schema: any): any {
  if (!schema) return schema;

  try {
    // Make a deep copy of the schema to avoid modifying the original
    const validatedSchema = JSON.parse(JSON.stringify(schema));

    // Add checks for required and properties for root object
    if (validatedSchema.type === 'object') {
      if (!validatedSchema.required) {
        validatedSchema.required = [];
      }

      if (!validatedSchema.properties) {
        validatedSchema.properties = {};
      }

      // Apply fixes to the entire schema recursively
      fixArrayProperties(validatedSchema);
    }

    return validatedSchema;
  } catch (error) {
    logger.warn(`Error validating schema: ${error}`);
    return schema;
  }
}

/**
 * Recursively fix array properties in a schema by ensuring they have an 'items' property.
 * This helps ensure compatibility with OpenAI and other LLMs.
 *
 * @param obj - The schema object or sub-object to process
 */
function fixArrayProperties(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  // If this is an array type schema property, ensure it has an items property
  if (obj.type === 'array' && !obj.items) {
    logger.debug(`Adding missing 'items' property to array type`);

    // Special handling for known array properties that need specific items schemas
    if (obj.name === 'actions' || (obj.parent && obj.parent.property === 'actions')) {
      // Handle 'actions' property which needs object items with 'type' and 'selector'
      obj.items = {
        type: 'object',
        properties: {
          type: { type: 'string' },
          selector: { type: 'string' },
        },
      };
      logger.debug(`Added specific 'items' schema for 'actions' array property`);
    } else if (obj.name === 'formats' || (obj.parent && obj.parent.property === 'formats')) {
      // Handle 'formats' property which should have string items
      obj.items = { type: 'string' };
      logger.debug(`Added specific 'items' schema for 'formats' array property`);
    } else {
      // Default case - use string items for unknown array properties
      obj.items = { type: 'string' };
    }
  }

  // For objects with properties, traverse each property
  if (obj.properties && typeof obj.properties === 'object') {
    Object.entries(obj.properties).forEach(([key, value]) => {
      const prop = value as any;

      // Add parent and property name info for context
      if (prop && typeof prop === 'object') {
        prop.parent = { object: obj, property: key };
        prop.name = key;
      }

      // Recursively fix this property
      fixArrayProperties(prop);
    });
  }

  // For objects with array items with more complex structure
  if (obj.items && typeof obj.items === 'object') {
    // Add parent context
    obj.items.parent = { object: obj, property: 'items' };

    // Recursively fix array item definitions
    fixArrayProperties(obj.items);
  }

  // Handle patternProperties for regex-based properties
  if (obj.patternProperties && typeof obj.patternProperties === 'object') {
    Object.values(obj.patternProperties).forEach(patternProp => {
      if (patternProp && typeof patternProp === 'object') {
        fixArrayProperties(patternProp as any);
      }
    });
  }

  // Handle oneOf, anyOf, allOf for complex schemas
  ['oneOf', 'anyOf', 'allOf'].forEach(complexProp => {
    if (Array.isArray(obj[complexProp])) {
      obj[complexProp].forEach((subSchema: any) => {
        fixArrayProperties(subSchema);
      });
    }
  });
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
  // Ensure the schema is valid for OpenAI and other LLMs
  const validToolSchema = _ensureValidToolSchema(toolSchema);

  // Convert the JSON schema to a Zod schema
  let zodSchema: z.ZodObject<any>;

  try {
    if (validToolSchema) {
      // Use the third-party library for schema conversion
      const convertedSchema = JSONSchemaToZod.convert(validToolSchema);

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
