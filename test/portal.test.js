'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, signIn, mail, request } = require('./helpers');

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

const future = (days, hh = '10:00') => { const d = new Date(Date.now() + days * 864e5 + 3600e3); return `${d.toISOString().slice(0, 10)}T${hh}`; };

test('front page shows the programme, cohorts, campus and projects that interest us', async () => {
  const r = await request(app).get('/').expect(200);
  assert.match(r.text, /About VentureOS/);
  assert.match(r.text, /Cohort 0/);
  assert.match(r.text, /VentureOS Center/);
  assert.match(r.text, /Projects that interest us/);
  assert.match(r.text, /Solar cold storage and natural farm packaging/);
  // Staff edit the list
  await admin.post('/staff/site/interests').type('form').send({ title: 'Aviation and air cargo', body: 'Air cargo for perishables', pillar: 'scalegate', sort: '5' }).expect(302);
  assert.match((await request(app).get('/').expect(200)).text, /Aviation and air cargo/);
  await founder.post('/staff/site/interests').type('form').send({ title: 'x' }).expect(403);
});

test('a meeting: invitation, reply, calendar file, record and follow-ups, requested document', async () => {
  await founder.post(`/staff/a/${ref}/meetings`).type('form').send({ starts_at: future(3) }).expect(403);
  await admin.post(`/staff/a/${ref}/meetings`).type('form').send({ kind: 'initial', starts_at: future(3), duration_min: '45', mode: 'in_person', agenda: 'Valuation basis' }).expect(302);
  const invite = mail.outbox.filter((m) => m.to === 'tola@example.ng' && /Invitation/.test(m.subject)).pop();
  assert.ok(invite.icalEvent && /BEGIN:VCALENDAR/.test(invite.icalEvent.content), 'calendar invitation attached');
  assert.match(invite.text, /Sinari Daranijo/);

  let r = await founder.get(`/my/a/${ref}`).expect(200);
  assert.match(r.text, /1 to answer/);
  const m = await db.one('SELECT * FROM meetings');
  r = await founder.get(`/my/a/${ref}/meetings/${m.id}/invite.ics`).expect(200);
  assert.match(r.text, /DTSTART:/);
  await founder.post(`/my/a/${ref}/meetings/${m.id}/reply`).type('form').send({ answer: 'reschedule' }).expect(302);
  assert.equal((await db.one('SELECT status FROM meetings')).status, 'proposed', 'asking for another time needs suggested times');
  await founder.post(`/my/a/${ref}/meetings/${m.id}/reply`).type('form').send({ answer: 'reschedule', note: 'Thursday 2pm or Friday 11am' }).expect(302);
  assert.ok(mail.outbox.some((x) => x.to === 'admin@scalegate.test' && /asked for another time/.test(x.subject)));
  await admin.post(`/staff/a/${ref}/meetings/${m.id}`).type('form').send({ action: 'reschedule', starts_at: future(4, '14:00') }).expect(302);
  await founder.post(`/my/a/${ref}/meetings/${m.id}/reply`).type('form').send({ answer: 'accept' }).expect(302);
  assert.equal((await db.one('SELECT status FROM meetings')).status, 'accepted');

  // Reminder the day before (simulate the meeting being tomorrow)
  await db.query(`UPDATE meetings SET starts_at = now() + interval '20 hours'`);
  const n = await require('../src/domain/portal').sendReminders();
  assert.equal(n, 1);
  assert.equal(await require('../src/domain/portal').sendReminders(), 0, 'only once');

  // Held: summary, follow-ups and documents
  await admin.post(`/staff/a/${ref}/meetings/${m.id}`).type('form').send({ action: 'held', summary: 'Good first meeting.', internal_notes: 'Valuation too high',
    founder_actions: 'Send revised valuation\nIntroduce your CFO', our_actions: 'Share comparables', documents: 'Audited accounts 2025\nCold room supply contract', due_on: '2027-01-15' }).expect(302);
  r = await founder.get(`/my/a/${ref}/followups`).expect(200);
  assert.match(r.text, /Send revised valuation/);
  assert.match(r.text, /Cold room supply contract/);
  assert.match(r.text, /Share comparables/);
  r = await founder.get(`/my/a/${ref}/meetings`).expect(200);
  assert.match(r.text, /Good first meeting/);
  assert.doesNotMatch(r.text, /Valuation too high/, 'internal notes stay internal');

  // Founder ticks an action and uploads a requested document
  const act = await db.one(`SELECT id FROM actions WHERE body = 'Send revised valuation'`);
  await founder.post(`/my/a/${ref}/actions/${act.id}`).type('form').send({ done: 'yes' }).expect(302);
  const ours = await db.one(`SELECT id FROM actions WHERE owner = 'scalegate'`);
  await founder.post(`/my/a/${ref}/actions/${ours.id}`).type('form').send({ done: 'yes' }).expect(403);
  const rq = await db.one(`SELECT id FROM document_requests WHERE title = 'Audited accounts 2025'`);
  await founder.post(`/my/a/${ref}/requests/${rq.id}/upload`).attach('file', Buffer.from('%PDF'), 'accounts.pdf').expect(302);
  assert.equal((await db.one('SELECT status FROM document_requests WHERE id = $1', [rq.id])).status, 'received');
  r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /accounts\.pdf/);
  r = await admin.get('/staff/meetings').expect(200);
  assert.match(r.text, /Cold Hub/);
});

