import { Document } from '@langchain/core/documents';
import {
  Resource,
  ResourceContent,
  ResourceSchema,
  ResourceContentSchema,
} from '../types/mcp-types.js';

/**
 * Converts an MCP resource and its content to a LangChain Document
 *
 * @param resource - The MCP resource metadata
 * @param content - The MCP resource content
 * @returns A LangChain Document with the resource content and metadata
 * @throws Error if the resource content is invalid
 */
export function resourceToDocument(resource: Resource, content: ResourceContent): Document {
  // Validate the resource and content using Zod schemas
  const resourceValidation = ResourceSchema.safeParse(resource);
  const contentValidation = ResourceContentSchema.safeParse(content);

  if (!resourceValidation.success) {
    throw new Error(`Invalid resource: ${resourceValidation.error.message}`);
  }

  if (!contentValidation.success) {
    throw new Error(`Invalid resource content: ${contentValidation.error.message}`);
  }

  // Use direct type conversion
  if (content.text !== undefined) {
    return new Document({
      pageContent: content.text,
      metadata: {
        uri: content.uri,
        mimeType: content.mimeType,
        resourceName: resource.name,
        resourceDescription: resource.description,
        source: content.uri, // Adding source for compatibility with LangChain retrievers
      },
    });
  } else if (content.blob !== undefined) {
    // Handle binary content
    const binaryContentPreview =
      typeof content.blob === 'string' ? '[Base64 encoded content]' : '[Binary content]';

    return new Document({
      pageContent: `${binaryContentPreview}: ${content.uri}`,
      metadata: {
        uri: content.uri,
        mimeType: content.mimeType,
        isBinary: true,
        binaryData: content.blob,
        resourceName: resource.name,
        resourceDescription: resource.description,
        source: content.uri, // Adding source for compatibility with LangChain retrievers
      },
    });
  }

  throw new Error('Invalid resource content: must contain either text or blob');
}

/**
 * Batch converts multiple MCP resources to LangChain Documents
 *
 * @param resources - Array of resource and content pairs
 * @returns Array of LangChain Documents
 */
export function resourcesToDocuments(
  resources: Array<{ resource: Resource; content: ResourceContent }>
): Document[] {
  return resources.map(({ resource, content }) => resourceToDocument(resource, content));
}

/**
 * Creates a LangChain Document from MCP resource read response
 *
 * @param response - The resource read response from MCP server
 * @returns A LangChain Document
 */
export function resourceResponseToDocument(response: {
  resource: Resource;
  content: ResourceContent;
}): Document {
  return resourceToDocument(response.resource, response.content);
}
