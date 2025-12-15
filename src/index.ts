#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ForgejoMCPServer } from './server.js';

async function main() {
  const mcpServer = new ForgejoMCPServer();
  const transport = new StdioServerTransport();
  await mcpServer.getServer().connect(transport);
  console.error('Forgejo MCP server started (stdio transport)');
}

main().catch(console.error);