test('monthly investment presentation: announce, register, submit to present, select, copy to next month', async () => {
  let r = await admin.post('/staff/events').type('form').send({ title: 'VentureOS Investment Evening', kind: 'investment', starts_at: future(20, '18:00'),
    venue: '18A Sinari Daranijo Street, Victoria Island', summary: 'Five ventures present to investors.', pitch_slots: '5', capacity: '2',
    submissions_open: 'yes', registration_open: 'yes', public: 'yes' }).expect(302);
  const id = /\/staff\/events\/([0-9a-f-]{36})/.exec(r.headers.location)[1];
  r = await request(app).get('/').expect(200);
  assert.match(r.text, /VentureOS Investment Evening/);

  // Anyone registers (no account); capacity is enforced; a cancel link works
  const guest = request.agent(app);
  await guest.post(`/events/${id}/register`).type('form').send({ name: 'Ngozi Investor', email: 'ngozi@fund.ng', role: 'investor', organisation: 'Fund' }).expect(302);
  await guest.post(`/events/${id}/register`).type('form').send({ name: 'Bayo', email: 'bayo@x.ng' }).expect(302);
  r = await guest.post(`/events/${id}/register`).type('form').send({ name: 'Late', email: 'late@x.ng' }).expect(302);
  assert.match(decodeURIComponent(r.headers.location), /full/);
  const reg = mail.outbox.filter((m) => m.to === 'ngozi@fund.ng').pop();
  const cancel = /(\/events\/[^\s]+\/cancel\?[^\s]+)/.exec(reg.text)[1];
  const u = new URL('http://x' + cancel);
  await guest.post(`/events/${id}/cancel`).type('form').send({ e: u.searchParams.get('e'), t: u.searchParams.get('t') }).expect(200);
  await guest.post(`/events/${id}/cancel`).type('form').send({ e: 'bayo@x.ng', t: 'wrong' }).expect(400);
  assert.equal((await db.one(`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1 AND NOT cancelled`, [id])).n, 1);

  // A founder submits to present, linked to their application, with a deck
  await request(app).get(`/events/${id}/present`).expect(302);
  const appRow = await db.one('SELECT id FROM applications WHERE ref = $1', [ref]);
  await founder.post(`/events/${id}/present`).field('application', appRow.id).field('venture_name', 'Cold Hub').field('one_liner', 'Solar cold rooms')
    .field('ask_kind', 'equity').field('ask_amount', '50,000,000').attach('deck', Buffer.from('%PDF'), 'deck.pdf').expect(302);
  const sub = await db.one('SELECT * FROM event_submissions');
  assert.equal(sub.ask_amount, 50000000);
  r = await admin.get(`/staff/events/${id}`).expect(200);
  assert.match(r.text, /Cold Hub/);
  await admin.get(`/events/${id}/deck/${sub.id}`).expect(200);
  await admin.post(`/staff/events/${id}/submissions/${sub.id}`).type('form').send({ status: 'selected', slot: '2nd, 18:40' }).expect(302);
  assert.ok(mail.outbox.some((m) => m.to === 'tola@example.ng' && /Selected to present/.test(m.subject)));

  // Copy to the same weekday next month, unpublished
  r = await admin.post(`/staff/events/${id}/copy`).expect(302);
  const copy = await db.one('SELECT * FROM events WHERE id <> $1', [id]);
  const a = await db.one('SELECT starts_at FROM events WHERE id = $1', [id]);
  const wd = (d) => new Date(new Date(d).getTime() + 3600e3).getUTCDay();
  assert.equal(wd(copy.starts_at), wd(a.starts_at));
  assert.equal(copy.public, false);
});

