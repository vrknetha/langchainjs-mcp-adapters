import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { convertMcpToolToLangchainTool, loadMcpTools } from '../src/tools.js';
import { z } from 'zod';

// Create a mock client
const mockClient = {
  callTool: jest.fn(),
  listTools: jest.fn(),
};

describe('Simplified Tool Adapter Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('convertMcpToolToLangchainTool', () => {
    test('should convert MCP tool to LangChain tool with text content', async () => {
      // Set up mock tool
      const mcpTool = {
        name: 'testTool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
      };

      // Set up mock response
      mockClient.callTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Test result' }],
      });

      // Convert tool
      const tool = convertMcpToolToLangchainTool(mockClient as unknown as Client, mcpTool);

      // Verify tool properties
      expect(tool.name).toBe('testTool');
      expect(tool.description).toBe('A test tool');

      // Call the tool
      const result = await tool.invoke({ input: 'test' });

      // Verify that the client was called with the right arguments
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'testTool',
        arguments: { input: 'test' },
      });

      // Verify result
      expect(result).toBe('Test result');
    });

    test('should handle error results', async () => {
      // Set up mock tool
      const mcpTool = {
        name: 'errorTool',
        description: 'A tool that errors',
      };

      // Set up mock response
      mockClient.callTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Error message' }],
      });

      // Convert tool
      const tool = convertMcpToolToLangchainTool(mockClient as unknown as Client, mcpTool);

      // Call the tool and expect an error
      await expect(tool.invoke({ input: 'test' })).rejects.toThrow('Error message');
    });

    test('should handle non-text content', async () => {
      // Set up mock tool
      const mcpTool = {
        name: 'imageTool',
        description: 'A tool that returns images',
      };

      // Set up mock response with non-text content
      mockClient.callTool.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Image caption' },
          { type: 'image', url: 'http://example.com/image.jpg' },
        ],
      });

      // Convert tool
      const tool = convertMcpToolToLangchainTool(mockClient as unknown as Client, mcpTool);

      // Call the tool
      const result = await tool.invoke({ input: 'test' });

      // Verify result (should only include text content)
      expect(result).toBe('Image caption');
    });
  });

  describe('loadMcpTools', () => {
    test('should load all tools from client', async () => {
      // Set up mock response
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'Tool 1' },
          { name: 'tool2', description: 'Tool 2' },
        ],
      });

      // Load tools
      const tools = await loadMcpTools(mockClient as unknown as Client);

      // Verify results
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
    });

    test('should handle empty tool list', async () => {
      // Set up mock response
      mockClient.listTools.mockResolvedValueOnce({
        tools: [],
      });

      // Load tools
      const tools = await loadMcpTools(mockClient as unknown as Client);

      // Verify results
      expect(tools.length).toBe(0);
    });

    test('should filter out tools without names', async () => {
      // Set up mock response
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'Tool 1' },
          { description: 'No name tool' }, // Should be filtered out
          { name: 'tool2', description: 'Tool 2' },
        ],
      });

      // Load tools
      const tools = await loadMcpTools(mockClient as unknown as Client);

      // Verify results
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
    });
  });
});
