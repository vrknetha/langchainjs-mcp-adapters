import { Document } from '@langchain/core/documents';
import {
  resourceToDocument,
  resourcesToDocuments,
  resourceResponseToDocument,
} from '../src/adapters/resource-adapters';
import { Resource, ResourceContent } from '../src/types/mcp-types';

describe('Resource Adapters', () => {
  describe('resourceToDocument', () => {
    test('converts text resource to Document', () => {
      const resource: Resource = {
        uri: 'mcp://resources/example.txt',
        name: 'Example Resource',
        description: 'An example resource',
        mimeType: 'text/plain',
      };

      const content: ResourceContent = {
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
        text: 'Hello, world!',
      };

      const document = resourceToDocument(resource, content);

      expect(document).toBeInstanceOf(Document);
      expect(document.pageContent).toBe('Hello, world!');
      expect(document.metadata).toEqual({
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
        resourceName: 'Example Resource',
        resourceDescription: 'An example resource',
        source: 'mcp://resources/example.txt',
      });
    });

    test('converts binary resource to Document', () => {
      const resource: Resource = {
        uri: 'mcp://resources/example.bin',
        name: 'Binary Resource',
        description: 'A binary resource',
        mimeType: 'application/octet-stream',
      };

      const content: ResourceContent = {
        uri: 'mcp://resources/example.bin',
        mimeType: 'application/octet-stream',
        blob: new Uint8Array([1, 2, 3, 4]),
      };

      const document = resourceToDocument(resource, content);

      expect(document).toBeInstanceOf(Document);
      expect(document.pageContent).toBe('[Binary content]: mcp://resources/example.bin');
      expect(document.metadata).toEqual({
        uri: 'mcp://resources/example.bin',
        mimeType: 'application/octet-stream',
        resourceName: 'Binary Resource',
        resourceDescription: 'A binary resource',
        isBinary: true,
        binaryData: content.blob,
        source: 'mcp://resources/example.bin',
      });
    });

    test('converts base64 binary resource to Document', () => {
      const resource: Resource = {
        uri: 'mcp://resources/example.bin',
        name: 'Base64 Resource',
        mimeType: 'application/octet-stream',
      };

      const content: ResourceContent = {
        uri: 'mcp://resources/example.bin',
        mimeType: 'application/octet-stream',
        blob: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
      };

      const document = resourceToDocument(resource, content);

      expect(document).toBeInstanceOf(Document);
      expect(document.pageContent).toBe('[Base64 encoded content]: mcp://resources/example.bin');
      expect(document.metadata.binaryData).toBe('SGVsbG8gV29ybGQ=');
    });

    test('throws error for invalid resource content', () => {
      const resource: Resource = {
        uri: 'mcp://resources/example.txt',
        name: 'Example Resource',
        mimeType: 'text/plain',
      };

      // @ts-ignore - Intentionally creating invalid content for testing
      const invalidContent: ResourceContent = {
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
        // Missing both text and blob
      };

      expect(() => resourceToDocument(resource, invalidContent)).toThrow();
    });

    test('throws error for invalid resource', () => {
      // @ts-ignore - Intentionally creating invalid resource for testing
      const invalidResource: Partial<Resource> = {
        name: 'Example Resource',
        mimeType: 'text/plain',
        // Missing uri
      };

      const content: ResourceContent = {
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
        text: 'Hello, world!',
      };

      expect(() => resourceToDocument(invalidResource as Resource, content)).toThrow();
    });
  });

  describe('resourcesToDocuments', () => {
    test('converts multiple resources to Documents', () => {
      const resources = [
        {
          resource: {
            uri: 'mcp://resources/example1.txt',
            name: 'Example 1',
            mimeType: 'text/plain',
          },
          content: {
            uri: 'mcp://resources/example1.txt',
            mimeType: 'text/plain',
            text: 'Hello from Example 1',
          },
        },
        {
          resource: {
            uri: 'mcp://resources/example2.txt',
            name: 'Example 2',
            mimeType: 'text/plain',
          },
          content: {
            uri: 'mcp://resources/example2.txt',
            mimeType: 'text/plain',
            text: 'Hello from Example 2',
          },
        },
      ];

      const documents = resourcesToDocuments(resources);

      expect(documents).toHaveLength(2);
      expect(documents[0].pageContent).toBe('Hello from Example 1');
      expect(documents[1].pageContent).toBe('Hello from Example 2');
    });
  });

  describe('resourceResponseToDocument', () => {
    test('converts resource response to Document', () => {
      const response = {
        resource: {
          uri: 'mcp://resources/example.txt',
          name: 'Example Resource',
          mimeType: 'text/plain',
        },
        content: {
          uri: 'mcp://resources/example.txt',
          mimeType: 'text/plain',
          text: 'Hello, world!',
        },
      };

      const document = resourceResponseToDocument(response);

      expect(document).toBeInstanceOf(Document);
      expect(document.pageContent).toBe('Hello, world!');
      expect(document.metadata.resourceName).toBe('Example Resource');
    });
  });
});
