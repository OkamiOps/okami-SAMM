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
// The PKCE state/verifier live in the per-user pending ctx (returned to the caller
// and kept in oauthPending), NOT in this module — so the manual paste-back keeps
// working regardless of the loopback HTTP server's lifecycle. The server below is
// just a best-effort auto-capture; if it can't bind or never fires, paste-back wins.
let lbServer = null;       // current http server (to free the port)
let lbDone = false;        // auto-capture succeeded (token saved) → poll returns ok
function closeLbServer() { if (lbServer) { try { lbServer.close(); } catch (_) {} lbServer = null; } }
function parseCodeState(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('paste the redirect URL (or code)');
  let code = '', state = '';
  if (/^https?:\/\//i.test(raw) || raw.indexOf('?') !== -1) {
    let u; try { u = new URL(raw, 'http://localhost:1455'); } catch (_) { throw new Error('invalid URL'); }
    code = u.searchParams.get('code') || ''; state = u.searchParams.get('state') || '';
  } else { const parts = raw.split(/[#\s]+/); code = parts[0] || ''; state = parts[1] || ''; }
  if (!code) throw new Error('no authorization code found in what you pasted');
  return { code, state };
}
async function exchangeCode(p, code, verifier) {
  const { data } = await formPost(p.tokenUrl, { grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: verifier });
  if (!data.access_token) {
    const detail = typeof data.error_description === 'string' ? data.error_description : (typeof data.error === 'string' ? data.error : JSON.stringify(data).slice(0, 200));
    throw new Error('token exchange failed: ' + detail);
  }
  return data;
}
async function startLoopback(providerKey) {
  const p = PROVIDERS[providerKey];
  closeLbServer();
  lbDone = false;
  const k = pkce();
  // Best-effort auto-capture. Binding may fail (port busy) — that's fine, the user
  // can still paste the URL back. Never tear down the pending ctx from here.
  try {
    await new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const u = new URL(req.url, 'http://localhost:1455');
          if (u.pathname.indexOf('/auth/callback') !== 0) { res.writeHead(404); res.end(); return; }
          const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
          if (!code || state !== k.state) { res.writeHead(400, { 'content-type': 'text/html' }); res.end('<h2>Login failed — paste the URL back in OKAMI instead.</h2>'); return; }
          const data = await exchangeCode(p, code, k.verifier);
          saveTokens(providerKey, p, data); lbDone = true;
          res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h2>Connected — close this tab and return to OKAMI.</h2>');
          closeLbServer();
        } catch (e) { try { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<h2>' + e.message + ' — paste the URL back in OKAMI instead.</h2>'); } catch (_) {} }
      });
      server.on('error', reject);
      server.listen(1455, '127.0.0.1', () => { lbServer = server; resolve(); });
    });
    setTimeout(closeLbServer, 600000);
  } catch (_) { lbServer = null; } // port busy — paste-back path still works
  const authorize = p.authorizeUrl + '?' + new URLSearchParams({ response_type: 'code', client_id: p.clientId, redirect_uri: p.redirectUri, scope: p.scope, code_challenge: k.challenge, code_challenge_method: 'S256', state: k.state, id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', prompt: 'login' }).toString();
  return { display: { authorize_url: authorize, expires_in: 600 }, ctx: { provider: providerKey, mode: 'loopback', state: k.state, verifier: k.verifier, expiresAt: Date.now() + 600000 } };
}
// Manual completion: the user pastes the URL OpenAI gave them (the Codex
// "simplified" flow shows it instead of hitting the loopback). Uses the per-user
// pending ctx (state + verifier) — robust to the loopback server being gone.
async function completeLoopbackManual(ctx, input) {
  if (!ctx || ctx.mode !== 'loopback') throw new Error('no pending login — start the sign-in again');
  const { code, state } = parseCodeState(input);
  if (state && state !== ctx.state) throw new Error('state mismatch — start the sign-in again');
  const p = PROVIDERS[ctx.provider];
  const data = await exchangeCode(p, code, ctx.verifier);
  saveTokens(ctx.provider, p, data);
  closeLbServer(); lbDone = true;
  return { ok: true };
}

// Poll once → { ok:true } (persists tokens) | { pending:true } | throws.
async function pollDevice(ctx) {
  if (ctx.mode === 'loopback') return lbDone ? { ok: true } : { pending: true };
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

function decodeJwt(token) { try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch (_) { return {}; } }
// The ChatGPT/Codex backend requires a `chatgpt-account-id` header; it lives in the
// token's `https://api.openai.com/auth` claim (access_token, else id_token).
function codexAccountId(tok) {
  for (const t of [tok.access_token, tok.id_token]) {
    const claims = decodeJwt(t); const auth = claims['https://api.openai.com/auth'] || {};
    if (auth.chatgpt_account_id) return auth.chatgpt_account_id;
  }
  return '';
}

function persist(providerKey, p, accessToken, refreshToken, expirySec) {
  db.setSetting('ai_api_key', accessToken);
  db.setSetting('ai_model', ''); // drop any model from a previous provider (e.g. MiniMax)
  db.setSetting('ai_account_id', ''); // codex sets this below; clear for others
  db.setSetting('ai_oauth_provider', providerKey);
  db.setSetting('ai_oauth_refresh', refreshToken || '');
  db.setSetting('ai_oauth_expiry', new Date(Date.now() + Math.max(60, expirySec) * 1000).toISOString());
  db.setSetting('ai_provider', p.apiProvider);
  db.setSetting('ai_base_url', p.apiBaseUrl);
  db.setSetting('ai_auth_header', p.authHeader || 'bearer');
  db.setSetting('ai_preset', p.preset);
  db.setSetting('ai_auth_method', 'oauth');
}
function saveTokens(providerKey, p, tok) {
  persist(providerKey, p, tok.access_token, tok.refresh_token, Number(tok.expires_in || 3600));
  if (p.apiProvider === 'openai-responses') db.setSetting('ai_account_id', codexAccountId(tok));
}
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
module.exports = { PROVIDERS, startDevice, pollDevice, completeLoopbackManual, ensureFreshToken, available };
