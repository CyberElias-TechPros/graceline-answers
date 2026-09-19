/**
 * GraceLine Answers — Cloudflare backend E2E suite.
 *
 * Runs against a locally started worker:
 *   npx wrangler dev --ip 127.0.0.1 --port 8791 &
 *   node test/e2e.mjs            (BASE_URL defaults to http://127.0.0.1:8791)
 *
 * Covers every happy path end-to-end: health, SEO, anonymous submission,
 * crisis detection, seeker thread + messaging + polling, counselor login,
 * inbox, claim/assign, notes, replies, status, publish + FTS search,
 * archive, prayer wall, team management, stats, rate limiting, auth guards.
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8791';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@graceline.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'graceline-admin-1234';
const RUN = Date.now().toString(36); // unique per run so FTS/queries don't collide

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

function section(title) {
  console.log(`\n— ${title} ${'—'.repeat(Math.max(0, 60 - title.length))}`);
}

class Client {
  constructor() {
    this.cookie = null;
  }
  async req(path, { method = 'GET', body, expect = 'json' } = {}) {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers, text };
  }
}

const anon = new Client();
const admin = new Client();
const counselor = new Client();

const state = {};

async function main() {
  // ------------------------------------------------------ 1. Health & SEO
  section('Health & site shell');
  let r = await anon.req('/api/health');
  check('GET /api/health -> ok', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  check('health reports d1+kv', r.data.services?.d1 === true && r.data.services?.kv === true);

  r = await anon.req('/');
  check('GET / serves SPA with meta', r.status === 200 && r.text.includes('<title>') && r.text.includes('Anonymous Bible Q&A'), `status ${r.status}`);
  check('CSP header present', (r.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  check('security headers set', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY');

  r = await anon.req('/ask');
  // Server injects the bare route title (client appends the site name in-browser),
  // plus a canonical tag — mirroring the cPanel backend's seo-render behavior.
  check('GET /ask route-specific title + canonical', r.text.includes('<title>Ask a Question</title>') && r.text.includes('rel="canonical"'), r.text.match(/<title>[^<]*<\/title>/)?.[0]);

  r = await anon.req('/t/some-secret-token');
  check('GET /t/* is noindexed', r.text.includes('noindex, nofollow'));

  r = await anon.req('/robots.txt');
  check('robots.txt disallows /admin + sitemap', r.status === 200 && r.text.includes('Disallow: /admin') && r.text.includes('Sitemap:'));

  r = await anon.req('/sitemap.xml');
  check('sitemap.xml valid urlset', r.status === 200 && r.text.includes('<urlset') && r.text.includes('/archive'));

  r = await anon.req('/feed.xml');
  check('feed.xml valid rss', r.status === 200 && r.text.includes('<rss version="2.0">'));

  r = await anon.req('/api/stats');
  check('GET /api/stats public aggregates', r.status === 200 && typeof r.data.questions_total === 'number', JSON.stringify(r.data));

  // ------------------------------------------------- 2. Anonymous submission
  section('Anonymous question submission');
  const title = `Can I trust the comfort of Psalm ${RUN}`;
  r = await anon.req('/api/questions', {
    method: 'POST',
    body: { title, content: 'I keep returning to Psalm 34 but I cannot seem to feel the comfort described. How do you hold scripture and suffering at the same time?', category: 'Bible Interpretation' },
  });
  check('POST /api/questions -> 201 + tracking_token', r.status === 201 && typeof r.data.tracking_token === 'string' && r.data.tracking_token.length >= 20, JSON.stringify(r.data));
  state.token = r.data.tracking_token;
  state.questionId = r.data.id;
  check('submission not flagged crisis', r.data.crisis?.isCrisis === false);

  r = await anon.req('/api/questions/by-token/' + state.token);
  check('GET by-token returns question + empty messages', r.status === 200 && r.data.question.title === title && Array.isArray(r.data.messages) && r.data.messages.length === 0);
  check('by-token includes updated_at (last activity)', typeof r.data.question.updated_at === 'number');

  r = await anon.req('/api/questions', { method: 'POST', body: { title: 'x', content: 'y' } });
  check('validation: short title rejected 400', r.status === 400);

  const crisisTitle = `I want to end my life ${RUN}`;
  r = await anon.req('/api/questions', {
    method: 'POST',
    body: { title: crisisTitle, content: 'I have decided to kill myself tonight and I am scared.', category: 'Faith Crisis' },
  });
  check('crisis keywords flagged + banner', r.status === 201 && r.data.crisis?.isCrisis === true && Array.isArray(r.data.crisis.banner?.lines), JSON.stringify(r.data.crisis));
  state.crisisToken = r.data.tracking_token;
  state.crisisId = r.data.id;

  r = await anon.req('/api/questions/by-token/' + state.crisisToken);
  check('crisis question marked urgent', r.data.question.is_urgent === 1);

  // --------------------------------------------------- 3. Seeker messaging
  section('Seeker follow-up messages');
  r = await anon.req('/api/messages/seeker', { method: 'POST', body: { token: state.token, content: 'Thank you for reading this. I would love to hear how you approach that tension.' } });
  check('POST /api/messages/seeker -> 201', r.status === 201 && r.data.id > 0, JSON.stringify(r.data));
  state.seekerMsgId = r.data.id;

  r = await anon.req('/api/messages/seeker', { method: 'POST', body: { token: 'nonexistent-token', content: 'hello' } });
  check('seeker message with bad token -> 404', r.status === 404);

  // --------------------------------------------------- 4. Counselor login
  section('Counselor authentication');
  r = await admin.req('/api/admin/me');
  check('GET /admin/me anonymous -> null user', r.status === 200 && r.data.user === null);

  r = await admin.req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'wrong-password-123' } });
  check('login with bad password -> 401', r.status === 401 && r.data.error === 'invalid_credentials');

  r = await admin.req('/api/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check('login with bootstrap admin -> 200 + cookie', r.status === 200 && r.data.user?.role === 'admin' && admin.cookie?.startsWith('sc_auth='), JSON.stringify(r.data));
  state.adminId = r.data.user?.id;

  r = await admin.req('/api/admin/me');
  check('GET /admin/me returns user after login', r.status === 200 && r.data.user?.email === ADMIN_EMAIL);

  // --------------------------------------------------- 5. Inbox + claim
  section('Inbox & claim/assign workflow');
  // Our question already has a seeker follow-up, so it moved to "active".
  r = await admin.req('/api/admin/questions?status=active');
  const mine = r.data.items?.find((q) => q.id === state.questionId);
  check('inbox (active) lists submitted question', !!mine && mine.title === title, JSON.stringify(r.data.items?.map((q) => q.title)));
  check('inbox row exposes assigned_to_name', mine && 'assigned_to_name' in mine);
  r = await admin.req('/api/admin/questions?status=new');
  const crisisRow = r.data.items?.find((q) => q.id === state.crisisId);
  check('urgent question visible in new inbox', !!crisisRow && crisisRow.is_urgent === 1);
  check('urgent sorts first', crisisRow && r.data.items[0]?.id === state.crisisId);

  r = await admin.req(`/api/admin/questions/${state.questionId}/claim`, { method: 'POST' });
  check('claim question -> assigned to self', r.status === 200 && r.data.assigned_to === state.adminId, JSON.stringify(r.data));

  r = await admin.req(`/api/admin/questions/${state.questionId}/claim`, { method: 'POST' });
  check('re-claim is idempotent', r.status === 200 && r.data.already === true);

  // Second counselor (created by the admin) tries to claim the same question
  r = await admin.req('/api/admin/team', { method: 'POST', body: { email: `second-${RUN}@graceline.test`, name: 'Second Counselor', password: 'counselor-password-1', role: 'counselor' } });
  check('admin creates second counselor -> 201', r.status === 201, JSON.stringify(r.data));
  r = await counselor.req('/api/admin/login', { method: 'POST', body: { email: `second-${RUN}@graceline.test`, password: 'counselor-password-1' } });
  check('second counselor can log in', r.status === 200 && r.data.user?.role === 'counselor');
  state.counselorId = r.data.user?.id;

  r = await counselor.req(`/api/admin/questions/${state.questionId}/claim`, { method: 'POST' });
  check('claim by non-admin while assigned -> 409', r.status === 409, JSON.stringify(r.data));

  r = await counselor.req('/api/admin/team');
  check('non-admin blocked from team list -> 403', r.status === 403);

  // --------------------------------------------------- 6. Thread detail + notes
  section('Counselor thread & internal notes');
  r = await admin.req(`/api/admin/questions/${state.questionId}`);
  check('thread detail exposes raw content', r.status === 200 && r.data.question.raw_content.length > 10);
  check('thread detail includes seeker message with name', r.data.messages?.some((m) => m.sender_type === 'seeker'), JSON.stringify(r.data.messages?.map((m) => m.sender_type)));

  r = await admin.req(`/api/admin/questions/${state.questionId}/note`, { method: 'POST', body: { content: 'Seeker is wrestling psalm 34 vs. present suffering. Approach with 1 Peter 5:7 and James 1:5. Follow up next week.' } });
  check('add internal note -> 201', r.status === 201 && r.data.ok === true);

  r = await admin.req(`/api/admin/questions/${state.questionId}`);
  check('notes visible with author name', r.data.notes?.length === 1 && typeof r.data.notes[0].author_name === 'string', JSON.stringify(r.data.notes));

  // --------------------------------------------------- 7. Counselor reply
  section('Counselor reply + seeker polling');
  const since = state.seekerMsgId || 0;
  r = await admin.req('/api/messages/counselor', {
    method: 'POST',
    body: { question_id: state.questionId, content: 'What a gift you have shared with us. I would start with Psalm 34:18, and hold it gently alongside the honest lament in the Psalms — God does not ask you to skip the suffering to reach the comfort. I would love to hear more about what the comfort looked like for you before.' },
  });
  check('POST /api/messages/counselor -> 201 + sender_name', r.status === 201 && r.data.id > 0 && typeof r.data.sender_name === 'string', JSON.stringify(r.data));

  r = await anon.req(`/api/messages/poll?token=${encodeURIComponent(state.token)}&since=${since}`);
  const newMsg = r.data.messages?.[0];
  check('poller receives new counselor message', r.status === 200 && r.data.messages?.length === 1 && newMsg?.sender_type === 'counselor');
  check('polled message carries counselor name', newMsg?.sender_name != null, JSON.stringify(newMsg));

  r = await anon.req(`/api/questions/by-token/${state.token}`);
  check('by-token now shows 2 messages + status active', r.data.messages?.length === 2 && r.data.question.status === 'active');

  r = await anon.req('/api/messages/poll?question_id=999999&since=0');
  check('poll without auth -> 401', r.status === 401);
  r = await counselor.req('/api/messages/poll?question_id=999999&since=0');
  check('authed poll on unknown question -> 404', r.status === 404);

  // --------------------------------------------------- 8. Status + publish
  section('Status transitions & sanitize-and-publish');
  r = await admin.req(`/api/admin/questions/${state.questionId}/status`, { method: 'POST', body: { status: 'resolved' } });
  check('mark resolved -> ok', r.status === 200 && r.data.ok === true);

  r = await admin.req(`/api/admin/questions/${state.questionId}/publish`, { method: 'POST', body: { is_public: true } });
  check('publish without sanitized fields -> 400', r.status === 400 && r.data.error === 'sanitized_fields_required');

  const pubTitle = `Holding Scripture and suffering together (case ${RUN})`;
  const pubContent = 'A seeker returns again and again to Psalm 34:18, but in a hard season the comfort described there feels far away. How can one hold scripture and suffering at the same time?';
  const pubAnswer = 'We begin with Psalm 34:18 and hold it alongside the Psalms of lament, which show us that honesty before God is not the opposite of faith. The counsel: do not skip the suffering to reach the comfort — bring both to God, and ask (James 1:5) for the wisdom to wait with hope.';
  r = await admin.req(`/api/admin/questions/${state.questionId}/publish`, {
    method: 'POST',
    body: { public_title: pubTitle, public_content: pubContent, public_answer: pubAnswer, is_public: true, category: 'Bible Interpretation' },
  });
  check('publish sanitized copy -> ok', r.status === 200 && r.data.published === true, JSON.stringify(r.data));
  state.pubId = state.questionId;

  // --------------------------------------------------- 9. Archive + search
  section('Public archive & full-text search');
  r = await anon.req(`/api/archive?q=holding+scripture+suffering+case+${RUN}`);
  check('FTS finds published answer', r.status === 200 && r.data.items?.some((i) => i.id === state.pubId), JSON.stringify(r.data.items?.map((i) => i.title)));

  r = await anon.req('/api/archive?category=Bible+Interpretation&limit=10');
  check('category filter works', r.status === 200 && r.data.items?.some((i) => i.id === state.pubId));

  r = await anon.req(`/api/archive/${state.pubId}`);
  check('GET /api/archive/:id returns item', r.status === 200 && r.data.title === pubTitle && r.data.answer === pubAnswer);

  check('raw seeker text never exposed publicly', !JSON.stringify(r.data).includes('I keep returning to Psalm'));

  r = await anon.req(`/api/archive/${state.crisisId}`);
  check('unpublished question 404 in archive', r.status === 404);

  r = await anon.req('/sitemap.xml');
  check('sitemap includes published archive item', r.text.includes(`/archive/${state.pubId}`));

  r = await anon.req(`/archive/${state.pubId}`);
  check('SPA /archive/:id meta injection (title + QAPage)', r.text.includes(`<title>${pubTitle}</title>`) && r.text.includes('"QAPage"'), (r.text.match(/<title>[^<]*<\/title>/) || ['?'])[0]);

  r = await anon.req('/feed.xml');
  check('RSS feed includes published item', r.text.includes(pubTitle));

  // --------------------------------------------------- 10. Prayer wall
  section('Prayer wall');
  const prayerTitle = `Healing for a friend ${RUN}`;
  r = await anon.req('/api/prayer', { method: 'POST', body: { title: prayerTitle, content: 'Please pray for a dear friend who is recovering from surgery and feeling alone.' } });
  check('POST /api/prayer -> 201', r.status === 201 && r.data.id > 0, JSON.stringify(r.data));
  state.prayerId = r.data.id;

  r = await anon.req(`/api/prayer/${state.prayerId}/pray`, { method: 'POST' });
  check('"I prayed" increments', r.status === 200 && r.data.ok === true);

  r = await anon.req('/api/prayer');
  const prayed = r.data.items?.find((p) => p.id === state.prayerId);
  check('prayer list shows count 1', !!prayed && prayed.prayed_count === 1 && prayed.title === prayerTitle);

  r = await anon.req('/api/prayer', { method: 'POST', body: { title: 'x', content: 'short' } });
  check('prayer validation: short title 400', r.status === 400);

  // --------------------------------------------------- 11. Team management
  section('Team management (admin)');
  r = await admin.req('/api/admin/team');
  check('team list includes both counselors', r.status === 200 && r.data.items?.length >= 2 && r.data.items.some((u) => u.email === ADMIN_EMAIL));

  r = await admin.req('/api/admin/team', { method: 'POST', body: { email: `temp-${RUN}@graceline.test`, name: 'Temp', password: 'temp-password-99', role: 'counselor' } });
  check('add counselor -> 201', r.status === 201 && r.data.id > 0, JSON.stringify(r.data));
  state.tempId = r.data.id;

  r = await admin.req(`/api/admin/team/${state.tempId}/password`, { method: 'POST', body: { password: 'new-password-12345' } });
  check('reset password -> ok', r.status === 200 && r.data.ok === true);

  // Separate client so the admin session cookie is preserved for deletion.
  const tempClient = new Client();
  r = await tempClient.req('/api/admin/login', { method: 'POST', body: { email: `temp-${RUN}@graceline.test`, password: 'new-password-12345' } });
  check('login works with new password', r.status === 200);

  r = await admin.req(`/api/admin/team/${state.tempId}`, { method: 'DELETE' });
  check('remove counselor -> ok', r.status === 200 && r.data.ok === true);

  r = await admin.req(`/api/admin/team/${state.adminId}`, { method: 'DELETE' });
  check('admin cannot delete self', r.status === 400 && r.data.error === 'cannot_delete_self');

  // --------------------------------------------------- 12. Stats
  section('Admin stats');
  r = await admin.req('/api/admin/stats');
  check('stats reflect activity', r.status === 200 && r.data.public_count >= 1 && r.data.counselor_count >= 2 && r.data.urgent_count >= 1, JSON.stringify(r.data));

  // --------------------------------------------------- 13. Rate limiting
  section('Rate limiting (KV)');
  // 25 rapid posts guarantee >12 in at least one 1-minute window, even across
  // a bucket boundary (pigeonhole over at most 2 windows).
  let limited = null;
  for (let i = 0; i < 25; i += 1) {
    r = await anon.req('/api/messages/seeker', { method: 'POST', body: { token: state.token, content: `rate probe ${i} ${RUN}` } });
    if (r.status === 429) {
      limited = r;
      break;
    }
  }
  check('seeker message limiter trips (429)', limited?.status === 429, `last status ${r.status}`);

  // --------------------------------------------------- 14. Auth guards & 404s
  section('Auth guards & 404s');
  r = await anon.req('/api/messages/counselor', { method: 'POST', body: { question_id: state.questionId, content: 'unauthenticated probe' } });
  check('counselor endpoint without cookie -> 401', r.status === 401);

  r = await anon.req('/api/admin/questions');
  check('admin list without cookie -> 401', r.status === 401);

  r = await anon.req('/api/nope');
  check('unknown API route -> 404 json', r.status === 404 && r.data.error === 'not_found');

  r = await anon.req('/definitely-not-a-page');
  check('unknown page falls back to SPA (200)', r.status === 200 && r.text.includes('<div id="root">'));

  // --------------------------------------------------- 15. Logout
  section('Logout');
  r = await admin.req('/api/admin/logout', { method: 'POST' });
  check('logout clears cookie', r.status === 200 && (r.headers.get('set-cookie') || '').includes('Max-Age=0'));
  r = await admin.req('/api/admin/me');
  check('me -> null after logout', r.status === 200 && r.data.user === null);

  // ------------------------------------------------------ Summary
  console.log('\n' + '=' * 64);
  console.log(`E2E RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
