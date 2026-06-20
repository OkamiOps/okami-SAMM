'use strict';
// Agent Communication Protocol (REST) — BeeAI / Linux Foundation style.
// Exposes the SAMM system as an "agent" other agents can call over HTTP.
// Mounted at /acp:  GET /acp/ping · GET /acp/agents · GET /acp/agents/:name
//                   POST /acp/runs · GET /acp/runs/:id
//
// The samm-operator agent executes a structured command. Send an input message
// whose text part is JSON: { "tool": "<name>", "args": { ... } }
// (tool "help" lists the available tools). Output is a message with the result.
const express = require('express');
const { TOOLS, byName, execute, jsonSchema } = require('./operations');

const AGENT = 'samm-operator';
const runs = new Map(); // run_id -> run (in-memory; single-user)
let seq = 0;
const nowIso = () => new Date().toISOString();

function manifest() {
  return {
    name: AGENT,
    description: 'Operate the Okami OWASP SAMM v2 maturity assessment system: discover the model, create assessments, answer questions, set targets/notes, read scorecard/roadmap, snapshot and generate the PDF report. Send a text part with JSON {"tool","args"}.',
    metadata: {
      programming_language: 'JavaScript',
      framework: 'okami-samm',
      capabilities: ['read', 'write', 'report'],
      input_content_types: ['application/json', 'text/plain'],
      output_content_types: ['application/json'],
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: jsonSchema(t) })),
    },
  };
}

function textOf(messages) {
  // concatenate all text parts of the input messages
  let out = '';
  for (const m of (messages || [])) for (const p of (m.parts || [])) {
    if (typeof p.content === 'string') out += p.content;
    else if (p.content != null) out += JSON.stringify(p.content);
  }
  return out.trim();
}

function msg(obj) { return { role: 'agent/' + AGENT, parts: [{ content_type: 'application/json', content: JSON.stringify(obj) }] }; }

async function runCommand(text) {
  let cmd;
  try { cmd = JSON.parse(text); } catch (_) { throw new Error('input must be JSON: {"tool":"...","args":{...}}'); }
  const tool = cmd.tool || cmd.name;
  if (!tool || tool === 'help') return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: jsonSchema(t) })) };
  if (!byName[tool]) throw new Error('unknown tool: ' + tool + ' (use {"tool":"help"})');
  return execute(tool, cmd.args || cmd.arguments || {});
}

const router = express.Router();

router.get('/ping', (req, res) => res.json({ status: 'ok' }));
router.get('/agents', (req, res) => res.json({ agents: [manifest()] }));
router.get('/agents/:name', (req, res) => {
  if (req.params.name !== AGENT) return res.status(404).json({ error: 'agent not found' });
  res.json(manifest());
});

router.post('/runs', async (req, res) => {
  const body = req.body || {};
  if (body.agent_name && body.agent_name !== AGENT) return res.status(404).json({ error: 'agent not found: ' + body.agent_name });
  const run_id = 'run_' + (++seq) + '_' + Date.now().toString(36);
  const run = { run_id, agent_name: AGENT, session_id: body.session_id || null, status: 'in-progress', output: [], created_at: nowIso(), finished_at: null, error: null };
  runs.set(run_id, run);
  try {
    const result = await runCommand(textOf(body.input));
    run.status = 'completed'; run.output = [msg(result)]; run.finished_at = nowIso();
  } catch (e) {
    run.status = 'failed'; run.error = { code: e.code || 'error', message: e.message }; run.finished_at = nowIso();
  }
  // sync mode (default) returns the finished run; async callers can still GET it
  res.status(run.status === 'failed' ? 200 : 201).json(run);
});

router.get('/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
});

module.exports = { router, AGENT, manifest };
