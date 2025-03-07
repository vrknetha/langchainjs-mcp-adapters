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
import type { Resource } from '../src/types/mcp-types';

// Import the functions we want to test
import {
  listResources,
  findResourcesByMimeType,
  findResourcesByPattern,
  getResourceByUri,
  readResourceContent,
  groupResourcesByMimeType,
  getResourceMimeTypes,
} from '../src/utils/resource-utils';

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

describe('Resource Utilities', () => {
  let mockClient: jest.Mocked<MultiServerMCPClient>;
  let mockMcpClient: any;
  let mockResources: Resource[];

  beforeEach(() => {
    // Create mock resources
    mockResources = [
      {
        uri: 'mcp://resources/file1.txt',
        name: 'File 1',
        mimeType: 'text/plain',
        description: 'Test file 1',
      },
      {
        uri: 'mcp://resources/file2.md',
        name: 'File 2',
        mimeType: 'text/markdown',
        description: 'Test file 2',
      },
      {
        uri: 'mcp://resources/image.png',
        name: 'Image',
        mimeType: 'image/png',
        description: 'Test image',
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

  describe('listResources', () => {
    it('should return resources from the server', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await listResources(mockClient, 'test-server');

      expect(mockClient.getClient).toHaveBeenCalledWith('test-server');
      expect(mockMcpClient.request).toHaveBeenCalledWith(
        { method: 'resources/list' },
        expect.any(Object)
      );
      expect(result).toEqual(mockResources);
    });

    it('should throw an error if server is not found', async () => {
      mockClient.getClient.mockReturnValueOnce(undefined);

      await expect(listResources(mockClient, 'nonexistent-server')).rejects.toThrow(
        'Server nonexistent-server not found'
      );
    });

    it('should handle timeout errors', async () => {
      jest.useFakeTimers();
      mockMcpClient.request.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 10000)); // Never resolves within timeout
      });

      const promise = listResources(mockClient, 'test-server', { timeout: 100 });

      // Fast-forward time
      jest.advanceTimersByTime(200);

      await expect(promise).rejects.toThrow('Timeout listing resources after 100ms');

      jest.useRealTimers();
    });

    it('should handle invalid responses', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ not_resources: [] });

      const result = await listResources(mockClient, 'test-server');

      expect(result).toEqual([]);
    });

    it('should propagate errors from request', async () => {
      mockMcpClient.request.mockRejectedValueOnce(new Error('Network error'));

      await expect(listResources(mockClient, 'test-server')).rejects.toThrow(
        'Failed to list resources: Network error'
      );
    });
  });

  describe('findResourcesByMimeType', () => {
    it('should filter resources by mime type', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await findResourcesByMimeType(mockClient, 'test-server', 'text/plain');

      expect(result).toHaveLength(1);
      expect(result[0].uri).toBe('mcp://resources/file1.txt');
    });
  });

  describe('findResourcesByPattern', () => {
    it('should find resources matching a string pattern', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await findResourcesByPattern(mockClient, 'test-server', 'file');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('File 1');
      expect(result[1].name).toBe('File 2');
    });

    it('should find resources matching a RegExp pattern', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await findResourcesByPattern(mockClient, 'test-server', /image/i);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Image');
    });

    it('should search by specified fields only', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await findResourcesByPattern(mockClient, 'test-server', 'test', {
        searchFields: ['description'],
      });

      expect(result).toHaveLength(3); // All have "Test" in description
    });
  });

  describe('getResourceByUri', () => {
    it('should find a resource by URI', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await getResourceByUri(mockClient, 'test-server', 'mcp://resources/image.png');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Image');
    });

    it('should return null if resource not found', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ resources: mockResources });

      const result = await getResourceByUri(
        mockClient,
        'test-server',
        'mcp://resources/nonexistent.txt'
      );

      expect(result).toBeNull();
    });
  });

  describe('readResourceContent', () => {
    it('should read resource content', async () => {
      const content = 'This is the content of the file';
      mockMcpClient.request.mockResolvedValueOnce({ content });

      const result = await readResourceContent(
        mockClient,
        'test-server',
        'mcp://resources/file1.txt'
      );

      expect(mockMcpClient.request).toHaveBeenCalledWith(
        {
          method: 'resources/read',
          params: {
            uri: 'mcp://resources/file1.txt',
          },
        },
        expect.any(Object)
      );
      expect(result).toBe(content);
    });

    it('should handle timeout when reading content', async () => {
      jest.useFakeTimers();
      mockMcpClient.request.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 10000)); // Never resolves within timeout
      });

      const promise = readResourceContent(mockClient, 'test-server', 'mcp://resources/file1.txt', {
        timeout: 100,
      });

      // Fast-forward time
      jest.advanceTimersByTime(200);

      await expect(promise).rejects.toThrow('Timeout reading resource after 100ms');

      jest.useRealTimers();
    });

    it('should handle invalid responses', async () => {
      mockMcpClient.request.mockResolvedValueOnce({ not_content: 'something' });

      const result = await readResourceContent(
        mockClient,
        'test-server',
        'mcp://resources/file1.txt'
      );

      expect(result).toBeNull();
    });
  });

  describe('groupResourcesByMimeType', () => {
    it('should group resources by mime type', () => {
      const result = groupResourcesByMimeType(mockResources);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result['text/plain']).toHaveLength(1);
      expect(result['text/markdown']).toHaveLength(1);
      expect(result['image/png']).toHaveLength(1);
    });

    it('should handle resources with no mime type', () => {
      const resourcesWithMissingMimeType = [
        ...mockResources,
        { uri: 'mcp://resources/unknown', name: 'Unknown' },
      ];

      const result = groupResourcesByMimeType(resourcesWithMissingMimeType);

      expect(Object.keys(result)).toHaveLength(4);
      expect(result['unknown']).toHaveLength(1);
    });
  });

  describe('getResourceMimeTypes', () => {
    it('should return unique mime types', async () => {
      const extendedResources = [
        ...mockResources,
        { uri: 'mcp://resources/file3.txt', name: 'File 3', mimeType: 'text/plain' },
      ];

      mockMcpClient.request.mockResolvedValueOnce({ resources: extendedResources });

      const result = await getResourceMimeTypes(mockClient, 'test-server');

      expect(result).toHaveLength(3);
      expect(result).toContain('text/plain');
      expect(result).toContain('text/markdown');
      expect(result).toContain('image/png');
    });
  });
});
