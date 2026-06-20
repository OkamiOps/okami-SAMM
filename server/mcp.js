'use strict';
// MCP server exposing the Okami SAMM system to AI clients — read + operate.
// Tools call db/score/report directly (no HTTP hop). Used by both the stdio
// entry (server/mcp-stdio.js) and the HTTP transport mounted in server/index.js.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const db = require('./db');
const { SAMM, summarize, roadmap } = require('./score');
const { generatePDF } = require('./report/pdf');

const VALID_Q = new Set();
const VALID_P = new Set();
for (const f of SAMM.functions) for (const p of f.practices) { VALID_P.add(p.code); for (const q of p.questions) VALID_Q.add(q.id); }

const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const err = (msg) => ({ content: [{ type: 'text', text: 'Error: ' + msg }], isError: true });

function load(id) { const a = db.getAssessment(id); return a ? a : null; }
function compactSummary(a) {
  const S = summarize(a.state);
  return {
    id: a.id, org: a.org, team: a.team, lang: a.state.lang || 'pt',
    overall: Number(S.overall.toFixed(2)), band: S.band, bandLabel: ['Initial', 'Developing', 'Mature', 'Optimized'][S.band],
    coverage: S.coverage, answered: S.answered, total: S.totalQuestions,
    practicesOnTarget: S.onTarget, avgGap: Number(S.avgGap.toFixed(2)),
  };
}

