import { MultiServerMCPClient } from '../client.js';
import { PromptDefinition } from '../types/mcp-types.js';
import logger from '../logger.js';
import { z } from 'zod';

/**
 * Default timeout for prompt operations in milliseconds
 */
const DEFAULT_TIMEOUT = 5000;

// Define the expected response schema
const PromptsListResponseSchema = z.object({
  prompts: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      arguments: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            required: z.boolean().optional(),
            schema: z.any().optional(),
          })
        )
        .optional(),
    })
  ),
});

/**
 * List all prompts available on an MCP server
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param options Optional configuration
 * @returns Array of PromptDefinition objects
 */
export async function listPrompts(
  client: MultiServerMCPClient,
  serverName: string,
  options: { timeout?: number } = {}
): Promise<PromptDefinition[]> {
  const mcpClient = client.getClient(serverName);
  if (!mcpClient) {
    throw new Error(`Server ${serverName} not found`);
  }

  const timeout = options.timeout || DEFAULT_TIMEOUT;

  try {
    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout listing prompts after ${timeout}ms`)), timeout)
    );

    // Use the correct client.request method with schema
    const requestPromise = mcpClient.request({ method: 'prompts/list' }, PromptsListResponseSchema);

    // Race the request against the timeout
    let response;
    try {
      response = await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(`Invalid response from prompts/list: ${error.message}`);
        return [];
      }
      throw error;
    }

    // Check if the response has a prompts property
    if (!response || !response.prompts) {
      logger.warn(`Invalid response from prompts/list: ${JSON.stringify(response)}`);
      return [];
    }

    return response.prompts as PromptDefinition[];
  } catch (error) {
    logger.error(`Failed to list prompts from server ${serverName}: ${error}`);
    throw new Error(
      `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get details for a specific prompt by name
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param promptName The name of the prompt to find
 * @param options Optional configuration
 * @returns PromptDefinition or null if not found
 */
export async function getPromptDetails(
  client: MultiServerMCPClient,
  serverName: string,
  promptName: string,
  options: { timeout?: number } = {}
): Promise<PromptDefinition | null> {
  const prompts = await listPrompts(client, serverName, options);
  return prompts.find(p => p.name === promptName) || null;
}

/**
 * Find prompts matching a pattern in name or description
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param pattern Regular expression pattern to match against prompt name or description
 * @param options Optional configuration
 * @returns Array of matching PromptDefinition objects
 */
export async function findPromptsByPattern(
  client: MultiServerMCPClient,
  serverName: string,
  pattern: string | RegExp,
  options: { timeout?: number } = {}
): Promise<PromptDefinition[]> {
  const prompts = await listPrompts(client, serverName, options);
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');

  return prompts.filter(
    prompt => regex.test(prompt.name) || (prompt.description && regex.test(prompt.description))
  );
}

/**
 * Group prompts by a common pattern or category
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param categoryExtractor Function that extracts a category from a prompt name
 * @param options Optional configuration
 * @returns Record mapping categories to arrays of PromptDefinition objects
 */
export async function groupPromptsByCategory(
  client: MultiServerMCPClient,
  serverName: string,
  categoryExtractor: (promptName: string) => string,
  options: { timeout?: number } = {}
): Promise<Record<string, PromptDefinition[]>> {
  const prompts = await listPrompts(client, serverName, options);
  const groupedPrompts: Record<string, PromptDefinition[]> = {};

  for (const prompt of prompts) {
    const category = categoryExtractor(prompt.name);
    if (!groupedPrompts[category]) {
      groupedPrompts[category] = [];
    }
    groupedPrompts[category].push(prompt);
  }

  return groupedPrompts;
}

/**
 * Get the arguments required by a prompt
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param promptName The name of the prompt
 * @param options Optional configuration
 * @returns Array of argument names, empty array if prompt not found or has no arguments
 */
export async function getPromptArguments(
  client: MultiServerMCPClient,
  serverName: string,
  promptName: string,
  options: { timeout?: number; requiredOnly?: boolean } = {}
): Promise<string[]> {
  const prompt = await getPromptDetails(client, serverName, promptName, options);

  if (!prompt || !prompt.arguments) {
    return [];
  }

  if (options.requiredOnly) {
    return prompt.arguments.filter(arg => arg.required).map(arg => arg.name);
  }

  return prompt.arguments.map(arg => arg.name);
}

/**
 * Check if a prompt exists on the server
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param promptName The name of the prompt to check
 * @param options Optional configuration
 * @returns Boolean indicating if the prompt exists
 */
export async function promptExists(
  client: MultiServerMCPClient,
  serverName: string,
  promptName: string,
  options: { timeout?: number } = {}
): Promise<boolean> {
  const prompt = await getPromptDetails(client, serverName, promptName, options);
  return prompt !== null;
}
