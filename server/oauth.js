'use strict';
// Embedded OAuth (device-code) so users can sign in with a provider subscription
// — no API key, no external gateway, nothing to install. The flows / client IDs
// mirror the providers' official CLIs (validated against the real endpoints).
//
// Anthropic is intentionally absent: their Terms forbid using Pro/Max OAuth tokens
// outside Claude Code / Claude.ai (account-ban risk) — use an API key for that.
const crypto = require('crypto');
const http = require('http');
const db = require('./db');

const PROVIDERS = {
  // xAI / Grok — standard OIDC device flow; token used at api.x.ai/v1 (OpenAI fmt)
  xai: {
    label: 'Grok', flavor: 'standard', preset: 'grok',
    deviceUrl: 'https://auth.x.ai/oauth2/device/code',
    tokenUrl: 'https://auth.x.ai/oauth2/token',
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    scope: 'openid profile email offline_access grok-cli:access api:access',
    apiProvider: 'openai', apiBaseUrl: 'https://api.x.ai/v1', authHeader: 'bearer',
  },
  // Minimax — PKCE + user_code flow; token used at api.minimax.io/anthropic (Bearer)
  minimax: {
    label: 'Minimax', flavor: 'minimax', preset: 'minimax',
    codeUrl: 'https://api.minimax.io/oauth/code',
    tokenUrl: 'https://api.minimax.io/oauth/token',
    clientId: '78257093-7e40-4613-99e0-527b14b39113',
    scope: 'group_id profile model.completion',
    grant: 'urn:ietf:params:oauth:grant-type:user_code',
    apiProvider: 'anthropic', apiBaseUrl: 'https://api.minimax.io/anthropic', authHeader: 'bearer',
  },
  // OpenAI / Codex — Auth0 device flow; token used against the ChatGPT backend
  // (chatgpt.com/backend-api/codex) via the Responses API.
  // OpenAI / Codex — the device-code grant is rejected (403); Codex uses a
  // localhost loopback (127.0.0.1:1455). Works ONLY when the app runs on the same
  // machine as your browser. Token targets the ChatGPT backend (Responses API).
  'openai-codex': {
    label: 'OpenAI (Codex)', flavor: 'loopback', preset: 'openai',
    authorizeUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    redirectUri: 'http://localhost:1455/auth/callback',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    scope: 'openid profile email offline_access',
    apiProvider: 'openai-responses', apiBaseUrl: 'https://chatgpt.com/backend-api/codex', authHeader: 'bearer',
  },
};

const formPost = async (url, body, extraHeaders) => {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, extraHeaders || {}), body: new URLSearchParams(body).toString() });
  let data = {}; try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
};
const pkce = () => {
  const verifier = crypto.randomBytes(64).toString('base64url').slice(0, 96);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, state: crypto.randomBytes(16).toString('base64url') };
};

// Returns { display:{user_code,verification_uri,verification_uri_complete,interval,expires_in}, ctx }
async function startDevice(providerKey) {
  const p = PROVIDERS[providerKey];
  if (!p) { const e = new Error('OAuth not available for ' + providerKey); e.code = 'NO_PROVIDER'; throw e; }

  if (p.flavor === 'loopback') return startLoopback(providerKey);

  if (p.flavor === 'minimax') {
    const k = pkce();
    const { status, data } = await formPost(p.codeUrl, { response_type: 'code', client_id: p.clientId, scope: p.scope, code_challenge: k.challenge, code_challenge_method: 'S256', state: k.state }, { 'x-request-id': crypto.randomUUID() });
    if (status !== 200 || !data.user_code) { const e = new Error('Minimax auth failed: ' + (data.base_resp && data.base_resp.status_msg || data.error || status)); e.code = 'DEVICE_FAILED'; throw e; }
    const now = Date.now(); const raw = Number(data.expired_in || 0);
    const deadline = raw > now / 2 ? raw : now + Math.max(60, raw || 600) * 1000;
    return {
      display: { user_code: data.user_code, verification_uri: data.verification_uri, verification_uri_complete: data.verification_uri_complete, interval: Math.max(2, Math.round((data.interval_ms || 3000) / 1000)), expires_in: Math.max(60, Math.round((deadline - now) / 1000)) },
      ctx: { provider: providerKey, user_code: data.user_code, code_verifier: k.verifier, expiresAt: deadline },
    };
  }

  // standard RFC 8628 device flow (xAI, OpenAI/Codex)
  const { status, data } = await formPost(p.deviceUrl, { client_id: p.clientId, scope: p.scope });
  if (status >= 400 || !data.device_code) { const e = new Error('device init failed: ' + (data.error_description || data.error || status)); e.code = 'DEVICE_FAILED'; throw e; }
  return {
    display: { user_code: data.user_code, verification_uri: data.verification_uri || data.verification_url, verification_uri_complete: data.verification_uri_complete, interval: data.interval || 5, expires_in: data.expires_in || 600 },
    ctx: { provider: providerKey, device_code: data.device_code, expiresAt: Date.now() + (data.expires_in || 600) * 1000 },
  };
}

