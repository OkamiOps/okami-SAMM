'use strict';
// Local authentication: user/password (scrypt), signed session cookie for the
// web app, and a per-user API token for agents (MCP/ACP). Roles: 'admin' | 'user'.
const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'okami_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---- password hashing (scrypt, no external deps) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf(':') === -1) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex'); const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newApiToken() { return 'okm_' + crypto.randomBytes(24).toString('hex'); }

// ---- session secret (env or persisted, generated once) ----
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  let s = db.getSetting('auth_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); db.setSetting('auth_secret', s); }
  return s;
}
function sign(data) { return crypto.createHmac('sha256', secret()).update(data).digest('hex'); }

// ---- signed session cookie: uid.exp.hmac ----
function makeSession(user) {
  const exp = Date.now() + SESSION_MS;
  const data = user.id + '.' + exp;
  return data + '.' + sign(data);
}
function readSession(value) {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i === -1) return null;
  const data = value.slice(0, i); const mac = value.slice(i + 1);
  const expect = sign(data);
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  const [uid, exp] = data.split('.');
  if (!uid || !exp || Number(exp) < Date.now()) return null;
  return db.getUserById(uid);
}

function parseCookies(req) {
  const out = {}; const h = req.headers.cookie;
  if (h) h.split(';').forEach((c) => { const idx = c.indexOf('='); if (idx > -1) out[c.slice(0, idx).trim()] = decodeURIComponent(c.slice(idx + 1).trim()); });
  return out;
}
function bearer(req) {
  const a = req.headers.authorization;
  if (a && a.startsWith('Bearer ')) return a.slice(7).trim();
  if (req.headers['x-api-key']) return String(req.headers['x-api-key']).trim();
  return null;
}

function setSessionCookie(res, user) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeSession(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// resolve the current user from API token (agents) or session cookie (web)
function currentUser(req) {
  const tok = bearer(req);
  if (tok) { const u = db.getUserByToken(tok); if (u) return u; }
  return readSession(parseCookies(req)[COOKIE]);
}

// ---- middleware ----
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'authentication required' });
  req.user = u; next();
}
function requireAdmin(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'authentication required' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  req.user = u; next();
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, newApiToken,
  makeSession, readSession, currentUser, setSessionCookie, clearSessionCookie,
  requireAuth, requireAdmin,
};
