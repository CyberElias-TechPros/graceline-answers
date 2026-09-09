'use strict';

/**
 * SQLite driver adapter.
 *
 * The production host is cPanel/DirectAdmin shared hosting, where the recommended
 * driver is `better-sqlite3`. However, `better-sqlite3` is a native module that
 * requires a working compiler and Node headers; on some shared hosts (and in CI /
 * sandboxed environments) it cannot be built. To keep the app runnable and testable
 * everywhere we transparently fall back to Node's built-in `node:sqlite` (available in
 * Node 22.5+, stable in Node 23+). Both drivers expose a near-identical prepared
 * statement API, so the rest of the code never needs to know which backend is active.
 *
 * We only add the parts that differ:
 *   - `db.pragma(...)` exists on better-sqlite3 but not on node:sqlite; we shim it.
 *   - `node:sqlite` is experimental, so constructor/driver differences are isolated here.
 */
const path = require('path');
const fs = require('fs');

function isInMemory(dbPath) {
  return dbPath === ':memory:' || /^file::memory:/.test(dbPath);
}

function ensureDir(dbPath) {
  if (isInMemory(dbPath)) return;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

/**
 * Open (and if necessary create) the database at `dbPath`.
 * @param {string} dbPath Absolute path or ':memory:'.
 * @returns {import('better-sqlite3').Database & { _driver: string }}
 */
function openDb(dbPath) {
  let db;
  let driver = 'better-sqlite3';

  // better-sqlite3 is a native module: `require` can succeed while `new Database()`
  // still fails (missing compiled .node binding). So we try to construct it, and fall
  // back to node:sqlite if require OR construction throws.
  try {
    // eslint-disable-next-line global-require
    const Database = require('better-sqlite3');
    ensureDir(dbPath);
    db = new Database(dbPath);
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    driver = 'node:sqlite';
    ensureDir(dbPath);
    db = new DatabaseSync(dbPath);
    // node:sqlite has no `.pragma()` — shim it to exec (better-sqlite3 uses it for
    // `journal_mode = WAL` etc.). Setting `foreign_keys = ON` via exec works the same.
    db.pragma = (statement) => db.exec(`PRAGMA ${statement}`);
  }

  Object.defineProperty(db, '_driver', { value: driver, enumerable: false });
  return db;
}

module.exports = { openDb, isInMemory };
