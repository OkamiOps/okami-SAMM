'use strict';
// Embedded OAuth so users sign in with a provider subscription — no API key, no
// external gateway, nothing to install. Each provider's flow / client ID mirrors
// its official CLI (validated against the real endpoints).
//
// Per-provider vault: every successful login is stored separately (xai, minimax,
// openai-codex) in the `oauth_vault` setting. Switching the active provider just
// re-activates a stored session — you never re-authenticate a provider you already
// signed into. The `ai_*` settings hold whichever session is currently active.
//
// Anthropic is intentionally absent: their Terms forbid using Pro/Max OAuth tokens
// outside Claude Code / Claude.ai (account-ban risk) — use an API key for that.
const crypto = require('crypto');
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
  // OpenAI / Codex — PKCE authorize flow (auth.openai.com). The device-code grant is
  // rejected, so we use the Codex redirect_uri and complete by pasting the returned
  // URL/code back (works locally and remotely — no localhost server needed). Token
  // targets the ChatGPT backend via the Responses API.
  'openai-codex': {
    label: 'OpenAI (Codex)', flavor: 'paste', preset: 'openai',
    authorizeUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    redirectUri: 'http://localhost:1455/auth/callback',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    scope: 'openid profile email offline_access',
    apiProvider: 'openai-responses', apiBaseUrl: 'https://chatgpt.com/backend-api/codex', authHeader: 'bearer',
  },
};

const PRESET_TO_PROVIDER = { grok: 'xai', minimax: 'minimax', openai: 'openai-codex' };
const providerForPreset = (preset) => PRESET_TO_PROVIDER[preset] || '';

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
function decodeJwt(token) { try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch (_) { return {}; } }
// ChatGPT/Codex backend needs a `chatgpt-account-id` header; it lives in the token's
// `https://api.openai.com/auth` claim (access_token, else id_token).
function codexAccountId(tok) {
  for (const t of [tok.access_token, tok.id_token]) {
    const auth = (decodeJwt(t)['https://api.openai.com/auth']) || {};
    if (auth.chatgpt_account_id) return auth.chatgpt_account_id;
  }
  return '';
}

// ---- per-provider vault ------------------------------------------------------
function loadVault() { try { return JSON.parse(db.getSetting('oauth_vault') || '{}') || {}; } catch (_) { return {}; } }
function saveVault(v) { db.setSetting('oauth_vault', JSON.stringify(v)); }
function vaultGet(k) { return loadVault()[k] || null; }
function vaultPut(k, s) { const v = loadVault(); v[k] = s; saveVault(v); }
function vaultProviders() { return Object.keys(loadVault()); }
function updateVaultModel(model) { const k = db.getSetting('ai_oauth_provider'); const v = loadVault(); if (k && v[k]) { v[k].model = model; saveVault(v); } }

// Make a stored session the active AI config (no re-auth). Returns false if absent.
function activate(providerKey) {
  const s = vaultGet(providerKey); if (!s) return false;
  db.setSetting('ai_api_key', s.token || '');
  db.setSetting('ai_account_id', s.account_id || '');
  db.setSetting('ai_oauth_provider', providerKey);
  db.setSetting('ai_oauth_refresh', s.refresh || '');
  db.setSetting('ai_oauth_expiry', s.expiry || '');
  db.setSetting('ai_provider', s.provider);
  db.setSetting('ai_base_url', s.base_url);
  db.setSetting('ai_auth_header', s.auth_header || 'bearer');
  db.setSetting('ai_preset', s.preset);
  db.setSetting('ai_model', s.model || '');
  db.setSetting('ai_auth_method', 'oauth');
  return true;
}
// Forget one provider; if it was active, clear the active config (other logins stay).
function disconnect(providerKey) {
  const v = loadVault(); delete v[providerKey]; saveVault(v);
  if (db.getSetting('ai_oauth_provider') === providerKey) {
    ['ai_api_key', 'ai_account_id', 'ai_oauth_provider', 'ai_oauth_refresh', 'ai_oauth_expiry', 'ai_auth_header', 'ai_model'].forEach((x) => db.setSetting(x, ''));
    db.setSetting('ai_auth_method', 'api_key');
  }
}
function persistSession(providerKey, p, tok, expirySec) {
  const existing = vaultGet(providerKey) || {};
  vaultPut(providerKey, {
    token: tok.access_token,
    refresh: tok.refresh_token || existing.refresh || '',
    expiry: new Date(Date.now() + Math.max(60, expirySec) * 1000).toISOString(),
    account_id: p.apiProvider === 'openai-responses' ? codexAccountId(tok) : '',
    provider: p.apiProvider, base_url: p.apiBaseUrl, auth_header: p.authHeader || 'bearer',
    preset: p.preset, model: existing.model || '',
  });
  activate(providerKey);
}
function saveTokens(providerKey, p, tok) { persistSession(providerKey, p, tok, Number(tok.expires_in || 3600)); }
function saveMinimax(providerKey, p, tok) {
  const raw = Number(tok.expired_in || 0); const now = Date.now();
  const sec = raw > now / 2 ? Math.round((raw - now) / 1000) : raw;
  persistSession(providerKey, p, tok, Math.max(60, sec || 3600));
}

