# Forgejo MCP Server

A Model Context Protocol (MCP) server that provides tools to interact with Forgejo repositories. Supports both stdio transport (for Claude Desktop) and Streamable HTTP transport with SSE (for web clients and other integrations).

![Forgejo MCP Server](.github/img/image.png)

## Features

- List repositories
- Get repository information
- List issues with filtering by state
- Create new issues
- Read file contents from repositories
- **Multiple Transports**: Supports both stdio and Streamable HTTP (with SSE) transports

## Security

This server has been security audited and includes:
- Input validation to prevent injection attacks
- Path traversal protection
- Secure error handling that doesn't leak sensitive information
- Environment variable validation
- URL encoding for all API parameters

For detailed security information, see [SECURITY.md](SECURITY.md).

## Installation

```bash
git clone https://github.com/nsvk13/forgejo-mcp-server
cd forgejo-mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables

Set the following environment variables:

- `FORGEJO_BASE_URL`: Your Forgejo instance URL (e.g., `https://your-forgejo.com`)
- `FORGEJO_TOKEN`: Your Forgejo API token

### Generating a Forgejo API Token

1. Go to your Forgejo instance
2. Navigate to Settings → Applications
3. Generate a new token with appropriate permissions
4. Copy the token for use in configuration

### Claude Desktop Configuration (Stdio Transport)

Add the following to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "forgejo": {
      "command": "node",
      "args": ["/absolute/path/to/forgejo-mcp-server/dist/index.js"],
      "env": {
        "FORGEJO_BASE_URL": "https://your-forgejo-instance.com",
        "FORGEJO_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Replace the path and credentials with your actual values.

### Streamable HTTP Server (Web Integration)

For web clients or custom integrations, run the HTTP server:

```bash
# Set environment variables
export FORGEJO_BASE_URL="https://your-forgejo-instance.com"
export FORGEJO_TOKEN="your_api_token_here"
export PORT=3000  # Optional, defaults to 3000

# Start the HTTP server
npm run start:http
```

The server uses the MCP Streamable HTTP transport protocol, which uses SSE (Server-Sent Events) for server-to-client messages. The endpoint at `http://localhost:3000/mcp` supports:
- **POST** for initialization and sending requests
- **GET** for establishing the event stream (requires `mcp-session-id` header)
- **DELETE** for session termination

A health check endpoint is available at `http://localhost:3000/health`.

## Usage

### With Claude Desktop (Stdio)

After configuration, restart Claude Desktop. You can then use commands like:

- "List my Forgejo repositories"
- "Show issues in repository owner/repo-name"
- "Create an issue in repository with title 'Bug report'"
- "Show the contents of README.md from repository"

### With Streamable HTTP

The HTTP server can be integrated with any MCP-compatible client that supports the Streamable HTTP transport protocol. Use the `/mcp` endpoint with proper session management.

## Available Tools

- `list_repositories`: Get list of user repositories
- `get_repository`: Get detailed repository information
- `list_issues`: List issues with optional state filtering
- `create_issue`: Create a new issue
- `get_file_content`: Read file contents from repository

## Development

```bash
# Build the project
npm run build

# Run stdio server in development mode
npm run dev

# Run HTTP server in development mode
npm run dev:http
```

## Requirements

- Node.js 18 or higher
- npm or bun
- TypeScript
- Valid Forgejo instance with API access