'use strict';
/* The founder's side: profile, applications, answers, documents, sending, messages and the innovator tab. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { db } = require('../db');
const { requirePerson } = require('../auth');
const A = require('../domain/applications');
const Q = require('../domain/questions');
const D = require('../domain/documents');
const W = require('../domain/workflow');
const { audit } = require('../lib/audit');
const mail = require('../lib/mail');
const P = require('../domain/portal');

const r = express.Router();
r.use('/my', requirePerson);

const ALLOWED = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|webp|txt|zip)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(config.uploadsDir, 'tmp'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.uploadLimit, files: 1 },
  fileFilter: (req, file, cb) => cb(ALLOWED.test(file.originalname) ? null : Object.assign(new Error('Upload a PDF, Word, Excel, PowerPoint, image, text or zip file.'), { status: 400 }), ALLOWED.test(file.originalname)),
});

/** The founder's own application, or 404. */
async function mine(req) {
  const app = await A.byRef(req.params.ref);
  if (!app || app.applicant_id !== req.person.id) throw Object.assign(new Error('That application was not found.'), { status: 404 });
  return app;
}

r.get('/my/profile', (req, res) => res.render('my/profile', { title: 'Your details', next: req.query.next || '', error: null }));
r.post('/my/profile', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 120);
  if (name.length < 2) return res.status(400).render('my/profile', { title: 'Your details', next: req.body.next || '', error: 'Please give your full name.' });
  await db.query('UPDATE people SET name = $2, phone = $3, country = $4 WHERE id = $1',
    [req.person.id, name, String(req.body.phone || '').trim().slice(0, 40) || null, String(req.body.country || '').trim().slice(0, 80) || null]);
  const next = String(req.body.next || '');
  res.redirect(next.startsWith('/') && !next.startsWith('//') ? next : (req.person.staff_role ? '/staff' : '/my'));
});

r.get('/my', async (req, res) => {
  if (!req.person.name) return res.redirect('/my/profile');
  const apps = await db.many(`SELECT a.*, v.name AS venture_name, v.pillar,
      (SELECT count(*) FROM meetings m WHERE m.application_id = a.id AND m.status = 'proposed' AND m.starts_at > now())::int AS awaiting,
      (SELECT min(m.starts_at) FROM meetings m WHERE m.application_id = a.id AND m.status IN ('proposed','accepted') AND m.starts_at > now()) AS next_meeting,
      (SELECT count(*) FROM document_requests r WHERE r.application_id = a.id AND r.status = 'open')::int AS requests,
      (SELECT count(*) FROM actions x WHERE x.application_id = a.id AND x.owner = 'founder' AND x.done_at IS NULL)::int AS actions
    FROM applications a JOIN ventures v ON v.id = a.venture_id
    WHERE a.applicant_id = $1 ORDER BY a.created_at DESC`, [req.person.id]);
  const tab = await db.many(`SELECT v.id, v.name, sum(t.amount) AS balance, max(t.currency) AS currency FROM tab_entries t JOIN ventures v ON v.id = t.venture_id
    WHERE v.owner_id = $1 GROUP BY v.id, v.name`, [req.person.id]);
  const presentations = await db.many(`SELECT s.*, e.title AS event_title, e.starts_at FROM event_submissions s JOIN events e ON e.id = s.event_id
    WHERE s.person_id = $1 AND e.starts_at > now() - interval '60 days' ORDER BY e.starts_at`, [req.person.id]);
  const registrations = await db.many(`SELECT e.* FROM event_registrations x JOIN events e ON e.id = x.event_id
    WHERE x.email = $1 AND NOT x.cancelled AND e.starts_at > now() AND e.status = 'scheduled' ORDER BY e.starts_at`, [req.person.email]);
  res.render('my/home', { title: 'Your applications', apps, tab, presentations, registrations, E: require('../domain/events'), P });
});

r.get('/my/new', (req, res) => res.render('my/new', { title: 'New application', error: null, kinds: Q.KINDS, chosen: [].concat(req.query.kind || []) }));
r.post('/my/new', async (req, res) => {
  try {
    const app = await A.create(req.person, { kinds: req.body.kinds, ventureName: req.body.venture_name });
    res.redirect(`/my/a/${app.ref}`);
  } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    res.status(e.status).render('my/new', { title: 'New application', error: e.message, kinds: Q.KINDS, chosen: [].concat(req.body.kinds || []) });
  }
});