// ---- start a login -----------------------------------------------------------
// Returns { display, ctx }. For 'paste' (Codex) the display has authorize_url and the
// flow completes via completeManual(); for device flows the UI polls pollDevice().
async function startDevice(providerKey) {
  const p = PROVIDERS[providerKey];
  if (!p) { const e = new Error('OAuth not available for ' + providerKey); e.code = 'NO_PROVIDER'; throw e; }

  if (p.flavor === 'paste') {
    const k = pkce();
    const authorize = p.authorizeUrl + '?' + new URLSearchParams({ response_type: 'code', client_id: p.clientId, redirect_uri: p.redirectUri, scope: p.scope, code_challenge: k.challenge, code_challenge_method: 'S256', state: k.state, id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', prompt: 'login' }).toString();
    return { display: { authorize_url: authorize, expires_in: 600 }, ctx: { provider: providerKey, mode: 'paste', state: k.state, verifier: k.verifier, expiresAt: Date.now() + 600000 } };
  }

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

  // standard RFC 8628 device flow (xAI)
  const { status, data } = await formPost(p.deviceUrl, { client_id: p.clientId, scope: p.scope });
  if (status >= 400 || !data.device_code) { const e = new Error('device init failed: ' + (data.error_description || data.error || status)); e.code = 'DEVICE_FAILED'; throw e; }
  return {
    display: { user_code: data.user_code, verification_uri: data.verification_uri || data.verification_url, verification_uri_complete: data.verification_uri_complete, interval: data.interval || 5, expires_in: data.expires_in || 600 },
    ctx: { provider: providerKey, device_code: data.device_code, expiresAt: Date.now() + (data.expires_in || 600) * 1000 },
  };
}

// Codex paste-back: the user pastes the URL OpenAI redirected them to (or just the
// code). Uses the per-user pending ctx (state + verifier).
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
async function completeManual(ctx, input) {
  if (!ctx || ctx.mode !== 'paste') throw new Error('no pending login — start the sign-in again');
  const { code, state } = parseCodeState(input);
  if (state && state !== ctx.state) throw new Error('state mismatch — start the sign-in again');
  const p = PROVIDERS[ctx.provider];
  const { data } = await formPost(p.tokenUrl, { grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: ctx.verifier });
  if (!data.access_token) {
    const detail = typeof data.error_description === 'string' ? data.error_description : (typeof data.error === 'string' ? data.error : JSON.stringify(data).slice(0, 200));
    throw new Error('token exchange failed: ' + detail);
  }
  saveTokens(ctx.provider, p, data);
  return { ok: true };
}

// Poll once (device flows) → { ok } (persists) | { pending } | throws.
async function pollDevice(ctx) {
  if (ctx.mode === 'paste') return { pending: true }; // completed via paste, not polling
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

// Refresh the active provider's token if near expiry; updates vault + active config.
async function ensureFreshToken() {
  const providerKey = db.getSetting('ai_oauth_provider');
  const p = PROVIDERS[providerKey]; if (!p) return;
  const expiry = db.getSetting('ai_oauth_expiry');
  if (expiry && (new Date(expiry).getTime() - Date.now()) > 120000) return;
  const refresh = db.getSetting('ai_oauth_refresh'); if (!refresh) return;
  if (p.flavor === 'minimax') return; // Minimax refresh differs; skip auto for now
  const { data } = await formPost(p.tokenUrl, { grant_type: 'refresh_token', refresh_token: refresh, client_id: p.clientId });
  if (data.access_token) persistSession(providerKey, p, { ...data, refresh_token: data.refresh_token || refresh }, Number(data.expires_in || 3600));
}

const available = () => Object.keys(PROVIDERS).filter((k) => !PROVIDERS[k].disabled);
module.exports = { PROVIDERS, startDevice, pollDevice, completeManual, ensureFreshToken, available, vaultProviders, activate, disconnect, providerForPreset, updateVaultModel };