function createMcpServer() {
  const server = new McpServer({ name: 'okami-samm', version: require('../package.json').version });

  server.registerTool('get_samm_model', {
    description: 'Return the OWASP SAMM v2 model: 5 business functions, 15 practices, 90 questions (ids, stream A/B, level 1-3, text). Use the question ids with set_answers.',
    inputSchema: { lang: z.enum(['pt', 'en']).optional() },
  }, async ({ lang }) => {
    const isPT = lang === 'pt';
    const model = SAMM.functions.map((f) => ({
      code: f.code, name: isPT ? f.pt : f.name,
      practices: f.practices.map((p) => ({
        code: p.code, name: isPT ? p.pt : p.name,
        questions: p.questions.map((q) => ({ id: q.id, stream: q.stream, level: q.level, text: isPT ? q.pt : q.en })),
      })),
    }));
    return ok({ answerScale: '0=No, 1=Yes for some, 2=Yes at least half, 3=Yes most/all', functions: model });
  });

  server.registerTool('list_assessments', {
    description: 'List all saved assessments (id, org, team, overall score, dates).',
    inputSchema: {},
  }, async () => ok(db.listAssessments()));

  server.registerTool('get_assessment', {
    description: 'Get one assessment: metadata + computed scorecard summary. Pass includeState=true to also get raw answers/notes/targets.',
    inputSchema: { id: z.string(), includeState: z.boolean().optional() },
  }, async ({ id, includeState }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const out = compactSummary(a);
    if (includeState) out.state = a.state;
    return ok(out);
  });

  server.registerTool('create_assessment', {
    description: 'Create a new assessment with empty answers. Returns its id.',
    inputSchema: { org: z.string().optional(), team: z.string().optional(), date: z.string().optional(), lead: z.string().optional(), contrib: z.string().optional(), lang: z.enum(['pt', 'en']).optional() },
  }, async ({ org, team, date, lead, contrib, lang }) => {
    const state = { lang: lang || 'en', screen: 'setup', started: false, meta: { org: org || '', team: team || '', date: date || '', lead: lead || '', contrib: contrib || '' }, answers: {}, notes: {}, targets: {}, snapshots: [] };
    const a = db.createAssessment(state);
    return ok({ id: a.id, ...compactSummary(a) });
  });

  server.registerTool('set_answers', {
    description: 'Answer questions on an assessment. answers maps question id → value (0=No,1=some,2=half,3=most/all), or null to clear. Returns updated scorecard summary.',
    inputSchema: { id: z.string(), answers: z.record(z.string(), z.number().int().min(0).max(3).nullable()) },
  }, async ({ id, answers }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const bad = Object.keys(answers).filter((k) => !VALID_Q.has(k));
    const next = { ...a.state, answers: { ...a.state.answers } };
    for (const [k, v] of Object.entries(answers)) { if (!VALID_Q.has(k)) continue; if (v == null) delete next.answers[k]; else next.answers[k] = v; }
    const upd = db.updateAssessment(id, next);
    return ok({ ...compactSummary(upd), ignoredInvalidIds: bad });
  });

  server.registerTool('set_targets', {
    description: 'Set target maturity levels (0-3) per practice code. targets maps practice code → level.',
    inputSchema: { id: z.string(), targets: z.record(z.string(), z.number().int().min(0).max(3)) },
  }, async ({ id, targets }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const bad = Object.keys(targets).filter((k) => !VALID_P.has(k));
    const next = { ...a.state, targets: { ...a.state.targets } };
    for (const [k, v] of Object.entries(targets)) if (VALID_P.has(k)) next.targets[k] = v;
    db.updateAssessment(id, next);
    return ok({ ...compactSummary(load(id)), ignoredInvalidCodes: bad });
  });

  server.registerTool('set_notes', {
    description: 'Attach interview notes to questions. notes maps question id → note text (these appear in the report appendix).',
    inputSchema: { id: z.string(), notes: z.record(z.string(), z.string()) },
  }, async ({ id, notes }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const next = { ...a.state, notes: { ...a.state.notes } };
    for (const [k, v] of Object.entries(notes)) if (VALID_Q.has(k)) next.notes[k] = v;
    db.updateAssessment(id, next);
    return ok({ saved: true, ...compactSummary(load(id)) });
  });

  server.registerTool('get_scorecard', {
    description: 'Full computed scorecard: overall, band, coverage, KPIs and per-function/per-practice scores with targets and gaps.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const a = load(id); if (!a) return err('assessment not found');
    return ok(summarize(a.state));
  });

  server.registerTool('get_roadmap', {
    description: 'Prioritized roadmap: practices with the largest gap to target, each with recommended actions (the SAMM criteria for the next level).',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const a = load(id); if (!a) return err('assessment not found');
    return ok(roadmap(a.state));
  });

  server.registerTool('add_snapshot', {
    description: 'Record a snapshot of the current state into the assessment history (used by the maturity-evolution chart).',
    inputSchema: { id: z.string(), label: z.string().optional() },
  }, async ({ id, label }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const S = summarize(a.state);
    const snap = { id: 's' + Date.now(), name: label || a.state.meta.team || a.state.meta.org || ('Snapshot ' + ((a.state.snapshots || []).length + 1)), date: (a.state.meta.date || new Date().toISOString().slice(0, 10)), answers: { ...a.state.answers }, score: S.overall.toFixed(2) };
    const next = { ...a.state, snapshots: [...(a.state.snapshots || []), snap] };
    db.updateAssessment(id, next);
    return ok({ saved: true, snapshot: { name: snap.name, date: snap.date, score: snap.score }, totalSnapshots: next.snapshots.length });
  });

  server.registerTool('generate_report', {
    description: 'Generate the Okami-branded PDF maturity report. Writes the file to outputPath (or a temp file) and returns the path plus key results.',
    inputSchema: { id: z.string(), outputPath: z.string().optional() },
  }, async ({ id, outputPath }) => {
    const a = load(id); if (!a) return err('assessment not found');
    const pdf = await generatePDF(a);
    const out = outputPath || path.join(os.tmpdir(), `okami-samm-${id}.pdf`);
    fs.writeFileSync(out, pdf);
    const S = summarize(a.state);
    return ok({ path: out, bytes: pdf.length, overall: Number(S.overall.toFixed(2)), coverage: S.coverage, topPriorities: S.priority.slice(0, 3).map((p) => p.name) });
  });

  server.registerTool('delete_assessment', {
    description: 'Permanently delete an assessment and its snapshots.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => ok({ deleted: db.deleteAssessment(id) }));

  server.registerTool('export_backup', {
    description: 'Export every assessment as a portable JSON backup.',
    inputSchema: {},
  }, async () => ok(db.exportAll()));

  server.registerTool('import_backup', {
    description: 'Restore a JSON backup. mode "merge" upserts by id (default); "replace" wipes first.',
    inputSchema: { assessments: z.array(z.any()), mode: z.enum(['merge', 'replace']).optional() },
  }, async ({ assessments, mode }) => {
    try { return ok(db.importAll({ assessments }, mode || 'merge')); } catch (e) { return err(e.message); }
  });

  // ---- resources ----
  server.registerResource('samm-model', 'samm://model', { description: 'The OWASP SAMM v2 model (functions, practices, questions).', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(SAMM) }] }));

  return server;
}

module.exports = { createMcpServer };
