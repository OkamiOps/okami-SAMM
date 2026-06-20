#!/usr/bin/env node
'use strict';
// Agent Client Protocol (Zed) — JSON-RPC 2.0 over stdio (newline-delimited).
// Point your ACP client (e.g. Zed) at:  node /path/to/server/acp-client-stdio.js
// Operates the same SQLite DB as the web server (DB_PATH env var).
const { createAgent } = require('./acp-client');

const agent = createAgent();
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  // notification (no id)
  if (msg.id === undefined || msg.id === null) {
    if (msg.method) { try { agent.onNotification(msg.method, msg.params); } catch (_) {} }
    return;
  }
  // request
  try {
    const result = await agent.onRequest(msg.method, msg.params || {}, notify);
    send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: typeof e.code === 'number' ? e.code : -32603, message: e.message } });
  }
}

process.stderr.write('okami-samm ACP (Agent Client Protocol, stdio) ready\n');
