import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import {
  Message as MCPMessage,
  TextContent,
  ResourceContentReference,
  isTextContent,
  isResourceContent,
} from '../types/mcp-types.js';

/**
 * Converts an MCP message to a LangChain message
 * @param mcpMessage The MCP message to convert
 * @returns A LangChain message (HumanMessage, AIMessage, or SystemMessage)
 */
export function mcpMessageToLangChain(
  mcpMessage: MCPMessage
): HumanMessage | AIMessage | SystemMessage {
  // Direct type conversion based on role and content
  switch (mcpMessage.role) {
    case 'user': {
      if (isTextContent(mcpMessage.content)) {
        return new HumanMessage(mcpMessage.content.text);
      } else if (isResourceContent(mcpMessage.content)) {
        // Handle resource content by converting to multimodal format
        return new HumanMessage({
          content: [
            {
              type: 'text',
              text: mcpMessage.content.resource.text || '',
            },
            {
              type: 'file_reference',
              file_path: mcpMessage.content.resource.uri,
              mime_type: mcpMessage.content.resource.mimeType,
            },
          ],
        });
      }
      break;
    }
    case 'assistant':
      return new AIMessage(isTextContent(mcpMessage.content) ? mcpMessage.content.text : '');
    case 'system':
      return new SystemMessage(isTextContent(mcpMessage.content) ? mcpMessage.content.text : '');
  }

  throw new Error(`Unsupported message type: ${mcpMessage.role}`);
}

// Type definitions for multimodal content in LangChain messages
interface MessageContentText {
  type: 'text';
  text: string;
}

interface MessageContentFileReference {
  type: 'file_reference';
  file_path: string;
  mime_type?: string;
}

interface MessageContentImageUrl {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type MessageContentComplex =
  | MessageContentText
  | MessageContentFileReference
  | MessageContentImageUrl;

/**
 * Converts a LangChain message to an MCP message
 * @param message The LangChain message to convert
 * @returns An MCP message
 */
export function langChainToMcpMessage(
  message: HumanMessage | AIMessage | SystemMessage
): MCPMessage {
  let role: 'user' | 'assistant' | 'system';

  // Determine the role based on the message type
  if (message instanceof HumanMessage) {
    role = 'user';
  } else if (message instanceof AIMessage) {
    role = 'assistant';
  } else if (message instanceof SystemMessage) {
    role = 'system';
  } else {
    throw new Error(`Unsupported message type: ${(message as BaseMessage).constructor.name}`);
  }

  // Handle different content types (string vs object)
  if (typeof message.content === 'string') {
    // Simple text content
    return {
      role,
      content: {
        type: 'text',
        text: message.content,
      },
    };
  } else if (Array.isArray(message.content)) {
    // Handle multimodal content (array format)
    // Find the text part and resource parts
    const contentArray = message.content as MessageContentComplex[];
    const textParts = contentArray.filter(
      (part): part is MessageContentText => part.type === 'text'
    );
    const resourceParts = contentArray.filter(
      (part): part is MessageContentFileReference | MessageContentImageUrl =>
        part.type === 'file_reference' || part.type === 'image_url'
    );

    if (resourceParts.length > 0) {
      // If there's a resource reference, use it as the primary content
      const resourcePart = resourceParts[0];
      const text = textParts.length > 0 ? textParts[0].text : '';

      if (resourcePart.type === 'file_reference') {
        return {
          role,
          content: {
            type: 'resource',
            resource: {
              uri: resourcePart.file_path,
              text: text,
              mimeType: resourcePart.mime_type,
            },
          },
        };
      } else if (resourcePart.type === 'image_url') {
        return {
          role,
          content: {
            type: 'resource',
            resource: {
              uri: resourcePart.image_url.url,
              text: text,
              mimeType: 'image/*',
            },
          },
        };
      }
    }

    // Default to text if we couldn't extract a resource
    const combinedText = textParts.map(part => part.text).join('\n');
    return {
      role,
      content: {
        type: 'text',
        text: combinedText || '',
      },
    };
  }

  // Default case - convert to text content
  return {
    role,
    content: {
      type: 'text',
      text: String(message.content),
    },
  };
}
