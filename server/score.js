'use strict';
// Port of the frontend scoring (Okami Maturity.dc.html). Keep in sync.
const fs = require('fs');
const path = require('path');

const SAMM = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'samm.json'), 'utf8'));
const W = [0, 0.25, 0.5, 1]; // answer index -> weight

function allPractices() {
  const out = [];
  for (const f of SAMM.functions) for (const p of f.practices) out.push({ f, p });
  return out;
}

// practice score: average of the two streams (A,B), each summing its questions' weights
function ps(p, answers) {
  const streamSum = (st) => {
    let s = 0;
    for (const q of p.questions) {
      if (q.stream === st) {
        const a = answers[q.id];
        if (a != null) s += W[a];
      }
    }
    return s;
  };
  return (streamSum('A') + streamSum('B')) / 2;
}

function achievedLevel(p, answers) { return Math.floor(ps(p, answers) + 1e-9); }
function effTarget(p, answers, targets) {
  const t = targets && targets[p.code];
  if (t > 0) return t;
  return Math.min(3, achievedLevel(p, answers) + 1);
}

function evalStats(answers) {
  let total = 0, answered = 0;
  for (const f of SAMM.functions) for (const p of f.practices) for (const q of p.questions) {
    total++;
    if (answers[q.id] != null) answered++;
  }
  const atL3 = allPractices().filter((x) => ps(x.p, answers) >= 3 - 1e-9).length;
  return { total, answered, atL3 };
}

// Aggregate everything the report needs from a saved app state.
function summarize(state) {
  const answers = state.answers || {};
  const targets = state.targets || {};
  const lang = state.lang || 'pt';
  const prs = allPractices();

  const overall = prs.reduce((a, x) => a + ps(x.p, answers), 0) / prs.length;
  const stt = evalStats(answers);
  const onTarget = prs.filter((x) => achievedLevel(x.p, answers) >= effTarget(x.p, answers, targets)).length;
  const avgGap = prs.reduce((a, x) => a + Math.max(0, effTarget(x.p, answers, targets) - ps(x.p, answers)), 0) / prs.length;

  const functions = SAMM.functions.map((f) => {
    const arr = f.practices.map((p) => ps(p, answers));
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      code: f.code,
      name: lang === 'pt' ? f.pt : f.name,
      avg,
      practices: f.practices.map((p) => {
        const score = ps(p, answers);
        const ach = achievedLevel(p, answers);
        const tg = effTarget(p, answers, targets);
        return {
          code: p.code,
          name: lang === 'pt' ? p.pt : p.name,
          score, achieved: ach, target: tg,
          gap: Math.max(0, tg - score),
          focus: Math.min(3, ach + 1),
          streamA: streamScore(p, answers, 'A'),
          streamB: streamScore(p, answers, 'B'),
        };
      }),
    };
  });

  const flat = functions.flatMap((f) => f.practices.map((p) => ({ ...p, fnCode: f.code, fnName: f.name })));
  const priority = flat.filter((p) => p.gap > 0.001).sort((a, b) => b.gap - a.gap || a.score - b.score).slice(0, 5);

  return {
    overall,
    band: Math.max(0, Math.min(3, Math.floor(overall + 1e-9))),
    bandPct: Math.round((overall / 3) * 100),
    coverage: stt.total ? Math.round((stt.answered / stt.total) * 100) : 0,
    answered: stt.answered, totalQuestions: stt.total,
    onTarget, atL3: stt.atL3, avgGap,
    functions, priority,
  };
}

function streamScore(p, answers, st) {
  let s = 0;
  for (const q of p.questions) if (q.stream === st) { const a = answers[q.id]; if (a != null) s += W[a]; }
  return s;
}

module.exports = { SAMM, W, allPractices, ps, achievedLevel, effTarget, evalStats, summarize };
