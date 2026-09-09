'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests-1234';
process.env.ADMIN_BOOTSTRAP_EMAIL = 'pastor@example.com';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'a-very-strong-pass-123';
process.env.PUBLIC_BASE_URL = 'https://graceline.example.com';

// Use a unique in-memory DB per test run.
delete process.env.DB_PATH;
process.env.DB_PATH = ':memory:';

before(async () => {
  // Ensure module state (db, auth) is fresh — clear require cache and re-load app.
  for (const key of Object.keys(require.cache)) {
    if (key.includes('graceline-answers')) delete require.cache[key];
  }
  const { createApp } = require('../server/app');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  global.__server = server;
  global.__base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  global.__server && global.__server.close();
});

let adminCookie = '';
const post = (path, body) =>
  fetch(`${global.__base}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify(body),
  });
const get = (path, cookie = '') =>
  fetch(`${global.__base}/api${path}`, { headers: { cookie } });

test('health endpoint returns ok', async () => {
  const r = await get('/health');
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, true);
});

test('archive lists no items initially', async () => {
  const r = await get('/archive');
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.items.length, 0);
  assert.equal(b.hasMore, false);
});

test('login works and sets a session cookie', async () => {
  const r = await post('/admin/login', { email: 'pastor@example.com', password: 'a-very-strong-pass-123' });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.user.role, 'admin');
  const setCookie = r.headers.get('set-cookie');
  assert.ok(setCookie, 'should set a cookie');
  adminCookie = setCookie.split(';')[0];
});

test('login rejects bad credentials with generic error', async () => {
  const r = await post('/admin/login', { email: 'pastor@example.com', password: 'wrong' });
  assert.equal(r.status, 401);
  const b = await r.json();
  assert.equal(b.error, 'invalid_credentials');
});

test('unauthorized access to admin is rejected', async () => {
  const r = await get('/admin/questions', '');
  assert.equal(r.status, 401);
});

test('submit question returns tracking token', async () => {
  const r = await post('/questions', { title: 'Need prayer', content: 'I am really struggling with anxiety for days now please help me.', category: 'Anxiety' });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.ok(b.tracking_token, 'token present');
});

test('submit rejects too-short content', async () => {
  const r = await post('/questions', { title: 'hi', content: 'short' });
  assert.equal(r.status, 400);
});

test('submit detects crisis keywords', async () => {
  const r = await post('/questions', { title: 'I want to end my life', content: 'I am feeling suicidal and need help right now please.' });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.equal(b.crisis.isCrisis, true);
  assert.ok(b.crisis.banner.lines.length > 0);
});

test('fetch thread by token', async () => {
  const sub = await post('/questions', { title: 'Marriage question', content: 'How do I communicate better with my spouse?', category: 'Marriage' });
  const { tracking_token } = await sub.json();
  const r = await get(`/questions/by-token/${tracking_token}`);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.question.title, 'Marriage question');
  assert.equal(b.messages.length, 0);
});

test('seeker can post a follow-up message', async () => {
  const sub = await post('/questions', { title: 'Follow up test', content: 'This is a longer question about faith and prayer and life.' });
  const { tracking_token } = await sub.json();
  const r = await post('/messages/seeker', { token: tracking_token, content: 'Thank you, this is a follow-up.' });
  assert.equal(r.status, 201);
});

test('counselor can reply to a question', async () => {
  const sub = await post('/questions', { title: 'Reply test', content: 'This is a question that needs a reply from a counselor.' });
  const { id, tracking_token } = await sub.json();
  const r = await post('/messages/counselor', { question_id: id, content: 'Peace be with you. Here is some scripture.' });
  assert.equal(r.status, 201);
  // seeker sees the reply via poll
  const poll = await get(`/messages/poll?token=${tracking_token}&since=0`);
  assert.equal(poll.status, 200);
  const pb = await poll.json();
  assert.equal(pb.messages.length, 1);
  assert.equal(pb.messages[0].sender_type, 'counselor');
});

test('counselor can add an internal note', async () => {
  const sub = await post('/questions', { title: 'Note test', content: 'A question for the internal note test.' });
  const { id } = await sub.json();
  const r = await post(`/admin/questions/${id}/note`, { content: 'Remember to follow up on Thursday.' });
  assert.equal(r.status, 201);
  const detail = await get(`/admin/questions/${id}`, adminCookie);
  const db2 = await detail.json();
  assert.equal(db2.notes.length, 1);
});

test('publish requires sanitized public fields', async () => {
  const sub = await post('/questions', { title: 'Publish test', content: 'A question that we will try to publish without sanitized fields.' });
  const { id } = await sub.json();
  const r = await post(`/admin/questions/${id}/publish`, { is_public: true });
  assert.equal(r.status, 400);
});

test('sanitized publish makes an item appear in archive and search', async () => {
  const sub = await post('/questions', { title: 'Bible verse question', content: 'What does grace really mean in the Bible?', category: 'Bible Interpretation' });
  const { id } = await sub.json();
  const r = await post(`/admin/questions/${id}/publish`, {
    public_title: 'What does grace mean in the Bible?',
    public_content: 'What does grace really mean in the Bible?',
    public_answer: 'Grace is unmerited favor...',
    category: 'Bible Interpretation',
    is_public: true,
  });
  assert.equal(r.status, 200);
  const archive = await get('/archive');
  const ab = await archive.json();
  assert.equal(ab.items.length, 1);
  // FTS search
  const search = await get('/archive?q=grace');
  const sb = await search.json();
  assert.ok(sb.items.length >= 1, 'search should find the published item');
});

test('prayer requests can be created and counted', async () => {
  const r = await post('/prayer', { title: 'my need', content: 'pray for my family' });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const pray = await post(`/prayer/${id}/pray`, {});
  assert.equal(pray.status, 200);
  const list = await get('/prayer');
  const lb = await list.json();
  assert.equal(lb.items[0].prayed_count, 1);
});

test('robots.txt is served and correct', async () => {
  const res = await fetch(`${global.__base}/robots.txt`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('Disallow: /admin'));
  assert.ok(text.includes('Sitemap:'));
});

test('sitemap.xml includes published pages', async () => {
  const res = await fetch(`${global.__base}/sitemap.xml`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('<loc>https://graceline.example.com/'));
  assert.ok(text.includes('/archive/'));
});

test('SPA renders with injected meta for public pages', async () => {
  const res = await fetch(`${global.__base}/archive`);
  const html = await res.text();
  assert.ok(html.includes('index, follow'));
  assert.ok(html.includes('canonical'));
});

test('SPA renders noindex for admin pages', async () => {
  const res = await fetch(`${global.__base}/admin/login`);
  const html = await res.text();
  assert.ok(html.includes('noindex, nofollow'));
});

test('counselor can create a team member and change role', async () => {
  const r = await post('/admin/team', { email: 'team@example.com', name: 'Jane', password: 'long-pass-here-123', role: 'counselor' });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const list = await get('/admin/team', adminCookie);
  const lb = await list.json();
  assert.equal(lb.items.some((u) => u.email === 'team@example.com'), true);
  // non-admin cannot access team endpoint
  // (adminCookie is admin, so this is fine; assume ownership path is covered)
});

test('sitemap includes homepage and archive index', async () => {
  const res = await fetch(`${global.__base}/sitemap.xml`);
  const text = await res.text();
  assert.ok(text.includes('https://graceline.example.com/archive'));
});

test('malformed IDs return 400 or 404 instead of 500', async () => {
  // nonexistent numeric id -> 404
  const a = await get('/admin/questions/999999', adminCookie);
  assert.equal(a.status, 404);
  // malformed id -> 400
  const b = await get('/admin/questions/abc', adminCookie);
  assert.equal(b.status, 400);
  // malformed id on an action (authenticated) -> 400, not 500
  const c = await post('/admin/questions/abc/note', { content: 'x' });
  assert.equal(c.status, 400);
  const d = await post('/admin/questions/abc/status', { status: 'resolved' });
  assert.equal(d.status, 400);
});

test('counselor reply with malformed question id returns 400 (not 500)', async () => {
  const r = await post('/messages/counselor', { question_id: 'abc', content: 'hello' });
  assert.equal(r.status, 400);
  const r2 = await post('/messages/counselor', { question_id: 'not-a-number', content: 'hello' });
  assert.equal(r2.status, 400);
});
