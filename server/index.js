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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (CORS_ORIGIN !== '*') res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

const slug = (s) => String(s || 'assessment').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'assessment';
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message || 'internal error' });
});

// ---- health & config (public) ----
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json(Object.assign({ authEnabled: true, needsSetup: db.countUsers() === 0 }, publicConfig())));

// ---- API docs: OpenAPI spec + Swagger UI (public, self-hosted, no CDN) ----
app.get('/api/openapi.json', (req, res) => res.json(require('./openapi').spec()));
app.use('/docs/static', express.static(require('swagger-ui-dist').getAbsoluteFSPath()));
app.get('/docs', (req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<title>Okami SAMM — API docs</title><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/docs/static/swagger-ui.css">
<style>body{margin:0;background:#fff}.topbar{display:none}</style></head><body>
<div id="swagger"></div>
<script src="/docs/static/swagger-ui-bundle.js"></script>
<script>window.onload=function(){SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger',deepLinking:true,persistAuthorization:true,presets:[SwaggerUIBundle.presets.apis]});};</script>
</body></html>`));

// ---- auth (public endpoints) ----
const auth = require('./auth');

app.post('/api/auth/setup', wrap((req, res) => {
  if (db.countUsers() > 0) return res.status(403).json({ error: 'already set up' });
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 6) return res.status(400).json({ error: 'username and password (min 6) required' });
  const u = db.createUser({ username: String(username).trim(), password_hash: auth.hashPassword(password), role: 'admin', api_token: auth.newApiToken() });
  auth.setSessionCookie(res, u);
  res.status(201).json(db.userPublic(u));
}));

app.post('/api/auth/login', wrap((req, res) => {
  const { username, password } = req.body || {};
  const u = db.getUserByUsername(String(username || '').trim());
  if (!u || !auth.verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'invalid credentials' });
  auth.setSessionCookie(res, u);
  res.json(db.userPublic(u));
}));

app.post('/api/auth/logout', (req, res) => { auth.clearSessionCookie(res); res.json({ ok: true }); });

app.get('/api/auth/me', (req, res) => {
  const u = auth.currentUser(req);
  if (!u) return res.status(401).json({ error: 'not authenticated' });
  res.json(Object.assign(db.userPublic(u), { apiToken: u.api_token }));
});

app.post('/api/auth/token', auth.requireAuth, wrap((req, res) => {
  const tok = auth.newApiToken();
  db.updateUser(req.user.id, { api_token: tok });
  res.json({ apiToken: tok });
}));

// ---- user management (admin) ----
app.get('/api/users', auth.requireAdmin, (req, res) => res.json(db.listUsers()));
app.post('/api/users', auth.requireAdmin, wrap((req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || String(password).length < 6) return res.status(400).json({ error: 'username and password (min 6) required' });
  if (db.getUserByUsername(String(username).trim())) return res.status(409).json({ error: 'username already exists' });
  const u = db.createUser({ username: String(username).trim(), password_hash: auth.hashPassword(password), role: role === 'admin' ? 'admin' : 'user', api_token: auth.newApiToken() });
  res.status(201).json(db.userPublic(u));
}));
app.put('/api/users/:id', auth.requireAdmin, wrap((req, res) => {
  const u = db.getUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  const fields = {};
  if (req.body.role) fields.role = req.body.role === 'admin' ? 'admin' : 'user';
  if (req.body.password) { if (String(req.body.password).length < 6) return res.status(400).json({ error: 'password min 6' }); fields.password_hash = auth.hashPassword(req.body.password); }
  // never demote/remove the last admin
  if (fields.role === 'user' && u.role === 'admin' && db.listUsers().filter((x) => x.role === 'admin').length <= 1) return res.status(400).json({ error: 'cannot demote the last admin' });
  res.json(db.userPublic(db.updateUser(req.params.id, fields)));
}));
app.delete('/api/users/:id', auth.requireAdmin, wrap((req, res) => {
  const u = db.getUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  if (u.role === 'admin' && db.listUsers().filter((x) => x.role === 'admin').length <= 1) return res.status(400).json({ error: 'cannot delete the last admin' });
  res.json({ deleted: db.deleteUser(req.params.id) });
}));

// ---- settings (admin): AI config (BYOK) + retention ----
const AI_FIELDS = ['ai_provider', 'ai_base_url', 'ai_model', 'ai_preset', 'ai_auth_method'];
app.get('/api/settings', auth.requireAdmin, (req, res) => {
  const key = db.getSetting('ai_api_key') || '';
  res.json({
    ai_provider: db.getSetting('ai_provider') || '',
    ai_base_url: db.getSetting('ai_base_url') || '',
    ai_model: db.getSetting('ai_model') || '',
    ai_preset: db.getSetting('ai_preset') || '',
    ai_auth_method: db.getSetting('ai_auth_method') || 'api_key',
    ai_api_key_set: !!key,
    ai_api_key_hint: key ? '••••' + key.slice(-4) : '',
    ai_enabled: ai.isEnabled(),
    ai_provider_active: ai.isEnabled() ? ai.providerName() : null,
    ai_oauth_provider: db.getSetting('ai_oauth_provider') || null,
    ai_oauth_expiry: db.getSetting('ai_oauth_expiry') || null,
    oauth_login_providers: require('./oauth').available(),
    retention_days: Number(db.getSetting('retention_days') || 0),
  });
});
app.put('/api/settings', auth.requireAdmin, wrap((req, res) => {
  const b = req.body || {};
  for (const k of AI_FIELDS) if (typeof b[k] === 'string') db.setSetting(k, b[k].trim());
  const clearOAuth = () => { db.setSetting('ai_oauth_provider', ''); db.setSetting('ai_oauth_refresh', ''); db.setSetting('ai_oauth_expiry', ''); db.setSetting('ai_auth_header', ''); };
  if (b.clear_api_key) { db.setSetting('ai_api_key', ''); clearOAuth(); }
  else if (typeof b.ai_api_key === 'string' && b.ai_api_key.trim()) { db.setSetting('ai_api_key', b.ai_api_key.trim()); clearOAuth(); }  // manual key replaces any OAuth session
  if (b.retention_days != null) db.setSetting('retention_days', String(Math.max(0, parseInt(b.retention_days, 10) || 0)));
  res.json({ ok: true, ai_enabled: ai.isEnabled() });
}));
app.post('/api/settings/test-ai', auth.requireAdmin, wrap(async (req, res) => {
  if (!ai.isEnabled()) return res.status(400).json({ ok: false, error: 'no provider/key configured' });
  try {
    const t = await ai.complete([{ role: 'user', content: 'Reply with exactly: OK' }]);
    res.json({ ok: true, provider: ai.providerName(), reply: String(t || '').slice(0, 80) });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
}));
// Load the model list from the provider (so users don't have to type model ids).
app.post('/api/settings/models', auth.requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const provider = b.ai_provider || db.getSetting('ai_provider') || 'openai';
  const baseUrl = (b.ai_base_url || db.getSetting('ai_base_url') || (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
  const key = (b.ai_api_key && b.ai_api_key.trim()) || db.getSetting('ai_api_key') || '';
  if (!key) return res.status(400).json({ error: 'enter an API key / token first' });
  try {
    const url = provider === 'anthropic' ? baseUrl + '/v1/models' : baseUrl + '/models';
    const headers = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { authorization: 'Bearer ' + key };
    const r = await fetch(url, { headers });
    if (!r.ok) return res.status(502).json({ error: `provider ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}` });
    const data = await r.json();
    const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
    res.json({ models });
  } catch (e) { res.status(502).json({ error: e.message }); }
}));

// ---- embedded OAuth (device-code) login — sign in with your subscription ----
const oauth = require('./oauth');
const oauthPending = new Map(); // userId -> { provider, device_code, expiresAt }
app.post('/api/settings/oauth/start', auth.requireAdmin, wrap(async (req, res) => {
  const provider = (req.body || {}).provider;
  try {
    const { display, ctx } = await oauth.startDevice(provider);
    oauthPending.set(req.user.id, ctx);
    res.json(display);
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/settings/oauth/manual', auth.requireAdmin, wrap(async (req, res) => {
  try {
    await oauth.completeLoopbackManual((req.body || {}).url);
    oauthPending.delete(req.user.id);
    res.json({ status: 'done' });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/settings/oauth/poll', auth.requireAdmin, wrap(async (req, res) => {
  const ctx = oauthPending.get(req.user.id);
  if (!ctx) return res.status(400).json({ error: 'no pending login — start again' });
  if (Date.now() > ctx.expiresAt) { oauthPending.delete(req.user.id); return res.status(400).json({ error: 'login expired — start again' }); }
  try {
    const r = await oauth.pollDevice(ctx);
    if (r.ok) { oauthPending.delete(req.user.id); return res.json({ status: 'done' }); }
    res.json({ status: 'pending' });
  } catch (e) { oauthPending.delete(req.user.id); res.status(400).json({ error: e.message }); }
}));

// ---- everything below requires authentication (session cookie or API token) ----
['/api/assessments', '/api/report', '/api/backup', '/api/restore', '/api/ai', '/mcp', '/acp'].forEach((p) => app.use(p, auth.requireAuth));

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

// ---- retention: purge assessments older than the configured window ----
function runRetention() {
  const days = Number(db.getSetting('retention_days') || 0);
  if (!days) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const r = db.db.prepare('DELETE FROM assessments WHERE updated_at < ?').run(cutoff);
  if (r.changes) console.log(`retention: removed ${r.changes} assessment(s) older than ${days}d`);
}
runRetention();
setInterval(runRetention, 24 * 60 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`Okami SAMM listening on http://localhost:${PORT}`));
