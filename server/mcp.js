'use strict';
// MCP server exposing the Okami SAMM system to AI clients — read + operate.
// Tool logic lives in server/operations.js (shared with ACP); here we just
// wrap each operation as an MCP tool. Used by the stdio entry
// (server/mcp-stdio.js) and the HTTP transport mounted in server/index.js.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SAMM } = require('./score');
const { TOOLS } = require('./operations');

const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const errOut = (msg) => ({ content: [{ type: 'text', text: 'Error: ' + msg }], isError: true });

function createMcpServer() {
  const server = new McpServer({ name: 'okami-samm', version: require('../package.json').version });

  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.input || {} }, async (args) => {
      try { return ok(await t.run(args)); } catch (e) { return errOut(e.message); }
    });
  }

  server.registerResource('samm-model', 'samm://model', { description: 'The OWASP SAMM v2 model (functions, practices, questions).', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(SAMM) }] }));

  return server;
}

module.exports = { createMcpServer };
