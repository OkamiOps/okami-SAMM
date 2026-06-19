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

module.exports = { startServer, waitForServer, buildState };