test('integrity veto, the ten-working-day answer date, and the triage traction rule', async () => {
  const { answerDue } = require('../src/lib/view');
  // Friday 6 Nov 2026 + 10 working days = Friday 20 Nov 2026
  assert.equal(answerDue(new Date('2026-11-06T09:00:00Z')).toISOString().slice(0, 10), '2026-11-20');
  await db.query(`UPDATE applications SET status = 'submitted', stage = 1, submitted_at = now() WHERE ref = $1`, [ref]);
  let r = await founder.get(`/my/a/${ref}`).expect(200);
  assert.match(r.text, /written answer by/);
  r = await admin.get('/staff').expect(200);
  assert.match(r.text, /Cold Hub/);

  // Triage: a traction score above 3 needs evidence in the comments
  const rev = await signIn(app, 'rev2@scalegate.test', 'Rev Two');
  await admin.post('/staff/people').type('form').send({ email: 'rev2@scalegate.test', role: 'reviewer' }).expect(302);
  const revRow = await db.one(`SELECT id FROM people WHERE email = 'rev2@scalegate.test'`);
  await admin.post(`/staff/a/${ref}/assign`).type('form').send({ reviewer: revRow.id }).expect(302);
  await rev.post(`/staff/a/${ref}/conflict`).type('form').send({ none: 'yes' }).expect(302);
  const form = { rubric: 'triage', send: 'yes', recommendation: 'advance', 'scores[founder]': '4', 'scores[problem_fit]': '4', 'scores[traction]': '5', 'scores[europe]': '3', 'scores[scalability]': '3' };
  await rev.post(`/staff/a/${ref}/review`).type('form').send(form).expect(400);
  await rev.post(`/staff/a/${ref}/review`).type('form').send({ ...form, comments: 'Twelve paying estates; invoices seen.' }).expect(302);
  assert.equal((await db.one(`SELECT total FROM reviews WHERE rubric = 'triage'`)).total, 75);
  await rev.post(`/staff/a/${ref}/review`).type('form').send({ ...form, rubric: 'equity' }).expect(400, /Unknown rubric/);

  // Veto: only administrators, no reason, out of every list
  await rev.post(`/staff/a/${ref}/veto`).type('form').send({ on: 'yes' }).expect(403);
  await admin.post(`/staff/a/${ref}/veto`).type('form').send({ on: 'yes' }).expect(302);
  assert.doesNotMatch((await admin.get('/staff').expect(200)).text, /Cold Hub/);
  assert.match((await admin.get('/staff?vetoed=1').expect(200)).text, /Cold Hub/);
  await rev.get(`/staff/a/${ref}`).expect(404);
  await admin.get(`/staff/a/${ref}`).expect(200);
  await admin.post(`/staff/a/${ref}/veto`).type('form').send({ on: 'no' }).expect(302);
  assert.match((await admin.get('/staff').expect(200)).text, /Cold Hub/);
});
