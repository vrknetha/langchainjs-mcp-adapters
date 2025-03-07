import { MultiServerMCPClient } from '../client.js';
import { Resource } from '../types/mcp-types.js';
import logger from '../logger.js';
import { z } from 'zod';

/**
 * Default timeout for resource operations in milliseconds
 */
const DEFAULT_TIMEOUT = 5000;

// Define the expected response schema
const ResourcesListResponseSchema = z.object({
  resources: z.array(
    z.object({
      uri: z.string(),
      description: z.string().optional(),
      meta: z.record(z.string(), z.any()).optional(),
      mimeType: z.string(),
    })
  ),
});

// Add this near the other schemas at the top of the file
const ResourceReadResponseSchema = z.object({
  content: z.any(),
});

/**
 * List all resources available on an MCP server
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param options Optional configuration
 * @returns Array of Resource objects
 */
export async function listResources(
  client: MultiServerMCPClient,
  serverName: string,
  options: { timeout?: number } = {}
): Promise<Resource[]> {
  const mcpClient = client.getClient(serverName);
  if (!mcpClient) {
    throw new Error(`Server ${serverName} not found`);
  }

  const timeout = options.timeout || DEFAULT_TIMEOUT;

  try {
    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout listing resources after ${timeout}ms`)), timeout)
    );

    // Use the correct client.request method with schema
    const requestPromise = mcpClient.request(
      { method: 'resources/list' },
      ResourcesListResponseSchema
    );

    // Race the request against the timeout
    let response;
    try {
      response = await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(`Invalid response from resources/list: ${error.message}`);
        return [];
      }
      throw error;
    }

    // Check if the response has a resources property
    if (!response || !response.resources) {
      logger.warn(`Invalid response from resources/list: ${JSON.stringify(response)}`);
      return [];
    }

    return response.resources as Resource[];
  } catch (error) {
    logger.error(`Failed to list resources from server ${serverName}: ${error}`);
    throw new Error(
      `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find resources by MIME type
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param mimeType The MIME type to filter by
 * @param options Optional configuration
 * @returns Filtered array of Resource objects
 */
export async function findResourcesByMimeType(
  client: MultiServerMCPClient,
  serverName: string,
  mimeType: string,
  options: { timeout?: number } = {}
): Promise<Resource[]> {
  const resources = await listResources(client, serverName, options);
  return resources.filter(resource => resource.mimeType === mimeType);
}

/**
 * Find resources by pattern matching against name, description, or URI
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param pattern String or RegExp to match against resource properties
 * @param options Optional configuration
 * @returns Filtered array of Resource objects
 */
export async function findResourcesByPattern(
  client: MultiServerMCPClient,
  serverName: string,
  pattern: string | RegExp,
  options: {
    timeout?: number;
    searchFields?: Array<'name' | 'description' | 'uri'>;
  } = {}
): Promise<Resource[]> {
  const resources = await listResources(client, serverName, options);
  const searchPattern = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const searchFields = options.searchFields || ['name', 'description', 'uri'];

  return resources.filter(resource => {
    return searchFields.some(field => {
      if (field === 'name' && resource.name) {
        return searchPattern.test(resource.name);
      }
      if (field === 'description' && resource.description) {
        return searchPattern.test(resource.description);
      }
      if (field === 'uri' && resource.uri) {
        return searchPattern.test(resource.uri);
      }
      return false;
    });
  });
}

/**
 * Get a specific resource by URI
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param uri The resource URI to look for
 * @param options Optional configuration
 * @returns The found Resource or null if not found
 */
export async function getResourceByUri(
  client: MultiServerMCPClient,
  serverName: string,
  uri: string,
  options: { timeout?: number } = {}
): Promise<Resource | null> {
  const resources = await listResources(client, serverName, options);
  return resources.find(resource => resource.uri === uri) || null;
}

/**
 * Read the content of a resource
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param uri The resource URI to read
 * @param options Optional configuration
 * @returns The resource content or null if not found/error
 */
export async function readResourceContent(
  client: MultiServerMCPClient,
  serverName: string,
  uri: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const mcpClient = client.getClient(serverName);
  if (!mcpClient) {
    throw new Error(`Server ${serverName} not found`);
  }

  const timeout = options.timeout || DEFAULT_TIMEOUT;

  try {
    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout reading resource after ${timeout}ms`)), timeout)
    );

    // Use the correct client.request method with schema
    const requestPromise = mcpClient.request(
      {
        method: 'resources/read',
        params: {
          uri,
        },
      },
      ResourceReadResponseSchema
    );

    // Race the request against the timeout
    let response;
    try {
      response = await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(`Invalid response from resources/read: ${error.message}`);
        return null;
      }
      throw error;
    }

    // Check if the response has a content property
    if (!response || !response.content) {
      logger.warn(`Invalid response from resources/read: ${JSON.stringify(response)}`);
      return null;
    }

    return response.content;
  } catch (error) {
    logger.error(`Failed to read resource ${uri} from server ${serverName}: ${error}`);
    throw new Error(
      `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Group resources by mime type
 * @param resources Array of Resource objects
 * @returns Object mapping mime types to arrays of resources
 */
export function groupResourcesByMimeType(resources: Resource[]): Record<string, Resource[]> {
  return resources.reduce(
    (groups, resource) => {
      const mimeType = resource.mimeType || 'unknown';
      if (!groups[mimeType]) {
        groups[mimeType] = [];
      }
      groups[mimeType].push(resource);
      return groups;
    },
    {} as Record<string, Resource[]>
  );
}

/**
 * Get all resource mime types from a server
 * @param client The MultiServerMCPClient instance
 * @param serverName The name of the server to query
 * @param options Optional configuration
 * @returns Array of unique mime types
 */
export async function getResourceMimeTypes(
  client: MultiServerMCPClient,
  serverName: string,
  options: { timeout?: number } = {}
): Promise<string[]> {
  const resources = await listResources(client, serverName, options);
  const mimeTypes = new Set<string>();

  resources.forEach(resource => {
    if (resource.mimeType) {
      mimeTypes.add(resource.mimeType);
    }
  });

  return Array.from(mimeTypes);
}
