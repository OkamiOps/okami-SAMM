'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { summarize } = require('./score');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'okami-samm.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS assessments (
  id            TEXT PRIMARY KEY,
  org           TEXT,
  team          TEXT,
  assess_date   TEXT,
  lead          TEXT,
  contributors  TEXT,
  lang          TEXT DEFAULT 'pt',
  overall_score REAL,
  state_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  label         TEXT,
  overall_score REAL,
  state_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_assessment ON snapshots(assessment_id);
`);

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function metaFrom(state) {
  const m = (state && state.meta) || {};
  let overall = null;
  try { overall = summarize(state).overall; } catch (_) { overall = null; }
  return {
    org: m.org || null, team: m.team || null, assess_date: m.date || null,
    lead: m.lead || null, contributors: m.contrib || null,
    lang: state.lang || 'pt', overall_score: overall,
  };
}

const createAssessment = (state) => {
  const id = uuid(); const ts = now(); const meta = metaFrom(state);
  db.prepare(`INSERT INTO assessments
    (id, org, team, assess_date, lead, contributors, lang, overall_score, state_json, created_at, updated_at)
    VALUES (@id,@org,@team,@assess_date,@lead,@contributors,@lang,@overall_score,@state_json,@created_at,@updated_at)`)
    .run({ id, ...meta, state_json: JSON.stringify(state), created_at: ts, updated_at: ts });
  return getAssessment(id);
};

const updateAssessment = (id, state) => {
  const existing = db.prepare('SELECT id FROM assessments WHERE id=?').get(id);
  if (!existing) return null;
  const meta = metaFrom(state);
  db.prepare(`UPDATE assessments SET
      org=@org, team=@team, assess_date=@assess_date, lead=@lead, contributors=@contributors,
      lang=@lang, overall_score=@overall_score, state_json=@state_json, updated_at=@updated_at
    WHERE id=@id`)
    .run({ id, ...meta, state_json: JSON.stringify(state), updated_at: now() });
  return getAssessment(id);
};

const getAssessment = (id) => {
  const row = db.prepare('SELECT * FROM assessments WHERE id=?').get(id);
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state_json) };
};

const listAssessments = () =>
  db.prepare(`SELECT id, org, team, assess_date, lead, lang, overall_score, created_at, updated_at
              FROM assessments ORDER BY updated_at DESC`).all();

const deleteAssessment = (id) => db.prepare('DELETE FROM assessments WHERE id=?').run(id).changes > 0;

const addSnapshot = (assessmentId, state, label) => {
  const a = db.prepare('SELECT id FROM assessments WHERE id=?').get(assessmentId);
  if (!a) return null;
  const id = uuid(); const ts = now();
  let overall = null; try { overall = summarize(state).overall; } catch (_) {}
  db.prepare(`INSERT INTO snapshots (id, assessment_id, label, overall_score, state_json, created_at)
              VALUES (?,?,?,?,?,?)`)
    .run(id, assessmentId, label || null, overall, JSON.stringify(state), ts);
  return { id, assessment_id: assessmentId, label, overall_score: overall, created_at: ts };
};

const listSnapshots = (assessmentId) =>
  db.prepare(`SELECT id, assessment_id, label, overall_score, created_at
              FROM snapshots WHERE assessment_id=? ORDER BY created_at ASC`).all(assessmentId);

// ---- full backup / restore (single-file portable history) ----
const exportAll = () => {
  const rows = db.prepare('SELECT * FROM assessments ORDER BY created_at ASC').all();
  return {
    app: 'okami-samm',
    schema: 1,
    exportedAt: now(),
    count: rows.length,
    assessments: rows.map((r) => ({
      id: r.id, org: r.org, team: r.team, assess_date: r.assess_date, lead: r.lead,
      contributors: r.contributors, lang: r.lang, overall_score: r.overall_score,
      created_at: r.created_at, updated_at: r.updated_at, state: JSON.parse(r.state_json),
    })),
  };
};

// mode: 'merge' (upsert by id, default) | 'replace' (wipe then insert)
const importAll = (data, mode = 'merge') => {
  const list = (data && Array.isArray(data.assessments)) ? data.assessments : null;
  if (!list) throw new Error('invalid backup: missing assessments[]');
  const valid = list.filter((a) => a && a.id && a.state && typeof a.state === 'object');
  const upsert = db.prepare(`INSERT OR REPLACE INTO assessments
    (id, org, team, assess_date, lead, contributors, lang, overall_score, state_json, created_at, updated_at)
    VALUES (@id,@org,@team,@assess_date,@lead,@contributors,@lang,@overall_score,@state_json,@created_at,@updated_at)`);
  const tx = db.transaction((rows) => {
    if (mode === 'replace') db.prepare('DELETE FROM assessments').run();
    for (const a of rows) {
      const meta = metaFrom(a.state);
      upsert.run({
        id: a.id, ...meta,
        state_json: JSON.stringify(a.state),
        created_at: a.created_at || now(), updated_at: a.updated_at || now(),
      });
    }
  });
  tx(valid);
  return { imported: valid.length, skipped: list.length - valid.length, mode };
};

module.exports = {
  db, createAssessment, updateAssessment, getAssessment, listAssessments,
  deleteAssessment, addSnapshot, listSnapshots, exportAll, importAll,
};
