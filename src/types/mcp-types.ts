import { z } from 'zod';

/**
 * MCP Resource Types
 * Based on https://modelcontextprotocol.io/docs/concepts/resources
 */

/**
 * Represents metadata about a resource in the MCP system
 */
export interface Resource {
  /** Unique identifier for the resource */
  uri: string;
  /** Optional name of the resource */
  name?: string;
  /** Optional description of the resource */
  description?: string;
  /** Optional MIME type of the resource */
  mimeType?: string;
}

/**
 * Represents the content of a resource in the MCP system
 */
export interface ResourceContent {
  /** URI that matches a Resource */
  uri: string;
  /** Optional MIME type of the content */
  mimeType?: string;
  /** Text content, if the resource is text-based */
  text?: string;
  /** Binary content, either as Uint8Array or base64 string */
  blob?: Uint8Array | string;
}

/**
 * Represents a resource list response from the MCP server
 */
export interface ResourceListResponse {
  resources: Resource[];
}

/**
 * Represents a resource read response from the MCP server
 */
export interface ResourceReadResponse {
  resource: Resource;
  content: ResourceContent;
}

/**
 * MCP Message Types
 * Based on https://modelcontextprotocol.io/docs/concepts/prompts
 */

/**
 * Represents a message in the MCP system
 */
export interface Message {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Content of the message */
  content: MessageContent;
}

/**
 * Represents text content in a message
 */
export interface TextContent {
  /** Indicates this is text content */
  type: 'text';
  /** The text content */
  text: string;
}

/**
 * Represents a reference to a resource in a message
 */
export interface ResourceContentReference {
  /** Indicates this is a resource reference */
  type: 'resource';
  /** The referenced resource */
  resource: {
    /** URI of the resource */
    uri: string;
    /** Optional text content of the resource */
    text?: string;
    /** Optional MIME type of the resource */
    mimeType?: string;
  };
}

/**
 * Union type for message content
 */
export type MessageContent = TextContent | ResourceContentReference;

/**
 * MCP Prompt Types
 * Based on https://modelcontextprotocol.io/docs/concepts/prompts
 */

/**
 * Represents a prompt definition in the MCP system
 */
export interface PromptDefinition {
  /** Name of the prompt */
  name: string;
  /** Optional description of the prompt */
  description?: string;
  /** Optional array of arguments the prompt accepts */
  arguments?: PromptArgument[];
  /** Optional list of example messages */
  examples?: Message[][];
}

/**
 * Represents an argument for a prompt
 */
export interface PromptArgument {
  /** Name of the argument */
  name: string;
  /** Optional description of the argument */
  description?: string;
  /** Whether the argument is required (defaults to false) */
  required?: boolean;
  /** Optional type of the argument */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

/**
 * Represents a prompt execution request to the MCP server
 */
export interface PromptExecuteRequest {
  /** Name of the prompt to execute */
  promptName: string;
  /** Arguments to pass to the prompt */
  arguments: Record<string, any>;
}

/**
 * Represents a prompt execution response from the MCP server
 */
export interface PromptExecuteResponse {
  /** Messages generated from executing the prompt */
  messages: Message[];
}

/**
 * Represents a prompt list response from the MCP server
 */
export interface PromptListResponse {
  prompts: PromptDefinition[];
}

/**
 * Type Guards
 */

/**
 * Checks if content is text content
 */
export function isTextContent(content: MessageContent): content is TextContent {
  return content.type === 'text';
}

/**
 * Checks if content is a resource reference
 */
export function isResourceContent(content: MessageContent): content is ResourceContentReference {
  return content.type === 'resource';
}

/**
 * Zod Schemas for Validation
 */

/**
 * Schema for validating Resource objects
 */
export const ResourceSchema = z.object({
  uri: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

/**
 * Schema for validating ResourceContent objects
 */
export const ResourceContentSchema = z
  .object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.union([z.instanceof(Uint8Array), z.string()]).optional(),
  })
  .refine(data => data.text !== undefined || data.blob !== undefined, {
    message: 'Either text or blob must be provided',
  });

/**
 * Schema for validating TextContent objects
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Schema for validating ResourceContentReference objects
 */
export const ResourceContentReferenceSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({
    uri: z.string(),
    text: z.string().optional(),
    mimeType: z.string().optional(),
  }),
});

/**
 * Schema for validating MessageContent objects
 */
export const MessageContentSchema = z.union([TextContentSchema, ResourceContentReferenceSchema]);

/**
 * Schema for validating Message objects
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: MessageContentSchema,
});

/**
 * Schema for validating PromptArgument objects
 */
export const PromptArgumentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']).optional(),
});

/**
 * Schema for validating PromptDefinition objects
 */
export const PromptDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(PromptArgumentSchema).optional(),
  examples: z.array(z.array(MessageSchema)).optional(),
});
