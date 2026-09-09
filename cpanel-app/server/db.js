'use strict';

const path = require('path');
const bcrypt = require('bcryptjs');
const { openDb } = require('./sqlite');

// Configurable so tests/CI can point at ':memory:' and operators can relocate the file.
const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'app.sqlite');
const DB_PATH = process.env.DB_PATH && process.env.DB_PATH.trim()
  ? process.env.DB_PATH.trim()
  : DEFAULT_DB_PATH;

const db = openDb(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// NOTE: raw seeker text lives only in `questions.raw_*` / `messages` and is never
// exposed through the public API. There is deliberately no IP/UA/fingerprint column.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'counselor',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_token TEXT UNIQUE NOT NULL,
  seeker_email TEXT,
  category TEXT,
  raw_title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  public_title TEXT,
  public_content TEXT,
  public_answer TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  is_urgent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_public ON questions(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_token ON questions(tracking_token);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL, -- 'seeker' | 'counselor'
  sender_user_id INTEGER,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_q ON messages(question_id, id);

CREATE TABLE IF NOT EXISTS internal_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS prayer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 1,
  prayed_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prayer_created ON prayer_requests(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts USING fts5(
  public_title, public_content, public_answer, category,
  content='', tokenize='porter'
);
`);

// Seed bootstrap counselor (only when there are zero users AND credential env is present).
function seedBootstrap() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (count && count.c > 0) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const pw = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !pw) {
    console.warn(
      '[graceline-answers] No users and no ADMIN_BOOTSTRAP_EMAIL/PASSWORD set. ' +
        'Skipping bootstrap seed.',
    );
    return;
  }
  const hash = bcrypt.hashSync(String(pw), 10);
  db.prepare(
    'INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(String(email).toLowerCase().trim(), hash, 'Lead Counselor', 'admin', Date.now());
  console.log(`[graceline-answers] Seeded bootstrap admin: ${email}`);
}

seedBootstrap();

module.exports = db;
