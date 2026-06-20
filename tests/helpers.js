'use strict';
const { spawn } = require('child_process');

function startServer(port, extraEnv = {}) {
  const proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), ...extraEnv }, stdio: 'ignore',
  });
  return proc;
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start: ' + url);
}

// Build a deterministic assessment state covering a fraction of the questions.
function buildState(lang, everyNthAnswered, valueFn) {
  const { SAMM } = require('../server/score');
  const answers = {}, targets = {};
  let i = 0;
  for (const f of SAMM.functions) for (const p of f.practices) {
    targets[p.code] = 2;
    for (const q of p.questions) {
      i++;
      if (everyNthAnswered <= 1 || i % everyNthAnswered !== 0) answers[q.id] = valueFn(i);
    }
  }
  return { lang, screen: 'scorecard', started: true, meta: { org: 'Test Org', team: 'Test Team', date: '2026-06-20' }, answers, notes: {}, targets, snapshots: [] };
}

// Create the first admin (or log in if already set up) and return its session
// cookie + API token, for authenticating test requests.
async function createAdminSession(base, username = 'admin', password = 'admin123') {
  const readCookie = (res) => {
    const list = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const c of list) { const m = /okami_session=([^;]+)/.exec(c); if (m) return m[1]; }
    return '';
  };
  let res = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  let value = readCookie(res);
  if (!value) {
    res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    value = readCookie(res);
  }
  const cookie = 'okami_session=' + value;
  let token = null;
  const me = await fetch(base + '/api/auth/me', { headers: { cookie } });
  if (me.ok) token = (await me.json()).apiToken;
  return { cookie, value, token };
}

module.exports = { startServer, waitForServer, buildState, createAdminSession };
