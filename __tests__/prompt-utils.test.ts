// Mock the external modules first
jest.mock('../src/client', () => {
  return {
    MultiServerMCPClient: jest.fn().mockImplementation(() => {
      return {
        getClient: jest.fn(),
      };
    }),
  };
});

// Import the MultiServerMCPClient without 'type' keyword
import { MultiServerMCPClient } from '../src/client';
import type { PromptDefinition } from '../src/types/mcp-types';

// Import the functions we want to test
import {
  listPrompts,
  getPromptDetails,
  findPromptsByPattern,
  groupPromptsByCategory,
  getPromptArguments,
  promptExists,
} from '../src/utils/prompt-utils';

// For mocking logger
import logger from '../src/logger';

// Mock the logger
jest.mock('../src/logger', () => {
  return {
    __esModule: true,
    default: {
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

describe('Prompt Utilities', () => {
  let mockClient: jest.Mocked<MultiServerMCPClient>;
  let mockMcpClient: any;
  let mockPrompts: PromptDefinition[];

  beforeEach(() => {
    // Create mock prompts
    mockPrompts = [
      {
        name: 'code-review',
        description: 'A prompt for code review',
        arguments: [
          { name: 'code', description: 'The code to review', required: true, type: 'string' },
          {
            name: 'language',
            description: 'Programming language',
            required: false,
            type: 'string',
          },
        ],
      },
      {
        name: 'explain-code',
        description: 'A prompt for explaining code',
        arguments: [
          { name: 'code', description: 'The code to explain', required: true, type: 'string' },
          { name: 'detail', description: 'Level of detail', required: false, type: 'string' },
        ],
      },
      {
        name: 'summarize-text',
        description: 'A prompt for summarizing text',
        arguments: [
          { name: 'text', description: 'The text to summarize', required: true, type: 'string' },
          {
            name: 'length',
            description: 'Desired summary length',
            required: false,
            type: 'number',
          },
        ],
      },
    ];

    // Set up mock MCP client
    mockMcpClient = {
      request: jest.fn(),
    };

    // Set up mock MultiServerMCPClient
    mockClient = new MultiServerMCPClient() as jest.Mocked<MultiServerMCPClient>;
    mockClient.getClient = jest.fn().mockReturnValue(mockMcpClient);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('listPrompts', () => {
    it('should return prompts from the server', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await listPrompts(mockClient, 'test-server');

      expect(mockClient.getClient).toHaveBeenCalledWith('test-server');
      expect(mockMcpClient.request).toHaveBeenCalledWith(
        { method: 'prompts/list' },
        expect.any(Object)
      );
      expect(result).toEqual(mockPrompts);
    });

    it('should throw an error if server is not found', async () => {
      mockClient.getClient = jest.fn().mockReturnValue(null);

      await expect(listPrompts(mockClient, 'non-existent-server')).rejects.toThrow(
        'Server non-existent-server not found'
      );
    });

    it('should handle timeout correctly', async () => {
      // Mock a timeout by creating a promise that never resolves
      mockMcpClient.request.mockImplementation(() => new Promise(() => {}));

      const timeoutOption = { timeout: 100 }; // Very short timeout for testing

      await expect(listPrompts(mockClient, 'test-server', timeoutOption)).rejects.toThrow(
        'Timeout listing prompts after 100ms'
      );
    });

    it('should handle invalid server response', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ not_prompts: 'invalid' });

      const result = await listPrompts(mockClient, 'test-server');

      expect(logger.warn).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle server error', async () => {
      mockMcpClient.request.mockRejectedValueOnce(new Error('Server error'));

      await expect(listPrompts(mockClient, 'test-server')).rejects.toThrow(
        'Failed to list prompts'
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getPromptDetails', () => {
    it('should return prompt details when prompt exists', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await getPromptDetails(mockClient, 'test-server', 'code-review');

      expect(result).toEqual(mockPrompts[0]);
    });

    it('should return null when prompt does not exist', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await getPromptDetails(mockClient, 'test-server', 'non-existent-prompt');

      expect(result).toBeNull();
    });
  });

  describe('findPromptsByPattern', () => {
    it('should find prompts matching a string pattern', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await findPromptsByPattern(mockClient, 'test-server', 'code');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('code-review');
      expect(result[1].name).toBe('explain-code');
    });

    it('should find prompts matching a regex pattern', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await findPromptsByPattern(mockClient, 'test-server', /^code/);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('code-review');
    });

    it('should find prompts matching in description', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await findPromptsByPattern(mockClient, 'test-server', 'summarizing');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('summarize-text');
    });
  });

  describe('groupPromptsByCategory', () => {
    it('should group prompts by category', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      // Extract category from prompt name (everything before the first hyphen)
      const categoryExtractor = (name: string) => name.split('-')[0];

      const result = await groupPromptsByCategory(mockClient, 'test-server', categoryExtractor);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result['code']).toHaveLength(1);
      expect(result['code'][0].name).toBe('code-review');
      expect(result['explain']).toHaveLength(1);
      expect(result['explain'][0].name).toBe('explain-code');
      expect(result['summarize']).toHaveLength(1);
      expect(result['summarize'][0].name).toBe('summarize-text');
    });
  });

  describe('getPromptArguments', () => {
    it('should return all argument names for a prompt', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await getPromptArguments(mockClient, 'test-server', 'code-review');

      expect(result).toHaveLength(2);
      expect(result).toContain('code');
      expect(result).toContain('language');
    });

    it('should return only required argument names when specified', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await getPromptArguments(mockClient, 'test-server', 'code-review', {
        requiredOnly: true,
      });

      expect(result).toHaveLength(1);
      expect(result).toContain('code');
      expect(result).not.toContain('language');
    });

    it('should return empty array for non-existent prompt', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await getPromptArguments(mockClient, 'test-server', 'non-existent-prompt');

      expect(result).toEqual([]);
    });

    it('should return empty array for prompt with no arguments', async () => {
      const noArgsPrompt = [{ name: 'simple', description: 'A simple prompt without arguments' }];
      mockMcpClient.request.mockResolvedValueOnce({ prompts: noArgsPrompt });

      const result = await getPromptArguments(mockClient, 'test-server', 'simple');

      expect(result).toEqual([]);
    });
  });

  describe('promptExists', () => {
    it('should return true if prompt exists', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await promptExists(mockClient, 'test-server', 'code-review');

      expect(result).toBe(true);
    });

    it('should return false if prompt does not exist', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const result = await promptExists(mockClient, 'test-server', 'non-existent-prompt');

      expect(result).toBe(false);
    });
  });
});