r.get('/my/a/:ref', async (req, res) => {
  const app = await mine(req);
  const answers = await A.answersOf(app.id);
  const docs = await A.documentsOf(app.id);
  const ready = await A.readiness(app, answers, docs);
  const sections = Q.sectionsFor(app.kinds, app.stage).map((s) => {
    const req2 = s.fields.filter((f) => Q.isRequired(f, s, app.kinds, answers));
    const done = req2.filter((f) => Q.filled(f, answers[f.key])).length;
    const any = s.fields.some((f) => Q.filled(f, answers[f.key]));
    return { ...s, required: req2.length, done, started: any };
  });
  const messages = await db.many(`SELECT m.*, p.name AS author_name, p.staff_role FROM messages m LEFT JOIN people p ON p.id = m.author_id
    WHERE m.application_id = $1 AND NOT m.internal ORDER BY m.created_at`, [app.id]);
  const counts = await P.counts(app.id);
  const upcoming = (await P.meetingsOf(app.id)).filter((m) => ['proposed', 'accepted', 'reschedule'].includes(m.status) && new Date(m.starts_at) > new Date());
  res.render('my/application', { title: `${app.venture_name} · ${app.ref}`, app, sections, ready, docs, messages, counts, upcoming, P, tab: 'overview', editable: W.editable(app.status), kinds: Q.KINDS, notice: req.query.n || null });
});

r.post('/my/a/:ref/kinds', async (req, res) => {
  const app = await mine(req);
  await A.setKinds(app, req.body.kinds, req.person.id);
  res.redirect(`/my/a/${app.ref}`);
});

r.get('/my/a/:ref/s/:section', async (req, res) => {
  const app = await mine(req);
  const sections = Q.sectionsFor(app.kinds, app.stage);
  const i = sections.findIndex((s) => s.key === req.params.section);
  if (i < 0) throw Object.assign(new Error('That part of the application does not exist.'), { status: 404 });
  const answers = await A.answersOf(app.id);
  res.render('my/section', { title: sections[i].title, app, section: sections[i], answers, index: i, count: sections.length,
    prev: sections[i - 1] || null, next: sections[i + 1] || null, editable: W.editable(app.status), Q });
});

r.post('/my/a/:ref/s/:section', async (req, res) => {
  const app = await mine(req);
  await A.saveSection(app, req.params.section, req.body, req.person.id);
  const sections = Q.sectionsFor(app.kinds, app.stage);
  const i = sections.findIndex((s) => s.key === req.params.section);
  const go = req.body.go;
  if (go === 'next' && sections[i + 1]) return res.redirect(`/my/a/${app.ref}/s/${sections[i + 1].key}`);
  if (go === 'next') return res.redirect(`/my/a/${app.ref}/documents`);
  if (go === 'stay') return res.redirect(`/my/a/${app.ref}/s/${req.params.section}?saved=1`);
  res.redirect(`/my/a/${app.ref}?n=saved`);
});

r.get('/my/a/:ref/documents', async (req, res) => {
  const app = await mine(req);
  const answers = await A.answersOf(app.id);
  const docs = await A.documentsOf(app.id);
  res.render('my/documents', { title: 'Documents', app, list: D.docsFor(app.kinds, answers, app.stage), docs, editable: W.editable(app.status), error: req.query.e || null });
});

