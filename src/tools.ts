import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { JSONSchemaToZod, type JSONSchema } from '@dmitryrechkin/json-schema-to-zod';
import logger from './logger.js';

// Define the interfaces that may not be directly exported from the SDK
interface ContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface CallToolResult {
  isError?: boolean;
  content: ContentItem[] | unknown;
  [key: string]: unknown;
}

// Schema traversal context types
interface SchemaPropertyParent {
  object: JSONSchema;
  property: string;
}

interface SchemaPropertyWithContext extends JSONSchema {
  parent?: SchemaPropertyParent;
  name?: string;
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
function _convertCallToolResult(result: CallToolResult): unknown {
  logger.debug('Processing MCP tool result:', JSON.stringify(result, null, 2));

  // Verify result object structure
  if (!result) {
    logger.warn('Received null or undefined result from MCP tool');
    return '';
  }

  // Check for error in the response
  if (result.isError) {
    logger.error('MCP tool returned an error result');
    // Find the first text content for error message
    if (Array.isArray(result.content)) {
      const textContent = result.content.find((item: ContentItem) => item.type === 'text');
      if (textContent && textContent.text) {
        logger.error(`Error content: ${textContent.text}`);
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
      logger.debug('Extracted text content from result');
      return textContent.text;
    }

    // Return single content item or full array as appropriate
    logger.debug(`Returning ${result.content.length === 1 ? 'single' : 'multiple'} content items`);
    return result.content.length === 1 ? result.content[0] : result.content;
  }

  // Return as-is for other formats
  logger.debug('Returning non-array content as-is');
  return result;
}

/**
 * Ensure the tool schema is valid for OpenAI by fixing common issues.
 *
 * @param schema - The tool schema to validate
 * @returns A valid schema
 */
function _ensureValidToolSchema(
  schema: JSONSchema | null | undefined
): JSONSchema | null | undefined {
  const startTime = Date.now();
  logger.debug('Starting schema validation and enhancement');

  if (!schema) {
    logger.debug('Schema is null or undefined, returning as-is');
    return schema;
  }

  try {
    // Make a deep copy of the schema to avoid modifying the original
    const validatedSchema = JSON.parse(JSON.stringify(schema)) as JSONSchema;
    logger.debug('Created deep copy of schema for validation');

    // Basic validation of schema structure
    if (typeof validatedSchema !== 'object') {
      logger.warn('Schema is not an object, returning original schema');
      return schema;
    }

    // Add checks for required and properties for root object
    if (validatedSchema.type === 'object') {
      if (!validatedSchema.required) {
        logger.debug('Adding empty required array to object schema');
        validatedSchema.required = [];
      }

      if (!validatedSchema.properties) {
        logger.debug('Adding empty properties object to object schema');
        validatedSchema.properties = {};
      }

      // Apply fixes to the entire schema recursively
      try {
        fixArrayProperties(validatedSchema);
        logger.debug('Successfully fixed array properties in schema');
      } catch (arrayFixError) {
        logger.warn(`Error while fixing array properties: ${arrayFixError}`);
        // Continue with the validation process despite array fixing errors
      }
    } else if (validatedSchema.type === 'array' && !validatedSchema.items) {
      // Handle root-level array schemas
      logger.debug('Root schema is array type without items, adding default items schema');
      validatedSchema.items = { type: 'string' };
    } else if (!validatedSchema.type) {
      logger.warn('Schema has no type specified, this may cause issues with some LLMs');
    }

    const duration = Date.now() - startTime;
    logger.debug(`Schema validation completed in ${duration}ms`);
    return validatedSchema;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.warn(`Error validating schema after ${duration}ms: ${error}`);

    // Return the original schema if validation fails
    return schema;
  }
}

/**
 * Recursively fix array properties in a schema by ensuring they have an 'items' property.
 * This helps ensure compatibility with OpenAI and other LLMs.
 *
 * @param obj - The schema object or sub-object to process
 */
function fixArrayProperties(obj: SchemaPropertyWithContext): void {
  // Early return for non-objects to prevent errors
  if (!obj || typeof obj !== 'object') {
    return;
  }

  // Track modifications for debugging
  let modificationsCount = 0;

  // If this is an array type schema property, ensure it has an items property
  if (obj.type === 'array' && !obj.items) {
    modificationsCount++;
    logger.debug(
      `Adding missing 'items' property to array type${obj.name ? ` (${obj.name})` : ''}`
    );

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
      logger.debug(`Added default string 'items' schema for array property`);
    }
  }

  // For objects with properties, traverse each property
  if (obj.properties && typeof obj.properties === 'object') {
    Object.entries(obj.properties).forEach(([key, value]) => {
      // Skip null or undefined properties
      if (!value) {
        logger.debug(`Skipping null or undefined property: ${key}`);
        return;
      }

      const prop = value as SchemaPropertyWithContext;

      // Add parent and property name info for context
      if (prop && typeof prop === 'object') {
        prop.parent = { object: obj, property: key };
        prop.name = key;
      }

      // Recursively fix this property
      try {
        fixArrayProperties(prop);
      } catch (error) {
        logger.warn(`Error fixing array property ${key}: ${error}`);
        // Continue with other properties
      }
    });
  }

  // For objects with array items with more complex structure
  if (obj.items && typeof obj.items === 'object') {
    try {
      // Add parent context
      const itemsWithContext = obj.items as SchemaPropertyWithContext;
      itemsWithContext.parent = { object: obj, property: 'items' };

      // Recursively fix array item definitions
      fixArrayProperties(itemsWithContext);
    } catch (error) {
      logger.warn(`Error processing array items schema: ${error}`);
      // Continue processing other parts of the schema
    }
  }

  // Handle patternProperties for regex-based properties
  if (obj.patternProperties && typeof obj.patternProperties === 'object') {
    Object.entries(obj.patternProperties).forEach(([pattern, patternProp]) => {
      if (patternProp && typeof patternProp === 'object') {
        try {
          const contextProp = patternProp as SchemaPropertyWithContext;
          contextProp.parent = { object: obj, property: `patternProperties[${pattern}]` };
          fixArrayProperties(contextProp);
        } catch (error) {
          logger.warn(`Error processing pattern property ${pattern}: ${error}`);
          // Continue with other pattern properties
        }
      }
    });
  }

  // Handle oneOf, anyOf, allOf for complex schemas
  ['oneOf', 'anyOf', 'allOf'].forEach(complexProp => {
    const complexProps = obj[complexProp] as JSONSchema[] | undefined;
    if (Array.isArray(complexProps)) {
      complexProps.forEach((subSchema, index) => {
        try {
          const contextSchema = subSchema as SchemaPropertyWithContext;
          contextSchema.parent = { object: obj, property: `${complexProp}[${index}]` };
          fixArrayProperties(contextSchema);
        } catch (error) {
          logger.warn(`Error processing ${complexProp}[${index}]: ${error}`);
          // Continue with other items in the complex property
        }
      });
    }
  });

  if (modificationsCount > 0) {
    logger.debug(
      `Made ${modificationsCount} modifications to schema object${obj.name ? ` (${obj.name})` : ''}`
    );
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
function _normalizeInput(input: unknown): Record<string, unknown> {
  const startTime = Date.now();
  logger.debug('Normalizing input:', typeof input === 'string' ? input : JSON.stringify(input));

  // Handle null/undefined input
  if (input === null || input === undefined) {
    logger.debug('Input is null or undefined, returning empty object');
    return {};
  }

  // If the input is already a properly structured object, return it
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input as object).length > 0
  ) {
    logger.debug('Input is already a valid object, returning as-is');
    return input as Record<string, unknown>;
  }

  // If input is a string, try to parse it as JSON or JSON-like format
  if (typeof input === 'string') {
    const inputStr = input.trim();

    // Skip empty strings
    if (inputStr === '') {
      logger.debug('Input is an empty string, returning empty object');
      return {};
    }

    // Handle markdown code blocks
    if (inputStr.includes('```')) {
      logger.debug('Detected markdown code block in input, attempting to extract');
      const codeBlockMatch = inputStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        try {
          const codeContent = codeBlockMatch[1].trim();
          logger.debug(`Extracted code block content: ${codeContent}`);
          const parsed = JSON.parse(codeContent);
          logger.debug('Successfully parsed JSON from code block:', parsed);

          const duration = Date.now() - startTime;
          logger.debug(`Input normalization completed in ${duration}ms (code block parsing)`);
          return parsed as Record<string, unknown>;
        } catch (e) {
          logger.debug(`Failed to parse JSON from code block: ${e}`);
          // Continue with other methods
        }
      } else {
        logger.debug('Could not extract valid content from code block');
      }
    }

    // Try parsing as JSON-like string ({key: value} format)
    if (inputStr.startsWith('{') && inputStr.endsWith('}')) {
      logger.debug('Detected JSON-like object string, attempting to parse');
      try {
        // Fix common JSON issues with quotes
        const fixedJson = inputStr
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
          .replace(/:\s*'([^']*)'/g, ': "$1"');

        if (fixedJson !== inputStr) {
          logger.debug(`Fixed JSON formatting issues: ${fixedJson}`);
        }

        const parsed = JSON.parse(fixedJson);
        logger.debug('Successfully parsed JSON-like input:', parsed);

        const duration = Date.now() - startTime;
        logger.debug(`Input normalization completed in ${duration}ms (JSON-like parsing)`);
        return parsed as Record<string, unknown>;
      } catch (e) {
        logger.debug(`Failed to parse as JSON: ${e}`);
        // Continue with other methods
      }
    }

