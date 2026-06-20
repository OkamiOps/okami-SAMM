'use strict';
// Embedded OAuth (device-code / RFC 8628) so users can sign in with their
// provider subscription — no API key, no external gateway. The device flow needs
// no redirect/callback: the server shows a code + link, the user authorizes, the
// server polls for tokens. Tokens (access + refresh) are stored in settings and
// auto-refreshed by ai.js.
//
// Client IDs / endpoints are the providers' public CLI clients (same ones the
// official CLIs use). Anthropic is intentionally absent — their Terms forbid
// using Pro/Max OAuth tokens outside Claude Code/Claude.ai (account-ban risk).
const db = require('./db');

const PROVIDERS = {
  xai: {
    label: 'Grok (xAI)',
    deviceUrl: 'https://auth.x.ai/oauth2/device/code',
    tokenUrl: 'https://auth.x.ai/oauth2/token',
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    scope: 'openid profile email offline_access grok-cli:access api:access',
    apiProvider: 'openai',
    apiBaseUrl: 'https://api.x.ai/v1',
    preset: 'grok',
  },
  // minimax / openai-codex to be added after xAI is validated.
};

const form = (obj) => new URLSearchParams(obj).toString();
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form(body) });
  let data = {}; try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
};

// Start the device flow → returns the user-facing code + verification URL.
async function startDevice(providerKey) {
  const p = PROVIDERS[providerKey];
  if (!p) { const e = new Error('OAuth not available for ' + providerKey); e.code = 'NO_PROVIDER'; throw e; }
  const { status, data } = await post(p.deviceUrl, { client_id: p.clientId, scope: p.scope });
  if (status >= 400 || !data.device_code) { const e = new Error('device init failed: ' + (data.error_description || data.error || status)); e.code = 'DEVICE_FAILED'; throw e; }
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || data.verification_url,
    verification_uri_complete: data.verification_uri_complete,
    interval: data.interval || 5,
    expires_in: data.expires_in || 600,
  };
}

// Poll once. Returns { pending:true } | { ok:true } (and persists tokens) | throws.
async function pollDevice(providerKey, deviceCode) {
  const p = PROVIDERS[providerKey];
  const { status, data } = await post(p.tokenUrl, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: p.clientId });
  if (data.access_token) { saveTokens(providerKey, p, data); return { ok: true }; }
  const err = data.error || (status >= 400 ? 'error' : '');
  if (err === 'authorization_pending' || err === 'slow_down') return { pending: true, slowDown: err === 'slow_down' };
  const e = new Error(data.error_description || err || 'token poll failed'); e.code = 'POLL_FAILED'; throw e;
}

function saveTokens(providerKey, p, tok) {
  const expiry = new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString();
  db.setSetting('ai_api_key', tok.access_token);
  db.setSetting('ai_oauth_provider', providerKey);
  db.setSetting('ai_oauth_refresh', tok.refresh_token || '');
  db.setSetting('ai_oauth_expiry', expiry);
  db.setSetting('ai_provider', p.apiProvider);
  db.setSetting('ai_base_url', p.apiBaseUrl);
  db.setSetting('ai_preset', p.preset);
  db.setSetting('ai_auth_method', 'oauth');
}

// Refresh the access token if it's an OAuth token near expiry. Called by ai.js.
async function ensureFreshToken() {
  const providerKey = db.getSetting('ai_oauth_provider');
  if (!providerKey || !PROVIDERS[providerKey]) return;
  const expiry = db.getSetting('ai_oauth_expiry');
  if (expiry && (new Date(expiry).getTime() - Date.now()) > 120000) return; // >2min left
  const refresh = db.getSetting('ai_oauth_refresh');
  if (!refresh) return;
  const p = PROVIDERS[providerKey];
  const { data } = await post(p.tokenUrl, { grant_type: 'refresh_token', refresh_token: refresh, client_id: p.clientId });
  if (data.access_token) saveTokens(providerKey, p, { ...data, refresh_token: data.refresh_token || refresh });
}

const available = () => Object.keys(PROVIDERS);

module.exports = { PROVIDERS, startDevice, pollDevice, ensureFreshToken, available };
