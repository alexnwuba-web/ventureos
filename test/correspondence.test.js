'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, signIn, mail } = require('./helpers');

let app, admin, founder, ref;
before(async () => {
  await reset(); app = createApp();
  admin = await signIn(app, 'admin@scalegate.test', 'Alex Admin');
  founder = await signIn(app, 'tola@example.ng', 'Tola Founder');
  const r = await founder.post('/my/new').type('form').send({ venture_name: 'Cold Hub', 'kinds[]': 'equity' }).expect(302);
  ref = /(VOS-\d\d-\d{4})/.exec(r.headers.location)[1];
  await db.query(`UPDATE applications SET status = 'screening', submitted_at = now() WHERE ref = $1`, [ref]);
});
after(end);

test('a message to the founder has a reference; the founder replies against it with files, filed in documents', async () => {
  await admin.post(`/staff/a/${ref}/message`).type('form').send({ body: 'Please send your 2025 management accounts.' }).expect(302);
  const sent = mail.outbox.filter((m) => m.to === 'tola@example.ng').pop();
  assert.match(sent.subject, new RegExp(`^\\[${ref}-M01\\]`));
  assert.match(sent.text, /Reply to .*-M01/);
  const m1 = await db.one(`SELECT * FROM messages WHERE ref = $1`, [`${ref}-M01`]);
  assert.equal(m1.needs_reply, true);

  let r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /badge amber">Awaiting reply/);
  assert.match(r.text, /1 awaiting reply/);
  r = await founder.get(`/my/a/${ref}?reply=${m1.id}`).expect(200);
  assert.match(r.text, /waiting for your reply to <b>.*-M01<\/b>/);
  assert.match(r.text, new RegExp(`value="${m1.id}" selected`));

  // The founder replies with two files.
  await founder.post(`/my/a/${ref}/message`).field('reply_to', m1.id).field('body', 'Attached, with the bank statement.')
    .attach('files', Buffer.from('%PDF-1.4 accounts'), 'accounts-2025.pdf').attach('files', Buffer.from('statement'), 'bank.txt').expect(302);
  const m2 = await db.one(`SELECT * FROM messages WHERE ref = $1`, [`${ref}-M02`]);
  assert.equal(m2.reply_to, m1.id);
  const docs = await db.many(`SELECT * FROM documents WHERE message_id = $1 ORDER BY filename`, [m2.id]);
  assert.deepEqual(docs.map((d) => d.filename), ['accounts-2025.pdf', 'bank.txt']);
  assert.equal(docs[0].doc_type, 'correspondence');
  assert.match(docs[0].note, /-M02 in reply to .*-M01/);
  const alert = mail.outbox.filter((m) => m.to === 'admin@scalegate.test' && /Reply from Cold Hub/.test(m.subject)).pop();
  assert.match(alert.subject, new RegExp(`^\\[${ref}-M01\\].*with 2 attachments`));

  r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.doesNotMatch(r.text, /badge amber">Awaiting reply/);
  assert.match(r.text, /Replied .*-M02/);
  assert.match(r.text, /Sent with messages and requests/);
  assert.match(r.text, /accounts-2025\.pdf/);
  // Staff and the founder can open the file.
  await admin.get(`/files/${docs[0].id}`).expect(200);
  await founder.get(`/files/${docs[0].id}`).expect(200);
  assert.match((await founder.get(`/my/a/${ref}/documents`).expect(200)).text, /accounts-2025\.pdf/);
});

test('information-only messages and requests for information', async () => {
  await admin.post(`/staff/a/${ref}/message`).type('form').send({ body: 'We meet on Tuesday to discuss.', no_reply: 'yes' }).expect(302);
  assert.equal((await db.one(`SELECT needs_reply FROM messages WHERE ref = $1`, [`${ref}-M03`])).needs_reply, false);
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'info_requested', note: 'Please add your cap table.' }).expect(302);
  const m4 = await db.one(`SELECT * FROM messages WHERE ref = $1`, [`${ref}-M04`]);
  assert.equal(m4.needs_reply, true);
  assert.match(mail.outbox.filter((m) => m.to === 'tola@example.ng').pop().subject, /-M04\]/);
  // An officer can settle it (answered by phone).
  await admin.post(`/staff/a/${ref}/message/${m4.id}/settle`).type('form').send({}).expect(302);
  assert.equal((await db.one(`SELECT needs_reply FROM messages WHERE id = $1`, [m4.id])).needs_reply, false);
});

test('a founder cannot answer an internal partner note, and bad files are refused', async () => {
  const note = await db.one(`INSERT INTO messages (application_id, author_id, body, internal) SELECT application_id, author_id, 'private', true FROM messages WHERE ref = $1 RETURNING id`, [`${ref}-M01`]);
  await founder.post(`/my/a/${ref}/message`).field('reply_to', note.id).field('body', 'hello').expect(302);
  const last = await db.one(`SELECT * FROM messages WHERE application_id = (SELECT id FROM applications WHERE ref = $1) AND NOT internal ORDER BY created_at DESC LIMIT 1`, [ref]);
  assert.equal(last.reply_to, null);
  const r = await founder.post(`/my/a/${ref}/message`).field('body', 'x').attach('files', Buffer.from('MZ'), 'virus.exe').expect(302);
  assert.match(decodeURIComponent(r.headers.location), /Attach PDF, Word/);
});
