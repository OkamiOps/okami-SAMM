'use strict';
// Single source of truth for every operation on the SAMM system.
// Consumed by: MCP (server/mcp.js), Agent Communication Protocol (acp-comm.js)
// and Agent Client Protocol (acp-client.js). One definition → all protocols.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const db = require('./db');
const { SAMM, summarize, roadmap } = require('./score');
const { generatePDF } = require('./report/pdf');

const VALID_Q = new Set();
const VALID_P = new Set();
for (const f of SAMM.functions) for (const p of f.practices) { VALID_P.add(p.code); for (const q of p.questions) VALID_Q.add(q.id); }

function load(id) { const a = db.getAssessment(id); if (!a) { const e = new Error('assessment not found: ' + id); e.code = 'NOT_FOUND'; throw e; } return a; }
function summary(a) {
  const S = summarize(a.state);
  return {
    id: a.id, org: a.org, team: a.team, lang: a.state.lang || 'pt',
    overall: Number(S.overall.toFixed(2)), band: S.band, bandLabel: ['Initial', 'Developing', 'Mature', 'Optimized'][S.band],
    coverage: S.coverage, answered: S.answered, total: S.totalQuestions,
    practicesOnTarget: S.onTarget, avgGap: Number(S.avgGap.toFixed(2)),
  };
}

