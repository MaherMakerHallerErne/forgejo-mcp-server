import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { 
  ForgejoConfig,
  Repository,
  Issue,
  FileContent
} from './types/forgejo.types';

export class ForgejoMCPServer {
  private server: Server;
  private config: ForgejoConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'forgejo-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Validate required environment variables
    if (!process.env.FORGEJO_BASE_URL || !process.env.FORGEJO_TOKEN) {
      throw new Error('Missing required environment variables: FORGEJO_BASE_URL and FORGEJO_TOKEN must be set');
    }

    // Validate and sanitize base URL
    const baseUrl = process.env.FORGEJO_BASE_URL.trim();
    try {
      const url = new URL(baseUrl);
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol: Only HTTP and HTTPS are allowed');
      }
    } catch (error) {
      throw new Error(`Invalid FORGEJO_BASE_URL: ${error instanceof Error ? error.message : 'Invalid URL format'}`);
    }

    this.config = {
      baseUrl: baseUrl.replace(/\/+$/, ''), // Remove trailing slashes
      token: process.env.FORGEJO_TOKEN.trim(),
    };

    this.setupToolHandlers();
  }

  /**
   * Validates that a string contains only safe characters (alphanumeric, dash, underscore, dot)
   * Prevents path traversal and injection attacks
   */
  private validateSafeName(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${fieldName} is required and must be a non-empty string`
      );
    }

    // Check for path traversal attempts
    if (value.includes('..') || value.includes('/') || value.includes('\\')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${fieldName} contains invalid characters (path traversal detected)`
      );
    }

    // Allow alphanumeric, dash, underscore, and dot
    const safePattern = /^[a-zA-Z0-9._-]+$/;
    if (!safePattern.test(value)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${fieldName} contains invalid characters. Only alphanumeric, dash, underscore, and dot are allowed`
      );
    }
  }

  /**
   * Validates and sanitizes file paths to prevent path traversal attacks
   */
  private validateFilePath(path: string): void {
    if (!path || typeof path !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'File path is required and must be a non-empty string'
      );
    }

    // Check for path traversal attempts
    if (path.includes('..')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'File path contains invalid sequence (path traversal detected)'
      );
    }

    // Prevent absolute paths
    if (path.startsWith('/') || path.startsWith('\\')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'File path must be relative'
      );
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\0/,           // Null byte
      /[<>"|?*]/,     // Windows forbidden characters
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(path)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'File path contains forbidden characters'
        );
      }
    }
  }

  /**
   * Validates git reference (branch, tag, or commit SHA)
   */
  private validateGitRef(ref: string): void {
    if (!ref || typeof ref !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Git reference is required and must be a non-empty string'
      );
    }

    // Allow alphanumeric, dash, underscore, dot, and slash for branch names
    const refPattern = /^[a-zA-Z0-9._/-]+$/;
    if (!refPattern.test(ref)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Git reference contains invalid characters'
      );
    }

    // Prevent path traversal
    if (ref.includes('..')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Git reference contains invalid sequence'
      );
    }
  }

  private async forgejoRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.config.baseUrl}/api/v1${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        // Don't expose internal error details to prevent information disclosure
        const statusCode = response.status;
        let errorMessage = 'Forgejo API request failed';
        
        // Provide user-friendly error messages for common status codes
        switch (statusCode) {
          case 400:
            errorMessage = 'Bad request: Invalid parameters provided';
            break;
          case 401:
            errorMessage = 'Authentication failed: Invalid or expired token';
            break;
          case 403:
            errorMessage = 'Access denied: Insufficient permissions';
            break;
          case 404:
            errorMessage = 'Resource not found';
            break;
          case 422:
            errorMessage = 'Validation failed: Invalid data provided';
            break;
          case 429:
            errorMessage = 'Rate limit exceeded: Too many requests';
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            errorMessage = 'Server error: The Forgejo server is experiencing issues';
            break;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `${errorMessage} (Status: ${statusCode})`
        );
      }

      return response.json();
    } catch (error) {
      // Handle network errors and other exceptions
      if (error instanceof McpError) {
        throw error;
      }
      
      // Don't expose detailed error information
      throw new McpError(
        ErrorCode.InternalError,
        'Failed to communicate with Forgejo API. Please check your network connection and configuration.'
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_repositories',
          description: 'Get list of user repositories',
          inputSchema: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'Username (optional, defaults to current user)',
              },
            },
          },
        },
        {
          name: 'get_repository',
          description: 'Get repository information',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'list_issues',
          description: 'Get list of repository issues',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              state: { 
                type: 'string', 
                enum: ['open', 'closed', 'all'],
                description: 'Issue state',
                default: 'open'
              },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'create_issue',
          description: 'Create a new issue',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              title: { type: 'string', description: 'Issue title' },
              body: { type: 'string', description: 'Issue description' },
            },
            required: ['owner', 'repo', 'title'],
          },
        },
        {
          name: 'get_file_content',
          description: 'Get file content from repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              path: { type: 'string', description: 'File path' },
              ref: { 
                type: 'string', 
                description: 'Branch or commit (defaults to main)',
                default: 'main'
              },
            },
            required: ['owner', 'repo', 'path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'list_repositories':
          return this.listRepositories(request.params.arguments);
        
        case 'get_repository':
          return this.getRepository(request.params.arguments);
        
        case 'list_issues':
          return this.listIssues(request.params.arguments);
        
        case 'create_issue':
          return this.createIssue(request.params.arguments);
        
        case 'get_file_content':
          return this.getFileContent(request.params.arguments);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async listRepositories(args: any) {
    // Validate username if provided
    if (args?.username) {
      this.validateSafeName(args.username, 'username');
    }

    const endpoint = args?.username 
      ? `/users/${encodeURIComponent(args.username)}/repos`
      : '/user/repos';
    
    const repos = await this.forgejoRequest(endpoint) as Repository[];
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${repos.length} repositories:\n\n` +
                repos.map(repo => 
                  `• ${repo.full_name} - ${repo.description || 'No description'}`
                ).join('\n'),
        },
      ],
    };
  }

  private async getRepository(args: any) {
    if (!args?.owner || !args?.repo) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Both owner and repo are required parameters'
      );
    }

    this.validateSafeName(args.owner, 'owner');
    this.validateSafeName(args.repo, 'repo');

    const repository = await this.forgejoRequest(
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}`
    ) as Repository;
    
    return {
      content: [
        {
          type: 'text',
          text: `Repository: ${repository.full_name}\n` +
                `ID: ${repository.id}\n` +
                `Description: ${repository.description || 'No description'}`,
        },
      ],
    };
  }

  private async listIssues(args: any) {
    if (!args?.owner || !args?.repo) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Both owner and repo are required parameters'
      );
    }

    this.validateSafeName(args.owner, 'owner');
    this.validateSafeName(args.repo, 'repo');

    const state = args.state || 'open';
    // Validate state parameter
    const validStates = ['open', 'closed', 'all'];
    if (!validStates.includes(state)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid state parameter. Must be one of: ${validStates.join(', ')}`
      );
    }

    const issues = await this.forgejoRequest(
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues?state=${encodeURIComponent(state)}`
    ) as Issue[];
    
    return {
      content: [
        {
          type: 'text',
          text: `Issues in repository ${args.owner}/${args.repo} (${state}):\n\n` +
                issues.map(issue => 
                  `#${issue.number}: ${issue.title} [${issue.state}]`
                ).join('\n'),
        },
      ],
    };
  }

  private async createIssue(args: any) {
    if (!args?.owner || !args?.repo || !args?.title) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'owner, repo, and title are required parameters'
      );
    }

    this.validateSafeName(args.owner, 'owner');
    this.validateSafeName(args.repo, 'repo');

    // Validate title length
    if (args.title.length > 255) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Title is too long (maximum 255 characters)'
      );
    }

    // Validate body length if provided
    const body = args.body || '';
    if (body.length > 65535) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Body is too long (maximum 65535 characters)'
      );
    }
    
    const newIssue = await this.forgejoRequest(
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues`, 
      {
        method: 'POST',
        body: JSON.stringify({
          title: args.title,
          body: body,
        }),
      }
    ) as Issue;
    
    return {
      content: [
        {
          type: 'text',
          text: `Issue created successfully!\n` +
                `Number: #${newIssue.number}\n` +
                `Title: ${newIssue.title}\n` +
                `URL: ${newIssue.html_url}`,
        },
      ],
    };
  }

  private async getFileContent(args: any) {
    if (!args?.owner || !args?.repo || !args?.path) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'owner, repo, and path are required parameters'
      );
    }

    this.validateSafeName(args.owner, 'owner');
    this.validateSafeName(args.repo, 'repo');
    this.validateFilePath(args.path);

    const ref = args.ref || 'main';
    this.validateGitRef(ref);
    
    const fileData = await this.forgejoRequest(
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${encodeURIComponent(args.path)}?ref=${encodeURIComponent(ref)}`
    ) as FileContent;
    
    // Validate that we received content
    if (!fileData.content || fileData.encoding !== 'base64') {
      throw new McpError(
        ErrorCode.InternalError,
        'Invalid file content received from API'
      );
    }

    // Safely decode base64 content
    let content: string;
    try {
      content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        'Failed to decode file content'
      );
    }

    // Limit content size for response
    const maxContentSize = 1000000; // 1MB
    if (content.length > maxContentSize) {
      content = content.substring(0, maxContentSize) + '\n\n[Content truncated - file too large]';
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `File: ${args.path} (branch: ${ref})\n` +
                `Size: ${fileData.size} bytes\n\n` +
                `Content:\n\`\`\`\n${content}\n\`\`\``,
        },
      ],
    };
  }

  /**
   * Get the underlying Server instance for connecting to a transport
   */
  getServer(): Server {
    return this.server;
  }
}
