#!/usr/bin/env node
'use strict';
// Stdio MCP entry — for local AI clients (Claude Desktop, Claude Code, etc.).
// Configure the client to run:  node /path/to/okami-samm/server/mcp-stdio.js
// It operates the same SQLite DB as the web server (DB_PATH env var).
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer } = require('./mcp');

(async () => {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — log to stderr only.
  process.stderr.write('okami-samm MCP (stdio) ready\n');
})().catch((e) => { process.stderr.write('MCP stdio failed: ' + e.message + '\n'); process.exit(1); });
