-- GraceLine Answers — initial D1 schema
--
-- Ported from the legacy single-process SQLite schema (cpanel-app/server/db.js) and
-- hardened for D1:
--   * TEXT/uuid primary key for `users` (D1 has no AUTOINCREMENT-friendly identity
--     across edge replicas, and a non-enumerable id avoids leaking team size).
--   * CHECK constraints replace application-side-only enum validation.
--   * FTS5 is an *external content* table kept in sync by triggers, so the public
--     search index can never drift from the published rows (the legacy app synced
--     it manually in the publish handler only).
--   * Timestamps are INTEGER unix milliseconds, matching the legacy format so data
--     can be imported unchanged.
--
-- PRIVACY INVARIANT: there is deliberately no column anywhere in this schema for a
-- seeker IP address, user-agent, or device fingerprint. See docs/adr/0002.

-- ---------------------------------------------------------------------------
-- Counselors / administrators. Seekers are never users; they are anonymous and
-- hold only an unguessable tracking token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash      TEXT NOT NULL,
  name               TEXT,
  role               TEXT NOT NULL DEFAULT 'counselor'
                       CHECK (role IN ('admin', 'counselor')),
  is_active          INTEGER NOT NULL DEFAULT 1,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       INTEGER,
  last_login_at      INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- A question is the aggregate root. Raw (private) text and the counselor's
-- sanitized public copy live on the same row but are strictly separated: the
-- public columns are the ONLY thing any unauthenticated query may read.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_token   TEXT NOT NULL UNIQUE,
  seeker_email     TEXT,
  category         TEXT,

  -- Private. Never returned by a public endpoint.
  raw_title        TEXT NOT NULL,
  raw_content      TEXT NOT NULL,

  -- Public, hand-written by a counselor. A row is indexable only when
  -- is_public = 1 AND all three are non-null.
  public_title     TEXT,
  public_content   TEXT,
  public_answer    TEXT,
  public_slug      TEXT UNIQUE,

  is_public        INTEGER NOT NULL DEFAULT 0,
  published_at     INTEGER,
  published_by     TEXT REFERENCES users(id) ON DELETE SET NULL,

  is_urgent        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'active', 'resolved')),
  assigned_to      TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Conversation bookkeeping (drives unread badges and the DO watermark).
  last_message_at  INTEGER,
  seeker_read_at   INTEGER,
  counselor_read_at INTEGER,

  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_status    ON questions(status, is_urgent DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_public    ON questions(is_public, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_category  ON questions(category) WHERE is_public = 1;
CREATE INDEX IF NOT EXISTS idx_questions_assigned  ON questions(assigned_to);

-- ---------------------------------------------------------------------------
-- Thread messages. `sender_type` distinguishes the anonymous seeker from a
-- counselor; `sender_user_id` is only ever set for counselor messages.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sender_type    TEXT NOT NULL CHECK (sender_type IN ('seeker', 'counselor')),
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  content        TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(question_id, id);

-- ---------------------------------------------------------------------------
-- Counselor-only internal notes. Never exposed to seekers or the public.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_thread ON internal_notes(question_id, id);

-- ---------------------------------------------------------------------------
-- Community prayer wall.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prayer_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  prayed_count INTEGER NOT NULL DEFAULT 0,
  is_hidden    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prayer_visible ON prayer_requests(is_hidden, created_at DESC);

-- ---------------------------------------------------------------------------
-- Operational accountability for privileged actions. Deliberately stores no IP
-- and no request metadata beyond what is needed to reconstruct "who did what to
-- which resource, and when".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id      TEXT,
  actor_email   TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  meta          TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- Public search index over the sanitized columns only.
--
-- `content='questions'` makes this an *external content* table: it stores the
-- inverted index but not the text, so the archive is never duplicated and can
-- never disagree with the row it indexes.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts USING fts5(
  public_title,
  public_content,
  public_answer,
  category,
  content='questions',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

-- The two-update-trigger split is required: an FTS5 'delete' command must be
-- given exactly the values that were indexed. Issuing one for a row that was
-- never public would corrupt the index, so each direction is guarded by its own
-- WHEN clause.
CREATE TRIGGER IF NOT EXISTS questions_fts_after_insert
AFTER INSERT ON questions
WHEN new.is_public = 1
BEGIN
  INSERT INTO archive_fts(rowid, public_title, public_content, public_answer, category)
  VALUES (new.id, new.public_title, new.public_content, new.public_answer, new.category);
END;

CREATE TRIGGER IF NOT EXISTS questions_fts_after_delete
AFTER DELETE ON questions
WHEN old.is_public = 1
BEGIN
  INSERT INTO archive_fts(archive_fts, rowid, public_title, public_content, public_answer, category)
  VALUES ('delete', old.id, old.public_title, old.public_content, old.public_answer, old.category);
END;

-- Unpublish: retract the previously indexed text.
CREATE TRIGGER IF NOT EXISTS questions_fts_after_update_retract
AFTER UPDATE ON questions
WHEN old.is_public = 1
BEGIN
  INSERT INTO archive_fts(archive_fts, rowid, public_title, public_content, public_answer, category)
  VALUES ('delete', old.id, old.public_title, old.public_content, old.public_answer, old.category);
END;

-- Publish / re-publish: index the current text.
CREATE TRIGGER IF NOT EXISTS questions_fts_after_update_index
AFTER UPDATE ON questions
WHEN new.is_public = 1
BEGIN
  INSERT INTO archive_fts(rowid, public_title, public_content, public_answer, category)
  VALUES (new.id, new.public_title, new.public_content, new.public_answer, new.category);
END;
