import {
  Resource,
  ResourceContent,
  ResourceReadResponse,
  Message,
  TextContent,
  ResourceContentReference,
  MessageContent,
  PromptDefinition,
  PromptArgument,
  PromptExecuteRequest,
  isTextContent,
  isResourceContent,
  ResourceSchema,
  ResourceContentSchema,
  TextContentSchema,
  ResourceContentReferenceSchema,
  MessageSchema,
  PromptDefinitionSchema,
} from '../src/types/mcp-types';

describe('MCP Type Definitions', () => {
  describe('Type Guards', () => {
    test('isTextContent correctly identifies text content', () => {
      const textContent: MessageContent = {
        type: 'text',
        text: 'Hello, world!',
      };

      const resourceContent: MessageContent = {
        type: 'resource',
        resource: {
          uri: 'mcp://resources/example.txt',
        },
      };

      expect(isTextContent(textContent)).toBe(true);
      expect(isTextContent(resourceContent)).toBe(false);
    });

    test('isResourceContent correctly identifies resource content', () => {
      const textContent: MessageContent = {
        type: 'text',
        text: 'Hello, world!',
      };

      const resourceContent: MessageContent = {
        type: 'resource',
        resource: {
          uri: 'mcp://resources/example.txt',
        },
      };

      expect(isResourceContent(resourceContent)).toBe(true);
      expect(isResourceContent(textContent)).toBe(false);
    });
  });

  describe('Zod Schemas', () => {
    test('ResourceSchema validates valid resources', () => {
      const validResource: Resource = {
        uri: 'mcp://resources/example.txt',
        name: 'Example Resource',
        description: 'An example resource',
        mimeType: 'text/plain',
      };

      const validationResult = ResourceSchema.safeParse(validResource);
      expect(validationResult.success).toBe(true);
    });

    test('ResourceSchema requires uri', () => {
      const invalidResource = {
        name: 'Example Resource',
        description: 'An example resource',
        mimeType: 'text/plain',
      };

      const validationResult = ResourceSchema.safeParse(invalidResource);
      expect(validationResult.success).toBe(false);
    });

    test('ResourceContentSchema validates text content', () => {
      const textResourceContent: ResourceContent = {
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
        text: 'Hello, world!',
      };

      const validationResult = ResourceContentSchema.safeParse(textResourceContent);
      expect(validationResult.success).toBe(true);
    });

    test('ResourceContentSchema validates binary content', () => {
      const binaryResourceContent: ResourceContent = {
        uri: 'mcp://resources/example.bin',
        mimeType: 'application/octet-stream',
        blob: new Uint8Array([1, 2, 3, 4]),
      };

      const validationResult = ResourceContentSchema.safeParse(binaryResourceContent);
      expect(validationResult.success).toBe(true);
    });

    test('ResourceContentSchema requires either text or blob', () => {
      const invalidResourceContent = {
        uri: 'mcp://resources/example.txt',
        mimeType: 'text/plain',
      };

      const validationResult = ResourceContentSchema.safeParse(invalidResourceContent);
      expect(validationResult.success).toBe(false);
    });

    test('MessageSchema validates valid messages', () => {
      const textMessage: Message = {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, world!',
        },
      };

      const resourceMessage: Message = {
        role: 'assistant',
        content: {
          type: 'resource',
          resource: {
            uri: 'mcp://resources/example.txt',
            text: 'Hello from a resource!',
          },
        },
      };

      expect(MessageSchema.safeParse(textMessage).success).toBe(true);
      expect(MessageSchema.safeParse(resourceMessage).success).toBe(true);
    });

    test('PromptDefinitionSchema validates valid prompt definitions', () => {
      const promptDefinition: PromptDefinition = {
        name: 'example-prompt',
        description: 'An example prompt',
        arguments: [
          {
            name: 'query',
            description: 'The query to answer',
            required: true,
            type: 'string',
          },
        ],
        examples: [
          [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'What is the capital of France?',
              },
            },
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: 'The capital of France is Paris.',
              },
            },
          ],
        ],
      };

      const validationResult = PromptDefinitionSchema.safeParse(promptDefinition);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('Type Usage Examples', () => {
    test('Creating and using resource objects', () => {
      // This test doesn't assert anything, it just demonstrates type usage
      const resource: Resource = {
        uri: 'mcp://resources/example.txt',
        name: 'Example Resource',
        description: 'An example resource',
        mimeType: 'text/plain',
      };

      const content: ResourceContent = {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: 'This is the content of the example resource.',
      };

      const responseExample: ResourceReadResponse = {
        resource,
        content,
      };
    });

    test('Creating and using message objects', () => {
      // This test doesn't assert anything, it just demonstrates type usage
      const userMessage: Message = {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, can you help me understand this code?',
        },
      };

      const assistantMessage: Message = {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Of course! What code would you like me to explain?',
        },
      };

      const resourceMessage: Message = {
        role: 'user',
        content: {
          type: 'resource',
          resource: {
            uri: 'mcp://resources/code.js',
            text: 'function hello() { console.log("Hello, world!"); }',
            mimeType: 'application/javascript',
          },
        },
      };
    });

    test('Creating and using prompt objects', () => {
      // This test doesn't assert anything, it just demonstrates type usage
      const promptDef: PromptDefinition = {
        name: 'code-explain',
        description: 'Explain a piece of code',
        arguments: [
          {
            name: 'language',
            description: 'The programming language',
            required: true,
            type: 'string',
          },
          {
            name: 'code',
            description: 'The code to explain',
            required: true,
            type: 'string',
          },
        ],
      };

      const promptRequest: PromptExecuteRequest = {
        promptName: promptDef.name,
        arguments: {
          language: 'javascript',
          code: 'function hello() { console.log("Hello, world!"); }',
        },
      };
    });
  });
});
