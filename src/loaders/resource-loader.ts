import { BaseDocumentLoader } from 'langchain/document_loaders/base';
import { Document } from '@langchain/core/documents';
import { MultiServerMCPClient } from '../client.js';
import { Resource, ResourceContent } from '../types/mcp-types.js';
import { resourceToDocument } from '../adapters/resource-adapters.js';

/**
 * Options for configuring the MCP Resource Loader
 */
export interface MCPResourceLoaderOptions {
  /**
   * Filter resources by MIME type
   */
  mimeTypeFilter?: string;

  /**
   * Regular expression pattern to include resources (applied to URI)
   */
  includePattern?: RegExp;

  /**
   * Regular expression pattern to exclude resources (applied to URI)
   */
  excludePattern?: RegExp;

  /**
   * Maximum number of resources to load
   */
  limit?: number;
}

/**
 * Document loader for loading resources from an MCP server
 */
export class MCPResourceLoader extends BaseDocumentLoader {
  private client: MultiServerMCPClient;
  private serverId: string;
  private resourceUris?: string[];
  private options?: MCPResourceLoaderOptions;

  /**
   * Create a new MCP Resource Loader
   *
   * @param client - The MCP client instance
   * @param serverId - The server ID to use with the client
   * @param resourceUris - Optional list of specific resource URIs to load
   * @param options - Optional configuration options for filtering resources
   */
  constructor(
    client: MultiServerMCPClient,
    serverId: string,
    resourceUris?: string[],
    options?: MCPResourceLoaderOptions
  ) {
    super();
    this.client = client;
    this.serverId = serverId;
    this.resourceUris = resourceUris;
    this.options = options;
  }

  /**
   * Load resources from the MCP server and convert them to LangChain documents
   *
   * @returns Promise resolving to an array of Document objects
   */
  async load(): Promise<Document[]> {
    const mcpClient = this.client.getClient(this.serverId);

    if (!mcpClient) {
      throw new Error(`MCP client for server ${this.serverId} not found`);
    }

    if (this.resourceUris?.length) {
      return this.loadSpecificResources(mcpClient, this.resourceUris);
    } else {
      return this.loadAllResources(mcpClient);
    }
  }

  /**
   * Load specific resources by URI
   *
   * @param mcpClient - The MCP client instance
   * @param uris - Array of resource URIs to load
   * @returns Promise resolving to an array of Document objects
   */
  private async loadSpecificResources(mcpClient: any, uris: string[]): Promise<Document[]> {
    // Apply filtering based on include/exclude patterns
    let filteredUris = [...uris];

    if (this.options?.includePattern) {
      const includePattern = this.options.includePattern;
      filteredUris = filteredUris.filter(uri => includePattern.test(uri));
    }

    if (this.options?.excludePattern) {
      const excludePattern = this.options.excludePattern;
      filteredUris = filteredUris.filter(uri => !excludePattern.test(uri));
    }

    // Apply limit if specified
    if (this.options?.limit !== undefined && this.options.limit < filteredUris.length) {
      filteredUris = filteredUris.slice(0, this.options.limit);
    }

    const documents: Document[] = [];

    // Process each resource
    for (const uri of filteredUris) {
      try {
        const response = await mcpClient.sendRequest({
          method: 'resources/read',
          params: { uri },
        });

        // Skip if not matching MIME type filter
        if (
          this.options?.mimeTypeFilter &&
          response.resource.mimeType !== this.options.mimeTypeFilter
        ) {
          continue;
        }

        // Convert resource to LangChain document
        const document = resourceToDocument(
          response.resource as Resource,
          response.content as ResourceContent
        );
        documents.push(document);
      } catch (error) {
        console.error(`Error loading resource ${uri}:`, error);
        // Continue with next resource if one fails
      }
    }

    return documents;
  }

  /**
   * Load all resources from the server with optional filtering
   *
   * @param mcpClient - The MCP client instance
   * @returns Promise resolving to an array of Document objects
   */
  private async loadAllResources(mcpClient: any): Promise<Document[]> {
    try {
      // List all available resources
      const listResponse = await mcpClient.sendRequest({
        method: 'resources/list',
      });

      let resources = listResponse.resources || [];

      // Apply MIME type filter if specified
      if (this.options?.mimeTypeFilter) {
        resources = resources.filter(
          (resource: Resource) => resource.mimeType === this.options?.mimeTypeFilter
        );
      }

      // Apply include pattern filter if specified
      if (this.options?.includePattern) {
        const includePattern = this.options.includePattern;
        resources = resources.filter((resource: Resource) => includePattern.test(resource.uri));
      }

      // Apply exclude pattern filter if specified
      if (this.options?.excludePattern) {
        const excludePattern = this.options.excludePattern;
        resources = resources.filter((resource: Resource) => !excludePattern.test(resource.uri));
      }

      // Apply limit if specified
      if (this.options?.limit !== undefined && this.options.limit < resources.length) {
        resources = resources.slice(0, this.options.limit);
      }

      // Load content for each resource
      const documents: Document[] = [];

      for (const resource of resources) {
        try {
          const readResponse = await mcpClient.sendRequest({
            method: 'resources/read',
            params: { uri: resource.uri },
          });

          // Convert resource to LangChain document
          const document = resourceToDocument(
            readResponse.resource as Resource,
            readResponse.content as ResourceContent
          );
          documents.push(document);
        } catch (error) {
          console.error(`Error loading resource ${resource.uri}:`, error);
          // Continue with next resource if one fails
        }
      }

      return documents;
    } catch (error) {
      console.error('Error loading resources:', error);
      return [];
    }
  }
}