const TOOLS = [
  {
    name: 'get_samm_model',
    description: 'Return the OWASP SAMM v2 model: 5 functions, 15 practices, 90 questions (ids, stream A/B, level 1-3, text). Use the question ids with set_answers.',
    input: { lang: z.enum(['pt', 'en']).optional() },
    run: async ({ lang }) => {
      const isPT = lang === 'pt';
      return {
        answerScale: '0=No, 1=Yes for some, 2=Yes at least half, 3=Yes most/all',
        functions: SAMM.functions.map((f) => ({
          code: f.code, name: isPT ? f.pt : f.name,
          practices: f.practices.map((p) => ({
            code: p.code, name: isPT ? p.pt : p.name,
            questions: p.questions.map((q) => ({ id: q.id, stream: q.stream, level: q.level, text: isPT ? q.pt : q.en })),
          })),
        })),
      };
    },
  },
  { name: 'list_assessments', description: 'List all saved assessments (id, org, team, overall score, dates).', input: {}, run: async () => db.listAssessments() },
  {
    name: 'get_assessment', description: 'Get one assessment: metadata + computed scorecard summary. includeState=true also returns raw answers/notes/targets.',
    input: { id: z.string(), includeState: z.boolean().optional() },
    run: async ({ id, includeState }) => { const a = load(id); const out = summary(a); if (includeState) out.state = a.state; return out; },
  },
  {
    name: 'create_assessment', description: 'Create a new assessment with empty answers. Returns its id.',
    input: { org: z.string().optional(), team: z.string().optional(), date: z.string().optional(), lead: z.string().optional(), contrib: z.string().optional(), lang: z.enum(['pt', 'en']).optional() },
    run: async ({ org, team, date, lead, contrib, lang }) => {
      const state = { lang: lang || 'en', screen: 'setup', started: false, meta: { org: org || '', team: team || '', date: date || '', lead: lead || '', contrib: contrib || '' }, answers: {}, notes: {}, targets: {}, snapshots: [] };
      return summary(db.createAssessment(state));
    },
  },
  {
    name: 'set_answers', description: 'Answer questions. answers maps question id → value (0=No,1=some,2=half,3=most/all) or null to clear. Returns updated scorecard summary.',
    input: { id: z.string(), answers: z.record(z.string(), z.number().int().min(0).max(3).nullable()) },
    run: async ({ id, answers }) => {
      const a = load(id); const bad = Object.keys(answers).filter((k) => !VALID_Q.has(k));
      const next = { ...a.state, answers: { ...a.state.answers } };
      for (const [k, v] of Object.entries(answers)) { if (!VALID_Q.has(k)) continue; if (v == null) delete next.answers[k]; else next.answers[k] = v; }
      return { ...summary(db.updateAssessment(id, next)), ignoredInvalidIds: bad };
    },
  },
  {
    name: 'set_targets', description: 'Set target maturity levels (0-3) per practice code. targets maps practice code → level.',
    input: { id: z.string(), targets: z.record(z.string(), z.number().int().min(0).max(3)) },
    run: async ({ id, targets }) => {
      const a = load(id); const bad = Object.keys(targets).filter((k) => !VALID_P.has(k));
      const next = { ...a.state, targets: { ...a.state.targets } };
      for (const [k, v] of Object.entries(targets)) if (VALID_P.has(k)) next.targets[k] = v;
      return { ...summary(db.updateAssessment(id, next)), ignoredInvalidCodes: bad };
    },
  },
  {
    name: 'set_notes', description: 'Attach interview notes to questions. notes maps question id → note text (shown in the report appendix).',
    input: { id: z.string(), notes: z.record(z.string(), z.string()) },
    run: async ({ id, notes }) => {
      const a = load(id); const next = { ...a.state, notes: { ...a.state.notes } };
      for (const [k, v] of Object.entries(notes)) if (VALID_Q.has(k)) next.notes[k] = v;
      db.updateAssessment(id, next); return { saved: true, ...summary(load(id)) };
    },
  },
  { name: 'get_scorecard', description: 'Full computed scorecard: overall, band, coverage, KPIs and per-function/per-practice scores with targets and gaps.', input: { id: z.string() }, run: async ({ id }) => summarize(load(id).state) },
  { name: 'get_roadmap', description: 'Prioritized roadmap: practices with the largest gap to target, each with recommended actions (SAMM criteria for the next level).', input: { id: z.string() }, run: async ({ id }) => roadmap(load(id).state) },
  {
    name: 'add_snapshot', description: 'Record a snapshot of the current state into the assessment history (used by the maturity-evolution chart).',
    input: { id: z.string(), label: z.string().optional() },
    run: async ({ id, label }) => {
      const a = load(id); const S = summarize(a.state);
      const snap = { id: 's' + Date.now(), name: label || a.state.meta.team || a.state.meta.org || ('Snapshot ' + ((a.state.snapshots || []).length + 1)), date: (a.state.meta.date || new Date().toISOString().slice(0, 10)), answers: { ...a.state.answers }, score: S.overall.toFixed(2) };
      const next = { ...a.state, snapshots: [...(a.state.snapshots || []), snap] };
      db.updateAssessment(id, next);
      return { saved: true, snapshot: { name: snap.name, date: snap.date, score: snap.score }, totalSnapshots: next.snapshots.length };
    },
  },
  {
    name: 'generate_report', description: 'Generate the Okami-branded PDF maturity report. Writes to outputPath (or a temp file) and returns the path plus key results.',
    input: { id: z.string(), outputPath: z.string().optional() },
    run: async ({ id, outputPath }) => {
      const a = load(id); const pdf = await generatePDF(a);
      const out = outputPath || path.join(os.tmpdir(), `okami-samm-${id}.pdf`);
      fs.writeFileSync(out, pdf); const S = summarize(a.state);
      return { path: out, bytes: pdf.length, overall: Number(S.overall.toFixed(2)), coverage: S.coverage, topPriorities: S.priority.slice(0, 3).map((p) => p.name) };
    },
  },
  { name: 'delete_assessment', description: 'Permanently delete an assessment and its snapshots.', input: { id: z.string() }, run: async ({ id }) => ({ deleted: db.deleteAssessment(id) }) },
  { name: 'export_backup', description: 'Export every assessment as a portable JSON backup.', input: {}, run: async () => db.exportAll() },
  { name: 'import_backup', description: 'Restore a JSON backup. mode "merge" upserts by id (default); "replace" wipes first.', input: { assessments: z.array(z.any()), mode: z.enum(['merge', 'replace']).optional() }, run: async ({ assessments, mode }) => db.importAll({ assessments }, mode || 'merge') },
];

const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// JSON Schema for a tool's input (for LLM tool-calling / ACP manifests).
function jsonSchema(t) {
  return zodToJsonSchema(z.object(t.input || {}), { target: 'openApi3' });
}

// Validate + run a tool by name. Throws on unknown tool / invalid args.
async function execute(name, args) {
  const t = byName[name];
  if (!t) { const e = new Error('unknown tool: ' + name); e.code = 'UNKNOWN_TOOL'; throw e; }
  const parsed = z.object(t.input || {}).parse(args || {});
  return t.run(parsed);
}

module.exports = { TOOLS, byName, execute, jsonSchema, summary, load };
