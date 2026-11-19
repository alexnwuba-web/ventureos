'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, signIn } = require('./helpers');

let app, admin, founder;
before(async () => {
  await reset(); app = createApp();
  admin = await signIn(app, 'admin@scalegate.test', 'Alex Admin');
  founder = await signIn(app, 'tola@example.ng', 'Tola Founder');
});
after(end);

async function sent(name) {
  const r = await founder.post('/my/new').type('form').send({ venture_name: name, 'kinds[]': 'equity' }).expect(302);
  const ref = /(VOS-\d\d-\d{4})/.exec(r.headers.location)[1];
  await db.query(`UPDATE applications SET status = 'screening', submitted_at = now() - interval '20 days' WHERE ref = $1`, [ref]);
  return ref;
}
const answerCell = (html, ref) => html.slice(html.indexOf(ref)).split('</tr>')[0];

test('a message to the founder answers the application and stops the clock', async () => {
  const ref = await sent('Cold Hub');
  let r = await admin.get('/staff').expect(200);
  assert.match(r.text, /past 10 days/);
  assert.match(answerCell(r.text, ref), /badge red/);
  await admin.post(`/staff/a/${ref}/message`).type('form').send({ body: 'Thank you — we are reviewing your figures.' }).expect(302);
  r = await admin.get('/staff').expect(200);
  assert.match(answerCell(r.text, ref), /Answered/);
  assert.doesNotMatch(r.text, /past 10 days/);
  r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /clock has stopped/);
  assert.doesNotMatch((await founder.get(`/my/a/${ref}`).expect(200)).text, /We will give you a written answer by/);
});

test('a request for information answers it, and the clock stays off when the founder sends it back', async () => {
  const ref = await sent('Solar Mill');
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'info_requested', note: 'Please send the 2025 accounts.' }).expect(302);
  // The founder sends it back: the application returns to screening, still answered.
  await db.query(`UPDATE applications SET status = 'screening' WHERE ref = $1`, [ref]);
  const r = await admin.get('/staff').expect(200);
  assert.match(answerCell(r.text, ref), /Answered/);
  assert.doesNotMatch(r.text, /past 10 days/);
});

test('a partner discussion post is not an answer to the founder', async () => {
  const ref = await sent('Kiln Works');
  await admin.post(`/staff/a/${ref}/message`).type('form').send({ body: 'note to self', internal: 'yes' }).expect(302);
  const r = await admin.get('/staff').expect(200);
  assert.match(answerCell(r.text, ref), /badge red/);
});
