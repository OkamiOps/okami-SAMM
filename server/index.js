'use strict';
const path = require('path');
const express = require('express');
const db = require('./db');
const ai = require('./ai');
const { publicConfig } = require('./config');
const { generatePDF } = require('./report/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '4mb' }));

// CORS — same-origin when served behind the Cloudflare Pages proxy, but allow a
// configurable origin (CORS_ORIGIN, comma-separated or "*") when the frontend
// calls the backend directly.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
if (CORS_ORIGIN) {
  const allow = CORS_ORIGIN.split(',').map((s) => s.trim());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (CORS_ORIGIN === '*') res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && allow.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

const slug = (s) => String(s || 'assessment').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'assessment';
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message || 'internal error' });
});

// ---- health & config ----
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json(publicConfig()));

// ---- assessments CRUD ----
app.get('/api/assessments', (req, res) => res.json(db.listAssessments()));

app.post('/api/assessments', wrap((req, res) => {
  const state = req.body && req.body.state;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'missing state' });
  res.status(201).json(db.createAssessment(state));
}));

app.get('/api/assessments/:id', wrap((req, res) => {
  const a = db.getAssessment(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(a);
}));

app.put('/api/assessments/:id', wrap((req, res) => {
  const state = req.body && req.body.state;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'missing state' });
  const a = db.updateAssessment(req.params.id, state);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(a);
}));

app.delete('/api/assessments/:id', wrap((req, res) => {
  res.json({ deleted: db.deleteAssessment(req.params.id) });
}));

// ---- full backup / restore ----
app.get('/api/backup', wrap((req, res) => {
  const data = db.exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="okami-samm-backup-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

app.post('/api/restore', wrap((req, res) => {
  const body = req.body || {};
  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  try {
    res.json(db.importAll(body, mode));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ---- snapshots ----
app.get('/api/assessments/:id/snapshots', wrap((req, res) => res.json(db.listSnapshots(req.params.id))));
app.post('/api/assessments/:id/snapshots', wrap((req, res) => {
  const { state, label } = req.body || {};
  if (!state) return res.status(400).json({ error: 'missing state' });
  const snap = db.addSnapshot(req.params.id, state, label);
  if (!snap) return res.status(404).json({ error: 'assessment not found' });
  res.status(201).json(snap);
}));

// ---- PDF report (saved assessment) ----
app.get('/api/assessments/:id/report.pdf', wrap(async (req, res) => {
  const a = db.getAssessment(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const pdf = await generatePDF(a);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="okami-maturity-${slug(a.org || a.team)}.pdf"`);
  res.send(pdf);
}));

// ---- PDF report (unsaved state preview) ----
app.post('/api/report/preview.pdf', wrap(async (req, res) => {
  const state = req.body && req.body.state;
  if (!state) return res.status(400).json({ error: 'missing state' });
  const pdf = await generatePDF({ state, created_at: new Date().toISOString() });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="okami-maturity-${slug(state.meta && state.meta.org)}.pdf"`);
  res.send(pdf);
}));

// ---- AI proxy (optional) ----
app.post('/api/ai/suggest', wrap(async (req, res) => {
  if (!ai.isEnabled()) return res.status(503).json({ error: 'AI disabled' });
  const messages = (req.body && req.body.messages) || [];
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'missing messages' });
  try {
    const text = await ai.complete(messages);
    res.json({ text });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

// ---- MCP (Streamable HTTP) — AI clients connect at /mcp ----
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./mcp');

app.post('/mcp', wrap(async (req, res) => {
  // stateless: a fresh server+transport per request (single-user, low traffic)
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}));
// Stateless mode has no server-initiated stream / session teardown.
app.get('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed (stateless MCP — use POST)' }));
app.delete('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed' }));

// ---- Agent Communication Protocol (REST) — agent-to-agent at /acp ----
app.use('/acp', require('./acp-comm').router);

// ---- static frontend ----
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => console.log(`Okami SAMM listening on http://localhost:${PORT}`));
