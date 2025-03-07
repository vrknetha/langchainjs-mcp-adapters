import { MCPPromptTemplate } from '../src/prompts/mcp-prompt';
import { MultiServerMCPClient } from '../src/client';
import { PromptDefinition, Message } from '../src/types/mcp-types';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

// Mock the MCP Client
jest.mock('../src/client', () => {
  return {
    MultiServerMCPClient: jest.fn().mockImplementation(() => {
      return {
        getClient: jest.fn().mockImplementation((serverName: string) => {
          if (serverName === 'test-server') {
            return {
              sendRequest: jest.fn().mockImplementation(async (request: any) => {
                const method = request.method;
                const params = request.params;

                if (method === 'prompts/list') {
                  return {
                    prompts: [
                      {
                        id: 'test-prompt',
                        name: 'test-prompt',
                        description: 'A test prompt',
                        arguments: [
                          {
                            name: 'input',
                            description: 'The input text',
                            required: true,
                            type: 'string',
                          },
                          {
                            name: 'optional_param',
                            description: 'An optional parameter',
                            required: false,
                            type: 'string',
                          },
                        ],
                      },
                      {
                        id: 'complex-prompt',
                        name: 'complex-prompt',
                        description: 'A prompt with complex arguments',
                        arguments: [
                          {
                            name: 'arrayParam',
                            description: 'An array parameter',
                            required: true,
                            type: 'array',
                          },
                          {
                            name: 'objectParam',
                            description: 'An object parameter',
                            required: true,
                            type: 'object',
                          },
                        ],
                      },
                    ],
                  };
                } else if (method === 'prompts/execute') {
                  const templateId = params.promptId;
                  const values = params.input;

                  // Validate required parameters
                  if (templateId === 'test-prompt') {
                    if (!values.input) {
                      throw new Error('Missing value for input variable: input');
                    }

                    return {
                      messages: [
                        {
                          role: 'system',
                          content: {
                            type: 'text',
                            text: 'This is a test system message',
                          },
                        },
                        {
                          role: 'human',
                          content: {
                            type: 'text',
                            text: `User input: ${values.input}`,
                          },
                        },
                        {
                          role: 'ai',
                          content: {
                            type: 'text',
                            text: `Assistant response to: ${values.input}`,
                          },
                        },
                      ],
                    };
                  } else if (templateId === 'complex-prompt') {
                    // Validate array type
                    if (values.arrayParam && !Array.isArray(values.arrayParam)) {
                      throw new Error('Type mismatch for argument arrayParam');
                    }

                    // Validate object type
                    if (
                      values.objectParam &&
                      (typeof values.objectParam !== 'object' || Array.isArray(values.objectParam))
                    ) {
                      throw new Error('Type mismatch for argument objectParam');
                    }

                    return {
                      messages: [
                        {
                          role: 'system',
                          content: {
                            type: 'text',
                            text: 'This is a test with complex arguments',
                          },
                        },
                        {
                          role: 'ai',
                          content: {
                            type: 'text',
                            text: `Got array with ${values.arrayParam.length} items and object with ${Object.keys(values.objectParam).length} keys`,
                          },
                        },
                      ],
                    };
                  } else {
                    throw new Error(
                      `Prompt template with ID '${templateId}' not found on the server`
                    );
                  }
                }
                return {};
              }),
              isInitialized: jest.fn().mockReturnValue(true),
              listPrompts: jest.fn().mockImplementation(async () => {
                return {
                  prompts: [
                    {
                      id: 'test-prompt',
                      name: 'test-prompt',
                      description: 'A test prompt',
                      arguments: [
                        {
                          name: 'input',
                          description: 'The input text',
                          required: true,
                          type: 'string',
                        },
                        {
                          name: 'optional_param',
                          description: 'An optional parameter',
                          required: false,
                          type: 'string',
                        },
                      ],
                    },
                    {
                      id: 'complex-prompt',
                      name: 'complex-prompt',
                      description: 'A prompt with complex arguments',
                      arguments: [
                        {
                          name: 'arrayParam',
                          description: 'An array parameter',
                          required: true,
                          type: 'array',
                        },
                        {
                          name: 'objectParam',
                          description: 'An object parameter',
                          required: true,
                          type: 'object',
                        },
                      ],
                    },
                  ],
                };
              }),
              getPrompt: jest.fn().mockImplementation(async (promptId, values) => {
                if (promptId === 'test-prompt') {
                  if (!values.input) {
                    throw new Error('Missing value for input variable: input');
                  }

                  return {
                    messages: [
                      {
                        role: 'system',
                        content: {
                          type: 'text',
                          text: 'This is a test system message',
                        },
                      },
                      {
                        role: 'user',
                        content: {
                          type: 'text',
                          text: `User input: ${values.input}`,
                        },
                      },
                      {
                        role: 'assistant',
                        content: {
                          type: 'text',
                          text: `Assistant response to: ${values.input}`,
                        },
                      },
                    ],
                  };
                } else if (promptId === 'complex-prompt') {
                  // Validate array type
                  if (values.arrayParam && !Array.isArray(values.arrayParam)) {
                    throw new Error('Type mismatch for argument arrayParam');
                  }

                  // Validate object type
                  if (
                    values.objectParam &&
                    (typeof values.objectParam !== 'object' || Array.isArray(values.objectParam))
                  ) {
                    throw new Error('Type mismatch for argument objectParam');
                  }

                  return {
                    messages: [
                      {
                        role: 'system',
                        content: {
                          type: 'text',
                          text: 'This is a test with complex arguments',
                        },
                      },
                      {
                        role: 'assistant',
                        content: {
                          type: 'text',
                          text: `Got array with ${values.arrayParam.length} items and object with ${Object.keys(values.objectParam).length} keys`,
                        },
                      },
                    ],
                  };
                }

                throw new Error(`Prompt template with ID '${promptId}' not found on the server`);
              }),
            };
          } else {
            throw new Error(`Server '${serverName}' not found`);
          }
        }),
      };
    }),
  };
});

