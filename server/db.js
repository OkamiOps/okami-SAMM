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
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  api_token     TEXT UNIQUE,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);
// Note: assessment "snapshots" live inside state_json (state.snapshots) — used by
// the app's History/Evolution. There is intentionally no separate snapshots table.

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

// ---- users ----
const userPublic = (u) => u && { id: u.id, username: u.username, role: u.role, created_at: u.created_at };
const countUsers = () => db.prepare('SELECT COUNT(*) n FROM users').get().n;
const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const getUserByUsername = (u) => db.prepare('SELECT * FROM users WHERE username=?').get(u);
const getUserByToken = (tok) => (tok ? db.prepare('SELECT * FROM users WHERE api_token=?').get(tok) : null);
const listUsers = () => db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
const createUser = ({ username, password_hash, role, api_token }) => {
  const id = uuid(); const ts = now();
  db.prepare(`INSERT INTO users (id, username, password_hash, role, api_token, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?)`).run(id, username, password_hash, role || 'user', api_token || null, ts, ts);
  return getUserById(id);
};
const updateUser = (id, fields) => {
  const u = getUserById(id); if (!u) return null;
  const next = { ...u, ...fields, updated_at: now() };
  db.prepare('UPDATE users SET username=@username, password_hash=@password_hash, role=@role, api_token=@api_token, updated_at=@updated_at WHERE id=@id')
    .run({ id, username: next.username, password_hash: next.password_hash, role: next.role, api_token: next.api_token, updated_at: next.updated_at });
  return getUserById(id);
};
const deleteUser = (id) => db.prepare('DELETE FROM users WHERE id=?').run(id).changes > 0;

// ---- settings (key/value) ----
const getSetting = (key) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : null; };
const setSetting = (key, value) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value == null ? null : String(value));
const getAllSettings = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));

module.exports = {
  db, uuid, createAssessment, updateAssessment, getAssessment, listAssessments,
  deleteAssessment, exportAll, importAll,
  userPublic, countUsers, getUserById, getUserByUsername, getUserByToken, listUsers, createUser, updateUser, deleteUser,
  getSetting, setSetting, getAllSettings,
};
