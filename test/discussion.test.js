'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, signIn, mail } = require('./helpers');

let app, admin, officer, rev, conflicted, founder, ref, ids = {};
before(async () => {
  await reset(); app = createApp();
  admin = await signIn(app, 'admin@scalegate.test', 'Alex Admin');
  founder = await signIn(app, 'tola@example.ng', 'Tola Founder');
  const r = await founder.post('/my/new').type('form').send({ venture_name: 'Cold Hub', 'kinds[]': 'equity' }).expect(302);
  ref = /(VOS-\d\d-\d{4})/.exec(r.headers.location)[1];
  await db.query(`UPDATE applications SET status = 'screening', submitted_at = now() WHERE ref = $1`, [ref]);
  officer = await signIn(app, 'ngozi@scalegate.test', 'Ngozi Officer');
  rev = await signIn(app, 'kunle@scalegate.test', 'Kunle Reviewer');
  conflicted = await signIn(app, 'bisi@scalegate.test', 'Bisi Reviewer');
  await db.query(`UPDATE people SET staff_role = 'officer', staff_since = now() - interval '1 day' WHERE email = 'ngozi@scalegate.test'`);
  await db.query(`UPDATE people SET staff_role = 'reviewer', staff_since = now() - interval '1 day' WHERE email IN ('kunle@scalegate.test','bisi@scalegate.test')`);
  for (const p of await db.many('SELECT id, email FROM people')) ids[p.email] = p.id;
  const a = await db.one('SELECT id FROM applications WHERE ref = $1', [ref]);
  await db.query(`INSERT INTO assignments (application_id, reviewer_id, conflict) VALUES ($1,$2,'none'),($1,$3,'I advised this company')`, [a.id, ids['kunle@scalegate.test'], ids['bisi@scalegate.test']]);
});
after(end);

test('partners message each other about an application; the founder never sees it', async () => {
  // A reviewer writes to the officer.
  await rev.post(`/staff/a/${ref}/discuss`).type('form').send({ body: 'Is the valuation basis supported by the 2025 accounts?', 'notify[]': ids['ngozi@scalegate.test'] }).expect(302);
  const email = mail.outbox.filter((m) => m.to === 'ngozi@scalegate.test' && /Partner discussion/.test(m.subject)).pop();
  assert.ok(email, 'the officer is emailed');
  assert.match(email.text, /valuation basis/);
  assert.match(email.text, /\/staff\/a\/VOS-.*#discussion/);
  assert.ok(!mail.outbox.some((m) => m.to === 'tola@example.ng' && /valuation basis/.test(m.text)), 'founder not emailed');

  // The officer sees it as new: in the menu, on the list, on the application, then it is read.
  let r = await officer.get('/staff').expect(200);
  assert.match(r.text, /Discussions <span class="count"[^>]*>1</);
  assert.match(r.text, /1 new<\/a>/);
  r = await officer.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /Partner discussion/);
  assert.match(r.text, /valuation basis/);
  assert.match(r.text, /badge amber">New/);
  assert.match(r.text, /badge blue">To you/);
  r = await officer.get('/staff').expect(200);
  assert.doesNotMatch(r.text, /Discussions <span class="count"/, 'read once opened');

  // The officer replies to everyone; the reply quotes the question.
  const q = await db.one(`SELECT id FROM messages WHERE body LIKE 'Is the valuation%'`);
  await officer.post(`/staff/a/${ref}/discuss`).type('form').send({ body: 'Not yet; I have asked for the audited accounts.', everyone: 'yes', reply_to: q.id }).expect(302);
  assert.ok(mail.outbox.some((m) => m.to === 'kunle@scalegate.test' && /audited accounts/.test(m.text)), 'reviewer emailed');
  assert.ok(mail.outbox.some((m) => m.to === 'admin@scalegate.test' && /audited accounts/.test(m.text)), 'admin emailed');
  assert.ok(!mail.outbox.some((m) => m.to === 'bisi@scalegate.test' && /audited accounts/.test(m.text)), 'conflicted reviewer not emailed');
  r = await rev.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /↪ Kunle Reviewer: Is the valuation/);
  assert.match(r.text, /keep your scores/);

  // The inbox lists it.
  r = await admin.get('/staff/discussions').expect(200);
  assert.match(r.text, /Cold Hub/);
  assert.match(r.text, /2 new/);

  // The founder never sees the discussion.
  r = await founder.get(`/my/a/${ref}`).expect(200);
  assert.doesNotMatch(r.text, /valuation basis|audited accounts/);
  await founder.post(`/staff/a/${ref}/discuss`).type('form').send({ body: 'x' }).expect(403);

  // A reviewer who declared a conflict is kept out.
  r = await conflicted.get(`/staff/a/${ref}`).expect(200);
  assert.doesNotMatch(r.text, /valuation basis/);
  await conflicted.post(`/staff/a/${ref}/discuss`).type('form').send({ body: 'x' }).expect(403);

  // Reviewers do not write to founders.
  await rev.post(`/staff/a/${ref}/message`).type('form').send({ body: 'Hello founder' }).expect(403);
});