// ---- loopback flow (OpenAI/Codex): localhost-only; binds 127.0.0.1:1455 ----
let loopback = null;
function closeLoopback() { if (loopback && loopback.server) { try { loopback.server.close(); } catch (_) {} } loopback = null; }
async function startLoopback(providerKey) {
  const p = PROVIDERS[providerKey];
  closeLoopback();
  const k = pkce();
  loopback = { provider: providerKey, state: k.state, verifier: k.verifier, status: 'waiting', error: null, server: null };
  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://localhost:1455');
        if (u.pathname.indexOf('/auth/callback') !== 0) { res.writeHead(404); res.end(); return; }
        const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
        if (!code || !loopback || state !== loopback.state) { if (loopback) { loopback.status = 'error'; loopback.error = 'state mismatch or no code'; } res.writeHead(400, { 'content-type': 'text/html' }); res.end('<h2>Login failed.</h2>'); return; }
        const { data } = await formPost(p.tokenUrl, { grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: loopback.verifier });
        if (data.access_token) { saveTokens(providerKey, p, data); loopback.status = 'done'; res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h2>Connected — you can close this tab and return to OKAMI.</h2>'); }
        else { loopback.status = 'error'; loopback.error = data.error_description || data.error || 'token exchange failed'; res.writeHead(400, { 'content-type': 'text/html' }); res.end('<h2>Login failed.</h2>'); }
      } catch (e) { if (loopback) { loopback.status = 'error'; loopback.error = e.message; } try { res.writeHead(500); res.end(); } catch (_) {} }
      finally { setTimeout(closeLoopback, 800); }
    });
    server.on('error', (e) => { reject(new Error('cannot bind 127.0.0.1:1455 (' + e.code + ') — loopback login needs that port free and the app on the same machine as your browser')); });
    server.listen(1455, '127.0.0.1', () => { if (loopback) loopback.server = server; resolve(); });
  });
  setTimeout(closeLoopback, 600000);
  const authorize = p.authorizeUrl + '?' + new URLSearchParams({ response_type: 'code', client_id: p.clientId, redirect_uri: p.redirectUri, scope: p.scope, code_challenge: k.challenge, code_challenge_method: 'S256', state: k.state, id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', prompt: 'login' }).toString();
  return { display: { authorize_url: authorize, expires_in: 600 }, ctx: { provider: providerKey, mode: 'loopback' } };
}
function pollLoopback() {
  if (!loopback) return { error: 'no pending login' };
  if (loopback.status === 'done') { closeLoopback(); return { ok: true }; }
  if (loopback.status === 'error') { const msg = loopback.error; closeLoopback(); const e = new Error(msg); e.code = 'POLL_FAILED'; throw e; }
  return { pending: true };
}

// Poll once → { ok:true } (persists tokens) | { pending:true } | throws.
async function pollDevice(ctx) {
  if (ctx.mode === 'loopback') return pollLoopback();
  const p = PROVIDERS[ctx.provider];
  if (p.flavor === 'minimax') {
    const { status, data } = await formPost(p.tokenUrl, { grant_type: p.grant, client_id: p.clientId, user_code: ctx.user_code, code_verifier: ctx.code_verifier });
    if (status === 200 && data.status === 'success' && data.access_token) { saveMinimax(ctx.provider, p, data); return { ok: true }; }
    if (status === 200 && (!data.status || data.status === 'pending')) return { pending: true };
    const e = new Error('Minimax: ' + ((data.base_resp && data.base_resp.status_msg) || data.status || 'failed')); e.code = 'POLL_FAILED'; throw e;
  }
  const { status, data } = await formPost(p.tokenUrl, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: ctx.device_code, client_id: p.clientId });
  if (data.access_token) { saveTokens(ctx.provider, p, data); return { ok: true }; }
  const err = data.error || (status >= 400 ? 'error' : '');
  if (err === 'authorization_pending' || err === 'slow_down') return { pending: true };
  const e = new Error(data.error_description || err || 'token poll failed'); e.code = 'POLL_FAILED'; throw e;
}

function persist(providerKey, p, accessToken, refreshToken, expirySec) {
  db.setSetting('ai_api_key', accessToken);
  db.setSetting('ai_oauth_provider', providerKey);
  db.setSetting('ai_oauth_refresh', refreshToken || '');
  db.setSetting('ai_oauth_expiry', new Date(Date.now() + Math.max(60, expirySec) * 1000).toISOString());
  db.setSetting('ai_provider', p.apiProvider);
  db.setSetting('ai_base_url', p.apiBaseUrl);
  db.setSetting('ai_auth_header', p.authHeader || 'bearer');
  db.setSetting('ai_preset', p.preset);
  db.setSetting('ai_auth_method', 'oauth');
}
function saveTokens(providerKey, p, tok) { persist(providerKey, p, tok.access_token, tok.refresh_token, Number(tok.expires_in || 3600)); }
function saveMinimax(providerKey, p, tok) {
  const raw = Number(tok.expired_in || 0); const now = Date.now();
  const sec = raw > now / 2 ? Math.round((raw - now) / 1000) : raw;
  persist(providerKey, p, tok.access_token, tok.refresh_token, Math.max(60, sec || 3600));
}

// Refresh the access token if near expiry (no-op for API keys / Minimax handled on use).
async function ensureFreshToken() {
  const providerKey = db.getSetting('ai_oauth_provider');
  const p = PROVIDERS[providerKey]; if (!p) return;
  const expiry = db.getSetting('ai_oauth_expiry');
  if (expiry && (new Date(expiry).getTime() - Date.now()) > 120000) return;
  const refresh = db.getSetting('ai_oauth_refresh'); if (!refresh) return;
  if (p.flavor === 'minimax') return; // Minimax refresh re-uses the token endpoint differently; skip auto for now
  const { data } = await formPost(p.tokenUrl, { grant_type: 'refresh_token', refresh_token: refresh, client_id: p.clientId });
  if (data.access_token) saveTokens(providerKey, p, { ...data, refresh_token: data.refresh_token || refresh });
}

const available = () => Object.keys(PROVIDERS).filter((k) => !PROVIDERS[k].disabled);
module.exports = { PROVIDERS, startDevice, pollDevice, ensureFreshToken, available };
