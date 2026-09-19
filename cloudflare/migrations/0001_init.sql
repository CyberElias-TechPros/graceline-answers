-- GraceLine Answers — D1 schema (Cloudflare Workers)
-- Mirrors the cPanel/SQLite schema so both deployments share behaviour.

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
CREATE INDEX IF NOT EXISTS idx_questions_assigned ON questions(assigned_to);

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
CREATE INDEX IF NOT EXISTS idx_notes_q ON internal_notes(question_id, id);

CREATE TABLE IF NOT EXISTS prayer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 1,
  prayed_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prayer_created ON prayer_requests(created_at DESC);

-- Full-text search over published (sanitized) archive content.
CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts USING fts5(
  public_title, public_content, public_answer, category,
  content='', tokenize='porter'
);