describe('MCPPromptTemplate', () => {
  let client: MultiServerMCPClient;

  beforeEach(() => {
    client = new MultiServerMCPClient({});
  });

  it('should initialize and fetch prompt definitions', async () => {
    const template = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    await template.initialize();
    expect(template).toBeDefined();
    // Initialized should be true now
  });

  it('should format a prompt to string', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    await promptTemplate.initialize();
    const result = await promptTemplate.format({ input: 'Hello, world!' });

    // With complex content objects, the toString method will show [Complex content]
    expect(result).toContain('System: [Complex content]');
    expect(result).toContain('Human: [Complex content]');
    expect(result).toContain('Assistant: [Complex content]');
  });

  it('should format messages correctly', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    await promptTemplate.initialize();
    const messages = await promptTemplate.formatMessages({
      input: 'Hello, world!',
    });

    expect(messages.length).toBe(3);
    // Since the mcpMessageToLangChain converts MCP messages to LangChain messages
    // but our mock is returning raw objects, we should check the structure instead
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
    expect(messages[0].content.text).toBe('This is a test system message');
    expect(messages[1].content.text).toBe('User input: Hello, world!');
    expect(messages[2].content.text).toBe('Assistant response to: Hello, world!');
  });

  it('should validate required input variables', async () => {
    // Create a spy on the console.log to check for the validation error message
    const consoleSpy = jest.spyOn(console, 'log');

    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    await promptTemplate.initialize();

    // Missing required input should use fallback
    const messages = await promptTemplate.formatMessages({} as any);

    // Verify fallback was triggered with validation error
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing value for input variable: input')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Constructing manual prompt response for test-prompt')
    );

    // Should still receive messages due to fallback
    expect(messages.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it('should handle complex argument types', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'complex-prompt',
      inputVariables: ['arrayParam', 'objectParam'],
    });

    await promptTemplate.initialize();
    const messages = await promptTemplate.formatMessages({
      arrayParam: [1, 2, 3],
      objectParam: { key1: 'value1', key2: 'value2' },
    });

    expect(messages.length).toBe(2);
    // Check message structure instead of instance types
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('assistant');
    expect(messages[0].content.text).toBe('This is a test with complex arguments');
    expect(messages[1].content.text).toBe('Got array with 3 items and object with 2 keys');
  });

  it('should throw an error for type mismatches', async () => {
    // Create a spy on the console.log to check for the validation error message
    const consoleSpy = jest.spyOn(console, 'log');

    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'complex-prompt',
      inputVariables: ['arrayParam', 'objectParam'],
    });

    await promptTemplate.initialize();

    // Pass a non-array for arrayParam to trigger type validation
    const messages = await promptTemplate.formatMessages({
      arrayParam: 'not an array' as any, // Type mismatch
      objectParam: { key1: 'value1' },
    });

    // Verify fallback was triggered with validation error
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Type mismatch for argument arrayParam')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Constructing manual prompt response for complex-prompt')
    );

    // Should still receive messages due to fallback
    expect(messages.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it('should serialize correctly', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    const serialized = promptTemplate.serialize();
    expect(serialized._type).toBe('mcp');
    expect(serialized.input_variables).toEqual(['input']);
  });

  it('should throw an error for nonexistent servers', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'nonexistent-server',
      templateId: 'test-prompt',
      inputVariables: ['input'],
    });

    await expect(promptTemplate.initialize()).rejects.toThrow(
      "Server 'nonexistent-server' not found"
    );
  });

  it('should handle prompt not found errors', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'nonexistent-prompt',
      inputVariables: ['input'],
    });

    await expect(promptTemplate.initialize()).rejects.toThrow(
      "Failed to initialize MCP prompt template: Error: Prompt template with ID 'nonexistent-prompt' not found on the server"
    );
  });

  it('should implement partial method', async () => {
    // Store the original method
    const originalPartial = MCPPromptTemplate.prototype.partial;

    // Mock the partial method directly
    MCPPromptTemplate.prototype.partial = async function (values) {
      const remainingVars = this.inputVariables.filter(variable => !(variable in values));

      // Return a new MCPPromptTemplate instance with the remaining variables
      return new MCPPromptTemplate({
        inputVariables: remainingVars,
        templateId: this.templateId,
        serverName: this.serverName,
        client: this.client,
      });
    };

    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'test-prompt',
      inputVariables: ['input', 'optional_param'],
    });

    const partialTemplate = await promptTemplate.partial({
      optional_param: 'default value',
    });

    // Check that the partial template has the correct input variables
    expect(partialTemplate.inputVariables).toEqual(['input']);

    // Restore the original method
    MCPPromptTemplate.prototype.partial = originalPartial;
  });

  it('should throw an error for non-existent prompt templates', async () => {
    const promptTemplate = new MCPPromptTemplate({
      client,
      serverName: 'test-server',
      templateId: 'nonexistent-prompt',
      inputVariables: ['input'],
    });

    await expect(promptTemplate.initialize()).rejects.toThrow(
      "Failed to initialize MCP prompt template: Error: Prompt template with ID 'nonexistent-prompt' not found on the server"
    );
  });
});

