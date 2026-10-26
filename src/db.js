import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Opens a persistent database and applies versioned schema migrations. */
export function openDatabase(path = process.env.DB_PATH || './data/fitness.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('../migrations/001-initial.sql', import.meta.url), 'utf8'));
      db.exec('PRAGMA user_version=1; COMMIT');
    } catch (e) { db.exec('ROLLBACK'); db.close(); throw e; }
  }
  return db;
}

/** All integrity-sensitive operations are synchronous inside one write transaction. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