    // For single-value inputs, try to create a simple object with "input" property
    if (!inputStr.includes(':') && !inputStr.includes('{')) {
      logger.debug('Input appears to be a simple value, creating {input: value} object');
      const duration = Date.now() - startTime;
      logger.debug(`Input normalization completed in ${duration}ms (simple value wrapping)`);
      return { input: inputStr };
    }
  }

  // For array inputs, convert to {inputs: array} format
  if (Array.isArray(input)) {
    logger.debug('Input is an array, converting to {inputs: array} format');
    const duration = Date.now() - startTime;
    logger.debug(`Input normalization completed in ${duration}ms (array wrapping)`);
    return { inputs: input };
  }

  // For primitive types, wrap in an object
  if (typeof input === 'number' || typeof input === 'boolean') {
    logger.debug(`Input is a primitive type (${typeof input}), wrapping as {value: ${input}}`);
    const duration = Date.now() - startTime;
    logger.debug(`Input normalization completed in ${duration}ms (primitive wrapping)`);
    return { value: input };
  }

  // Return an empty object as fallback
  const duration = Date.now() - startTime;
  logger.debug(`Input normalization completed in ${duration}ms (empty object fallback)`);
  logger.warn('Could not normalize input, returning empty object');
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
  toolSchema: JSONSchema | null | undefined
): StructuredToolInterface<z.ZodObject<any>> {
  // Ensure the schema is valid for OpenAI and other LLMs
  const validToolSchema = _ensureValidToolSchema(toolSchema);

  // Convert the JSON schema to a Zod schema
  let zodSchema: z.ZodObject<any>;
  const schemaStartTime = Date.now();

  try {
    if (validToolSchema) {
      logger.debug(`Converting JSON schema for tool "${toolName}" to Zod schema`);

      try {
        // Use the third-party library for schema conversion
        const convertedSchema = JSONSchemaToZod.convert(validToolSchema);
        logger.debug(`Successfully converted schema for "${toolName}"`);

        // Ensure we always have a ZodObject
        if (convertedSchema instanceof z.ZodObject) {
          zodSchema = convertedSchema;
          logger.debug(`Schema for "${toolName}" is already a ZodObject`);
        } else {
          // If it's not an object schema, wrap it
          logger.debug(`Wrapping non-object schema for "${toolName}" in a ZodObject`);
          zodSchema = z.object({ input: convertedSchema });
        }
      } catch (conversionError) {
        logger.error(`Schema conversion error for "${toolName}":`, conversionError);
        logger.debug(`Falling back to empty object schema for "${toolName}"`);
        zodSchema = z.object({});
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
    } else {
      logger.debug(
        `Schema for "${toolName}" has ${Object.keys(zodSchema.shape).length} properties`
      );
    }
  } catch (error) {
    const schemaConversionTime = Date.now() - schemaStartTime;
    logger.error(
      `Error creating Zod schema for tool ${toolName} after ${schemaConversionTime}ms:`,
      error
    );
    zodSchema = z.object({});
    logger.debug(`Using fallback empty schema for tool "${toolName}"`);
  }

  const schemaConversionTime = Date.now() - schemaStartTime;
  logger.debug(`Schema conversion for "${toolName}" completed in ${schemaConversionTime}ms`);

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
      } catch (error) {
        // Simple fallback for validation errors only
        if (error instanceof Error && error.message?.includes('validation')) {
          logger.debug('Schema validation failed, trying with normalized input');
          return this._call(_normalizeInput(input));
        }
        throw error;
      }
    }

    // Simplified _call implementation
    protected async _call(input: Record<string, unknown>): Promise<string> {
      let callStartTime: number | null = null;
      try {
        callStartTime = Date.now();
        logger.debug(`Executing tool ${this.name} with input:`, input);

        if (!client) {
          logger.error(`Invalid MCP client for tool ${this.name}`);
          throw new ToolException(`Cannot execute tool ${this.name}: MCP client is not available`);
        }

        // Call the tool with minimal preprocessing
        const result = await client.callTool({
          name: this.name,
          arguments: input,
        });

        if (callStartTime) {
          const callDuration = Date.now() - callStartTime;
          logger.debug(`Tool ${this.name} execution completed in ${callDuration}ms`);
        }

        // Verify result is properly formed
        if (!result) {
          logger.warn(`Tool ${this.name} returned null or undefined result`);
          return '';
        }

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
        // Log with execution time if available
        if (callStartTime) {
          const callDuration = Date.now() - callStartTime;
          logger.error(`Error calling tool ${this.name} after ${callDuration}ms:`, error);
        } else {
          logger.error(`Error calling tool ${this.name}:`, error);
        }

        // Detailed error logging for different error types
        if (error instanceof ToolException) {
          logger.error(`Tool exception in ${this.name}:`, error.message);
          throw error; // Re-throw tool exceptions as they're already properly formatted
        } else if (error instanceof Error) {
          // Convert generic errors to ToolExceptions
          const errorMessage = `Error calling tool ${this.name}: ${error.message}`;
          logger.error(errorMessage);
          throw new ToolException(errorMessage);
        } else {
          // Handle non-Error objects
          const errorMessage = `Unknown error calling tool ${this.name}: ${String(error)}`;
          logger.error(errorMessage);
          throw new ToolException(errorMessage);
        }
      } finally {
        // Cleanup operation tracking (useful for logging/monitoring)
        if (callStartTime) {
          const totalDuration = Date.now() - callStartTime;
          logger.debug(`Total processing time for tool ${this.name}: ${totalDuration}ms`);
        }
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
  const startTime = Date.now();
  const tools: StructuredToolInterface<z.ZodObject<any>>[] = [];
  let successCount = 0;
  let errorCount = 0;

  logger.debug('Listing available MCP tools...');

  try {
    const toolsResponse = await client.listTools();
    const toolsInfo = toolsResponse.tools || [];

    logger.info(`Found ${toolsInfo.length} MCP tools`);

    // Track loading progress
    for (const toolInfo of toolsInfo) {
      try {
        logger.debug(`Converting MCP tool "${toolInfo.name}" to LangChain tool`);

        // Verify required tool properties
        if (!toolInfo.name) {
          logger.warn('Skipping tool with missing name');
          errorCount++;
          continue;
        }

        const tool = convertMcpToolToLangchainTool(
          client,
          toolInfo.name,
          toolInfo.description || '',
          toolInfo.inputSchema as JSONSchema
        );

        tools.push(tool);
        successCount++;
        logger.debug(`Successfully loaded tool: ${toolInfo.name}`);
      } catch (error) {
        errorCount++;
        logger.error(`Failed to load tool "${toolInfo.name || 'unnamed'}":`, error);
        // Continue loading other tools despite this error
      }
    }
  } catch (error) {
    logger.error('Failed to list MCP tools:', error);
    // Return any tools we managed to load before the error
  } finally {
    const duration = Date.now() - startTime;
    logger.info(
      `Tool loading complete. Loaded ${successCount} tools, ${errorCount} failed, in ${duration}ms`
    );
  }

  return tools;
}
