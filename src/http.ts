#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { ForgejoMCPServer } from './server.js';

// Create Express application with MCP middleware
const app = createMcpExpressApp();

// Enable CORS for web clients
app.use(cors());

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Factory function to create a new MCP server instance
function createServer() {
  return new ForgejoMCPServer();
}

// Handle all MCP Streamable HTTP requests (GET, POST, DELETE) on a single endpoint
app.all('/mcp', async (req, res) => {
  console.log(`Received ${req.method} request to /mcp`);
  
  try {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      // Create new transport for initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          // Store the transport by session ID when session is initialized
          console.log(`StreamableHTTP session initialized with ID: ${id}`);
          transports[id] = transport!;
        }
      });

      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`);
          delete transports[sid];
        }
      };

      // Connect the transport to the MCP server
      const server = createServer();
      await server.getServer().connect(transport);
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or invalid initialization request'
        },
        id: null
      });
      return;
    }

    // Handle the request with the transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: Object.keys(transports).length
  });
});

// Start the server
const PORT = (() => {
  if (!process.env.PORT) return 3000;
  const port = parseInt(process.env.PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid PORT environment variable: ${process.env.PORT}. Using default port 3000.`);
    return 3000;
  }
  return port;
})();

app.listen(PORT, () => {
  console.log(`Forgejo MCP HTTP server listening on port ${PORT}`);
  console.log(`
==============================================
MCP HTTP ENDPOINT:
  Endpoint: http://localhost:${PORT}/mcp
  Methods: GET, POST, DELETE
  
  Usage:
    - Initialize with POST to /mcp
    - Establish SSE stream with GET to /mcp (with mcp-session-id header)
    - Send requests with POST to /mcp (with mcp-session-id header)
    - Terminate session with DELETE to /mcp (with mcp-session-id header)

HEALTH CHECK:
  Endpoint: http://localhost:${PORT}/health
  Method: GET
==============================================
`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  
  console.log('Server shutdown complete');
  process.exit(0);
});