r.post('/my/a/:ref/documents', upload.single('file'), async (req, res) => {
  const app = await mine(req);
  const f = req.file;
  try {
    if (!W.editable(app.status)) throw Object.assign(new Error('This application has been sent; documents can no longer be added.'), { status: 409 });
    if (!f) throw Object.assign(new Error('Choose a file to upload.'), { status: 400 });
    const type = D.doc(req.body.doc_type) ? req.body.doc_type : 'other';
    const dir = path.join(config.uploadsDir, app.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(f.path, path.join(dir, f.filename));
    await db.query(`INSERT INTO documents (application_id, doc_type, filename, stored_name, mime, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [app.id, type, f.originalname.slice(0, 200), f.filename, f.mimetype, f.size, req.person.id]);
    await audit(req.person.id, app.id, 'document.uploaded', { type, name: f.originalname });
    res.redirect(`/my/a/${app.ref}/documents`);
  } catch (e) {
    if (f && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    if (!e.status) throw e;
    res.redirect(`/my/a/${app.ref}/documents?e=${encodeURIComponent(e.message)}`);
  }
});

r.post('/my/a/:ref/documents/:id/remove', async (req, res) => {
  const app = await mine(req);
  if (!W.editable(app.status)) throw Object.assign(new Error('This application has been sent; documents can no longer be removed.'), { status: 409 });
  await db.query('UPDATE documents SET removed = true WHERE id = $1 AND application_id = $2', [req.params.id, app.id]);
  await audit(req.person.id, app.id, 'document.removed', { id: req.params.id });
  res.redirect(`/my/a/${app.ref}/documents`);
});

/** Opens a document: for the founder who owns the application, or staff who may see it. */
r.get('/files/:id', async (req, res, next) => {
  if (!req.person) return res.redirect('/signin?next=' + encodeURIComponent(req.originalUrl));
  const d = await db.one(`SELECT d.*, a.applicant_id, a.ref FROM documents d JOIN applications a ON a.id = d.application_id WHERE d.id = $1`, [req.params.id]);
  if (!d) return next();
  let ok = d.applicant_id === req.person.id;
  if (!ok && req.staff) {
    ok = req.staff !== 'reviewer' || !!(await db.one(`SELECT 1 FROM assignments WHERE application_id = $1 AND reviewer_id = $2 AND conflict = 'none'`, [d.application_id, req.person.id]));
    if (ok) await audit(req.person.id, d.application_id, 'document.opened', { id: d.id, name: d.filename });
  }
  if (!ok) throw Object.assign(new Error('You cannot open this document.'), { status: 403 });
  const file = path.join(config.uploadsDir, d.application_id, d.stored_name);
  if (!fs.existsSync(file)) throw Object.assign(new Error('The file is missing from storage.'), { status: 404 });
  res.set('Content-Type', d.mime || 'application/octet-stream');
  res.set('Content-Disposition', `${/pdf|image/.test(d.mime || '') ? 'inline' : 'attachment'}; filename="${d.filename.replace(/[^\w.\- ]/g, '_')}"`);
  res.sendFile(file);
});

r.get('/my/a/:ref/review', async (req, res) => {
  const app = await mine(req);
  const answers = await A.answersOf(app.id);
  const docs = await A.documentsOf(app.id);
  const ready = await A.readiness(app, answers, docs);
  res.render('my/review', { title: 'Check and send', app, answers, docs, ready, sections: Q.sectionsFor(app.kinds, app.stage), editable: W.editable(app.status), Q, error: null });
});

r.post('/my/a/:ref/submit', async (req, res) => {
  const app = await mine(req);
  const to = await A.submit(app, req.person);
  await mail.send({ to: req.person.email, subject: `We have received your application ${app.ref}`,
    lines: [`Dear ${req.person.name},`,
      to === 'submitted' ? `Thank you. We have received the initial submission for ${app.venture_name} (${app.ref}). We will screen it and let you know whether we would like to proceed to full documentation.`
        : to === 'full_submitted' ? `Thank you. We have received the full documentation for ${app.venture_name} (${app.ref}). It now goes to two independent reviewers.`
          : `Thank you. Your application ${app.ref} has been sent back to us with the information we asked for.`,
      'We will write to you at each stage.'],
    link: { label: 'See your application', url: `${config.baseUrl}/my/a/${app.ref}` } });
  const admins = await db.many(`SELECT email FROM people WHERE staff_role = 'admin'`);
  for (const a of admins) {
    await mail.send({ to: a.email, subject: `${to === 'full_submitted' ? 'Full documentation' : to === 'submitted' ? 'New initial submission' : 'Information sent back'}: ${app.venture_name} (${app.ref})`,
      lines: [`${app.venture_name} (${app.kinds.map((k) => Q.KINDS[k].short).join(', ')}): ${W.STATUSES[to].label.toLowerCase()}.`],
      link: { label: 'Open in VentureOS', url: `${config.baseUrl}/staff/a/${app.ref}` } });
  }
  res.redirect(`/my/a/${app.ref}?n=sent`);
});

r.post('/my/a/:ref/withdraw', async (req, res) => {
  const app = await mine(req);
  if (W.STATUSES[app.status].final) throw Object.assign(new Error('This application is already closed.'), { status: 409 });
  await db.query(`UPDATE applications SET status = 'withdrawn', updated_at = now() WHERE id = $1`, [app.id]);
  await audit(req.person.id, app.id, 'status', { from: app.status, to: 'withdrawn' });
  res.redirect(`/my/a/${app.ref}`);
});

r.post('/my/a/:ref/message', async (req, res) => {
  const app = await mine(req);
  const body = String(req.body.body || '').trim().slice(0, 4000);
  if (body) {
    await db.query('INSERT INTO messages (application_id, author_id, body) VALUES ($1,$2,$3)', [app.id, req.person.id, body]);
    await audit(req.person.id, app.id, 'message', null);
  }
  res.redirect(`/my/a/${app.ref}#messages`);
});

// ── The portal: meetings, follow-ups and requested documents ──
r.get('/my/a/:ref/meetings', async (req, res) => {
  const app = await mine(req);
  res.render('my/meetings', { title: `Meetings · ${app.venture_name}`, app, meetings: await P.meetingsOf(app.id), counts: await P.counts(app.id), P, tab: 'meetings',
    notice: req.query.n || null, error: req.query.e || null });
});
r.post('/my/a/:ref/meetings/:id/reply', async (req, res) => {
  const app = await mine(req);
  try { await P.reply(app, req.person, req.params.id, req.body); } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    return res.redirect(`/my/a/${app.ref}/meetings?e=${encodeURIComponent(e.message)}`);
  }
  res.redirect(`/my/a/${app.ref}/meetings?n=replied`);
});
r.get('/my/a/:ref/meetings/:id/invite.ics', async (req, res) => {
  const app = await mine(req);
  const m = await P.meeting(app, req.params.id);
  res.set('Content-Type', 'text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="ventureos-meeting.ics"').send(P.ics(m, app));
});
r.get('/my/a/:ref/followups', async (req, res) => {
  const app = await mine(req);
  const { actions, requests } = await P.followupsOf(app.id);
  res.render('my/followups', { title: `Follow-ups · ${app.venture_name}`, app, actions, requests, counts: await P.counts(app.id), tab: 'followups', error: req.query.e || null });
});
r.post('/my/a/:ref/actions/:id', async (req, res) => {
  const app = await mine(req);
  await P.setActionDone(app, req.person, req.params.id, req.body.done === 'yes');
  res.redirect(`/my/a/${app.ref}/followups`);
});
r.post('/my/a/:ref/requests/:id/upload', upload.single('file'), async (req, res) => {
  const app = await mine(req);
  const f = req.file;
  try {
    if (W.STATUSES[app.status].final) throw Object.assign(new Error('This application is closed.'), { status: 409 });
    const rq = await db.one(`SELECT * FROM document_requests WHERE id = $1 AND application_id = $2 AND status IN ('open','received')`, [req.params.id, app.id]);
    if (!rq) throw Object.assign(new Error('That request is closed.'), { status: 409 });
    if (!f) throw Object.assign(new Error('Choose a file to upload.'), { status: 400 });
    const dir = path.join(config.uploadsDir, app.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(f.path, path.join(dir, f.filename));
    await db.query(`INSERT INTO documents (application_id, doc_type, filename, stored_name, mime, size, uploaded_by, request_id) VALUES ($1,'requested',$2,$3,$4,$5,$6,$7)`,
      [app.id, f.originalname.slice(0, 200), f.filename, f.mimetype, f.size, req.person.id, rq.id]);
    await db.query(`UPDATE document_requests SET status = 'received' WHERE id = $1`, [rq.id]);
    await audit(req.person.id, app.id, 'request.uploaded', { id: rq.id, name: f.originalname });
    for (const a of await db.many(`SELECT DISTINCT email FROM people WHERE staff_role = 'admin' OR id = $1`, [rq.created_by])) {
      await mail.send({ to: a.email, subject: `Requested document received: ${rq.title} — ${app.venture_name} (${app.ref})`, lines: [`${app.venture_name} uploaded ${f.originalname}.`],
        link: { label: 'Open the application', url: `${config.baseUrl}/staff/a/${app.ref}#followups` } });
    }
    res.redirect(`/my/a/${app.ref}/followups`);
  } catch (e) {
    if (f && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    if (!e.status) throw e;
    res.redirect(`/my/a/${app.ref}/followups?e=${encodeURIComponent(e.message)}`);
  }
});

r.get('/my/tab/:venture', async (req, res) => {
  const v = await db.one('SELECT * FROM ventures WHERE id = $1 AND owner_id = $2', [req.params.venture, req.person.id]);
  if (!v) throw Object.assign(new Error('Not found.'), { status: 404 });
  const entries = await db.many('SELECT * FROM tab_entries WHERE venture_id = $1 ORDER BY created_at', [v.id]);
  res.render('my/tab', { title: `Innovator tab · ${v.name}`, venture: v, entries });
});

module.exports = r;