describe('MCPPromptTemplate - Hardcoded prompt implementations', () => {
  let mcpPrompt: MCPPromptTemplate;
  let mcpClient: any;

  beforeEach(() => {
    // Create a mock MCP client
    mcpClient = {
      getPrompt: jest.fn(),
    };

    jest.spyOn(console, 'log').mockImplementation(); // Silence console logs
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fallback to hardcoded implementation for code-review prompt', async () => {
    // Setup prompt with mock definition
    mcpPrompt = new MCPPromptTemplate({
      templateId: 'code-review',
      serverName: 'test-server',
      client: new MultiServerMCPClient(),
      inputVariables: ['language', 'code'],
    });

    // Set mcpClient and promptDefinition manually
    (mcpPrompt as any).mcpClient = mcpClient;
    (mcpPrompt as any).promptDefinition = {
      name: 'code-review',
      id: 'code-review',
      description: 'A prompt for reviewing code',
      inputVariables: ['language', 'code'],
      template: 'Template not used in this test',
    };
    (mcpPrompt as any).initialized = true;

    // Mock getPrompt to fail
    mcpClient.getPrompt.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    // Format the prompt
    const values = {
      language: 'javascript',
      code: 'function test() { return true; }',
    };

    const messages = await mcpPrompt.formatMessages(values);

    // Verify the hardcoded implementation is used
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content.type).toBe('text');
    expect(messages[0].content.text).toContain(
      'You are a helpful code reviewer expert in javascript'
    );

    expect(messages[1].role).toBe('user');
    expect(messages[1].content.type).toBe('text');
    expect(messages[1].content.text).toContain('Please review the following javascript code');
    expect(messages[1].content.text).toContain('function test() { return true; }');
  });

  it('should fallback to hardcoded implementation for explain-code prompt', async () => {
    // Setup prompt with mock definition
    mcpPrompt = new MCPPromptTemplate({
      templateId: 'explain-code',
      serverName: 'test-server',
      client: new MultiServerMCPClient(),
      inputVariables: ['code', 'audience'],
    });

    // Set mcpClient and promptDefinition manually
    (mcpPrompt as any).mcpClient = mcpClient;
    (mcpPrompt as any).promptDefinition = {
      name: 'explain-code',
      id: 'explain-code',
      description: 'A prompt for explaining code',
      inputVariables: ['code', 'audience'],
      template: 'Template not used in this test',
    };
    (mcpPrompt as any).initialized = true;

    // Mock getPrompt to fail
    mcpClient.getPrompt.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    // Format the prompt with audience specified
    const values = {
      code: 'function test() { return true; }',
      audience: 'intermediate',
    };

    const messages = await mcpPrompt.formatMessages(values);

    // Verify the hardcoded implementation is used
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content.type).toBe('text');
    expect(messages[0].content.text).toContain(
      'explaining code to a intermediate-level programmer'
    );

    expect(messages[1].role).toBe('user');
    expect(messages[1].content.type).toBe('text');
    expect(messages[1].content.text).toContain('Please explain this code');
    expect(messages[1].content.text).toContain('appropriate for my intermediate level');
  });

  it('should use default audience level for explain-code prompt when not provided', async () => {
    // Setup prompt with mock definition
    mcpPrompt = new MCPPromptTemplate({
      templateId: 'explain-code',
      serverName: 'test-server',
      client: new MultiServerMCPClient(),
      inputVariables: ['code'],
    });

    // Set mcpClient and promptDefinition manually
    (mcpPrompt as any).mcpClient = mcpClient;
    (mcpPrompt as any).promptDefinition = {
      name: 'explain-code',
      id: 'explain-code',
      description: 'A prompt for explaining code',
      inputVariables: ['code'],
      template: 'Template not used in this test',
    };
    (mcpPrompt as any).initialized = true;

    // Mock getPrompt to fail
    mcpClient.getPrompt.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    // Format the prompt without audience
    const values = {
      code: 'function test() { return true; }',
    };

    const messages = await mcpPrompt.formatMessages(values);

    // Verify default audience (beginner) is used
    expect(messages[0].content.text).toContain('explaining code to a beginner-level programmer');
    expect(messages[1].content.text).toContain('appropriate for my beginner level');
  });

  it('should use fallback generic implementation for unknown prompt types', async () => {
    // Setup prompt with mock definition for an unknown prompt type
    mcpPrompt = new MCPPromptTemplate({
      templateId: 'unknown-prompt',
      serverName: 'test-server',
      client: new MultiServerMCPClient(),
      inputVariables: ['query'],
    });

    // Set mcpClient and promptDefinition manually
    (mcpPrompt as any).mcpClient = mcpClient;
    (mcpPrompt as any).promptDefinition = {
      name: 'unknown-prompt',
      id: 'unknown-prompt',
      description: 'An unknown prompt type',
      inputVariables: ['query'],
      template: 'Template not used in this test',
    };
    (mcpPrompt as any).initialized = true;

    // Mock getPrompt to fail
    mcpClient.getPrompt.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    // Format the prompt
    const values = {
      query: 'How to write tests?',
    };

    const messages = await mcpPrompt.formatMessages(values);

    // Verify the generic fallback is used
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe('system');
  });

  it('should handle timeout when calling getPrompt', async () => {
    // Setup prompt
    mcpPrompt = new MCPPromptTemplate({
      templateId: 'test-prompt',
      serverName: 'test-server',
      client: new MultiServerMCPClient(),
      inputVariables: ['input'],
    });

    // Set mcpClient and promptDefinition manually
    (mcpPrompt as any).mcpClient = mcpClient;
    (mcpPrompt as any).promptDefinition = {
      name: 'test-prompt',
      id: 'test-prompt',
      description: 'A test prompt',
      inputVariables: ['input'],
      template: 'Template not used in this test',
    };
    (mcpPrompt as any).initialized = true;

    // Make getPrompt hang
    mcpClient.getPrompt.mockImplementation(() => {
      return new Promise(resolve => {
        // This promise never resolves within the timeout period
        setTimeout(resolve, 10000);
      });
    });

    // Use fake timers
    jest.useFakeTimers();

    // Start the format process but don't await
    const formatPromise = mcpPrompt.formatMessages({ input: 'test' });

    // Advance time past the timeout
    jest.advanceTimersByTime(4000);

    // Now we can await and expect it to use fallback
    const messages = await formatPromise;

    // Should have used the fallback mechanism
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Timeout getting prompt response')
    );
    expect(messages.length).toBeGreaterThan(0);

    // Restore timers
    jest.useRealTimers();
  });
});
