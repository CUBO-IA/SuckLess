// Historial local en SQLite: guardar, buscar, abrir y borrar (con sus datos asociados).
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, ensureDir, nowIso } from './util.js';
import { redact, redactDeep } from './redact.js';

const cache = new Map();
const defaultFile = () => process.env.SUCKLESS_DB || path.join(DATA_DIR, 'suckless.db');

export function openDb(file = defaultFile()) {
  if (cache.has(file)) return cache.get(file);
  ensureDir(path.dirname(file));
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '', report_md TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_artifacts_analysis ON artifacts(analysis_id);`);
  cache.set(file, db);
  return db;
}

export function saveAnalysis({ type, title, status, summary = '', report = '', data = {} }, artifacts = []) {
  const db = openDb();
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO analyses (type,title,status,summary,report_md,data_json,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(type, redact(title), status, redact(summary), redact(report), JSON.stringify(redactDeep(data)), nowIso());
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO artifacts (analysis_id,kind,name,content) VALUES (?,?,?,?)');
    for (const a of artifacts) ins.run(id, a.kind, a.name, redact(a.content));
    db.exec('COMMIT');
    return id;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function listAnalyses({ q = null, type = null, limit = 100 } = {}) {
  const like = q ? `%${String(q).replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  return openDb().prepare(`
    SELECT id,type,title,status,summary,created_at FROM analyses
    WHERE (? IS NULL OR type = ?)
      AND (? IS NULL OR title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR report_md LIKE ? ESCAPE '\\')
    ORDER BY id DESC LIMIT ?`).all(type, type, like, like, like, like, limit);
}

export function getAnalysis(id) {
  const db = openDb();
  const row = db.prepare('SELECT * FROM analyses WHERE id = ?').get(Number(id));
  if (!row) return null;
  const artifacts = db.prepare('SELECT id,kind,name,content FROM artifacts WHERE analysis_id = ?').all(row.id);
  return { id: row.id, type: row.type, title: row.title, status: row.status, summary: row.summary, createdAt: row.created_at, report: row.report_md, data: JSON.parse(row.data_json), artifacts };
}

export function deleteAnalysis(id) {
  return openDb().prepare('DELETE FROM analyses WHERE id = ?').run(Number(id)).changes > 0;
}

export function countArtifacts(analysisId) {
  return openDb().prepare('SELECT COUNT(*) AS n FROM artifacts WHERE analysis_id = ?').get(Number(analysisId)).n;
}
