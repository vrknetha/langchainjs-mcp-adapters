import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { mcpMessageToLangChain, langChainToMcpMessage } from '../src/adapters/message-adapters';
import {
  Message as MCPMessage,
  TextContent,
  ResourceContentReference,
} from '../src/types/mcp-types';

describe('Message Adapters', () => {
  describe('mcpMessageToLangChain', () => {
    test('converts user text message to HumanMessage', () => {
      const mcpMessage: MCPMessage = {
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello from user',
        },
      };

      const langChainMessage = mcpMessageToLangChain(mcpMessage);

      expect(langChainMessage).toBeInstanceOf(HumanMessage);
      expect(langChainMessage.content).toBe('Hello from user');
    });

    test('converts assistant text message to AIMessage', () => {
      const mcpMessage: MCPMessage = {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'Hello from assistant',
        },
      };

      const langChainMessage = mcpMessageToLangChain(mcpMessage);

      expect(langChainMessage).toBeInstanceOf(AIMessage);
      expect(langChainMessage.content).toBe('Hello from assistant');
    });

    test('converts system text message to SystemMessage', () => {
      const mcpMessage: MCPMessage = {
        role: 'system',
        content: {
          type: 'text',
          text: 'Hello from system',
        },
      };

      const langChainMessage = mcpMessageToLangChain(mcpMessage);

      expect(langChainMessage).toBeInstanceOf(SystemMessage);
      expect(langChainMessage.content).toBe('Hello from system');
    });

    test('converts resource content message to multimodal HumanMessage', () => {
      const mcpMessage: MCPMessage = {
        role: 'user',
        content: {
          type: 'resource',
          resource: {
            uri: 'mcp://resources/example.txt',
            text: 'Resource content',
            mimeType: 'text/plain',
          },
        },
      };

      const langChainMessage = mcpMessageToLangChain(mcpMessage);

      expect(langChainMessage).toBeInstanceOf(HumanMessage);

      // Type assertion to help TypeScript understand the structure
      const content = langChainMessage.content as unknown as Array<{
        type: string;
        [key: string]: any;
      }>;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBe(2);

      // Check text part
      const textPart = content.find(part => part.type === 'text');
      expect(textPart).toBeDefined();
      expect(textPart?.text).toBe('Resource content');

      // Check file reference part
      const filePart = content.find(part => part.type === 'file_reference');
      expect(filePart).toBeDefined();
      expect(filePart?.file_path).toBe('mcp://resources/example.txt');
      expect(filePart?.mime_type).toBe('text/plain');
    });

    test('throws error for unsupported message type', () => {
      // Create a message with an invalid role for testing
      const invalidMessage = {
        role: 'invalid' as 'user' | 'assistant' | 'system', // Type assertion to bypass TypeScript check
        content: {
          type: 'text',
          text: 'Invalid message',
        },
      };

      expect(() => mcpMessageToLangChain(invalidMessage as MCPMessage)).toThrow();
    });
  });

  describe('langChainToMcpMessage', () => {
    test('converts HumanMessage to user MCP message', () => {
      const langChainMessage = new HumanMessage('Hello from human');

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('user');
      expect(mcpMessage.content.type).toBe('text');
      expect((mcpMessage.content as TextContent).text).toBe('Hello from human');
    });

    test('converts AIMessage to assistant MCP message', () => {
      const langChainMessage = new AIMessage('Hello from AI');

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('assistant');
      expect(mcpMessage.content.type).toBe('text');
      expect((mcpMessage.content as TextContent).text).toBe('Hello from AI');
    });

    test('converts SystemMessage to system MCP message', () => {
      const langChainMessage = new SystemMessage('Hello from system');

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('system');
      expect(mcpMessage.content.type).toBe('text');
      expect((mcpMessage.content as TextContent).text).toBe('Hello from system');
    });

    test('converts multimodal HumanMessage to resource MCP message', () => {
      // Create a message with multimodal content
      const langChainMessage = new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'Check this file',
          },
          {
            type: 'file_reference',
            file_path: 'mcp://resources/example.txt',
            mime_type: 'text/plain',
          },
        ],
      });

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('user');
      expect(mcpMessage.content.type).toBe('resource');

      const resourceContent = mcpMessage.content as ResourceContentReference;
      expect(resourceContent.resource.uri).toBe('mcp://resources/example.txt');
      expect(resourceContent.resource.text).toBe('Check this file');
      expect(resourceContent.resource.mimeType).toBe('text/plain');
    });

    test('converts image url HumanMessage to resource MCP message', () => {
      // Create a message with image URL content
      const langChainMessage = new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'Check this image',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://example.com/image.jpg',
            },
          },
        ],
      });

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('user');
      expect(mcpMessage.content.type).toBe('resource');

      const resourceContent = mcpMessage.content as ResourceContentReference;
      expect(resourceContent.resource.uri).toBe('https://example.com/image.jpg');
      expect(resourceContent.resource.text).toBe('Check this image');
      expect(resourceContent.resource.mimeType).toBe('image/*');
    });

    test('handles array content with only text parts', () => {
      // Create a message with multiple text parts
      const langChainMessage = new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'First part',
          },
          {
            type: 'text',
            text: 'Second part',
          },
        ],
      });

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('user');
      expect(mcpMessage.content.type).toBe('text');
      expect((mcpMessage.content as TextContent).text).toBe('First part\nSecond part');
    });

    test('handles complex object content by converting to string', () => {
      // Create a message with an object as content - for this test we need to suppress
      // TypeScript errors since we're intentionally creating an invalid message structure
      const customContent = {
        someKey: 'someValue',
        nestedObject: { key: 'value' },
      };

      // Force the Human Message to have an object as content
      const langChainMessage = new HumanMessage('dummy text');
      // @ts-ignore - Intentionally overriding content with an invalid type for testing
      langChainMessage.content = customContent;

      const mcpMessage = langChainToMcpMessage(langChainMessage);

      expect(mcpMessage.role).toBe('user');
      expect(mcpMessage.content.type).toBe('text');
      expect((mcpMessage.content as TextContent).text).toBe('[object Object]');
    });
  });
});
