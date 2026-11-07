'use strict';
/* Monthly investment presentations and meetups: public pages, registration, submissions to present, and staff. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { requireStaff } = require('../auth');
const E = require('../domain/events');
const P = require('../domain/portal');
const { upload, keep, discard } = require('../lib/upload');
const { audit } = require('../lib/audit');

const r = express.Router();
const err = (status, message) => Object.assign(new Error(message), { status });

// ── Public ──
r.get('/events', async (req, res) => res.render('events/list', { title: 'Investment presentations and meetups', events: await E.upcoming(), E, P }));

r.get('/events/:id', async (req, res) => {
  const e = await E.get(req.params.id);
  if (!e.public && !req.staff) throw err(404, 'That event was not found.');
  const mine = req.person ? await db.one('SELECT * FROM event_registrations WHERE event_id = $1 AND email = $2 AND NOT cancelled', [e.id, req.person.email]) : null;
  const subs = req.person ? await db.many('SELECT * FROM event_submissions WHERE event_id = $1 AND person_id = $2 ORDER BY created_at', [e.id, req.person.id]) : [];
  res.render('events/show', { title: e.title, e, E, P, mine, subs, notice: req.query.n || null, error: req.query.e || null });
});

r.post('/events/:id/register', async (req, res) => {
  try { await E.register(req.params.id, req.body, req.person); } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    return res.redirect(`/events/${req.params.id}?e=${encodeURIComponent(e.message)}#register`);
  }
  res.redirect(`/events/${req.params.id}?n=registered#register`);
});

const tokenOk = (id, email, t) => { const want = E.cancelToken(id, email); return typeof t === 'string' && t.length === want.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want)); };
r.get('/events/:id/cancel', async (req, res) => {
  const e = await E.get(req.params.id);
  if (!tokenOk(e.id, req.query.e, req.query.t)) throw err(400, 'That cancellation link is not valid.');
  res.render('events/cancel', { title: 'Cancel your place', e, email: req.query.e, t: req.query.t, P });
});
r.post('/events/:id/cancel', async (req, res) => {
  const e = await E.get(req.params.id);
  if (!tokenOk(e.id, req.body.e, req.body.t)) throw err(400, 'That cancellation link is not valid.');
  await E.cancelRegistration(e.id, req.body.e);
  res.render('public/message', { title: 'Place cancelled', message: `Your place at ${e.title} has been cancelled. Thank you for letting us know.`, back: '/' });
});

r.get('/events/:id/invite.ics', async (req, res) => {
  const e = await E.get(req.params.id);
  res.set('Content-Type', 'text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="ventureos-event.ics"').send(E.ics(e));
});

// ── Submit to present (founders, signed in) ──
const signedIn = (req, res, next) => (req.person ? next() : res.redirect('/signin?next=' + encodeURIComponent(req.originalUrl)));
r.get('/events/:id/present', signedIn, async (req, res) => {
  const e = await E.get(req.params.id);
  const apps = await db.many(`SELECT a.id, a.ref, v.name AS venture_name FROM applications a JOIN ventures v ON v.id = a.venture_id
    WHERE a.applicant_id = $1 AND a.status NOT IN ('withdrawn','declined') ORDER BY a.created_at DESC`, [req.person.id]);
  res.render('events/present', { title: `Present at ${e.title}`, e, E, P, apps, error: req.query.e || null });
});
r.post('/events/:id/present', signedIn, upload.single('deck'), async (req, res) => {
  const f = req.file;
  try {
    const deck = f ? { name: f.originalname.slice(0, 200), stored: keep(f, 'events/' + req.params.id) } : null;
    await E.submit(req.params.id, req.person, req.body, deck);
  } catch (e) {
    discard(f);
    if (!e.status || e.status >= 500) throw e;
    return res.redirect(`/events/${req.params.id}/present?e=${encodeURIComponent(e.message)}`);
  }
  res.redirect(`/events/${req.params.id}?n=submitted`);
});
r.post('/events/:id/present/:sid/withdraw', signedIn, async (req, res) => {
  await db.query(`UPDATE event_submissions SET status = 'withdrawn', updated_at = now() WHERE id = $1 AND event_id = $2 AND person_id = $3 AND status IN ('submitted','shortlisted','selected')`,
    [req.params.sid, req.params.id, req.person.id]);
  res.redirect(`/events/${req.params.id}`);
});
r.get('/events/:id/deck/:sid', signedIn, async (req, res) => {
  const s = await db.one('SELECT * FROM event_submissions WHERE id = $1 AND event_id = $2', [req.params.sid, req.params.id]);
  if (!s || !s.deck_stored || !(s.person_id === req.person.id || req.staff)) throw err(404, 'Not found.');
  if (req.staff) await audit(req.person.id, s.application_id, 'event.deck.opened', { event: s.event_id, venture: s.venture_name });
  const file = path.join(config.uploadsDir, 'events', s.event_id, s.deck_stored);
  if (!fs.existsSync(file)) throw err(404, 'The file is missing from storage.');
  res.download(file, s.deck_name.replace(/[^\w.\- ]/g, '_'));
});

// ── Staff ──
const admin = requireStaff('admin');
r.get('/staff/events', requireStaff('admin', 'committee'), async (req, res) => {
  const events = await db.many(`SELECT e.*, (SELECT count(*) FROM event_registrations x WHERE x.event_id = e.id AND NOT x.cancelled)::int AS registered,
    (SELECT count(*) FROM event_submissions s WHERE s.event_id = e.id AND s.status <> 'withdrawn')::int AS submissions,
    (SELECT count(*) FROM event_submissions s WHERE s.event_id = e.id AND s.status IN ('selected','presented'))::int AS selected
    FROM events e ORDER BY e.starts_at DESC LIMIT 100`);
  res.render('staff/events', { title: 'Presentations and meetups', events, E, P });
});
r.post('/staff/events', admin, async (req, res) => { const e = await E.create(req.person, req.body); res.redirect(`/staff/events/${e.id}`); });
r.get('/staff/events/:id', requireStaff('admin', 'committee'), async (req, res) => {
  const e = await E.get(req.params.id);
  const subs = await db.many(`SELECT s.*, p.name AS founder_name, p.email AS founder_email, a.ref FROM event_submissions s JOIN people p ON p.id = s.person_id
    LEFT JOIN applications a ON a.id = s.application_id WHERE s.event_id = $1 ORDER BY (s.status = 'selected') DESC, s.created_at`, [e.id]);
  const regs = await db.many('SELECT * FROM event_registrations WHERE event_id = $1 ORDER BY cancelled, role, created_at', [e.id]);
  res.render('staff/event', { title: e.title, e, E, P, subs, regs, isAdmin: req.staff === 'admin' });
});
r.post('/staff/events/:id', admin, async (req, res) => { await E.update(req.person, req.params.id, req.body); res.redirect(`/staff/events/${req.params.id}`); });
r.post('/staff/events/:id/copy', admin, async (req, res) => { const n = await E.copyToNextMonth(req.person, req.params.id); res.redirect(`/staff/events/${n.id}`); });
r.post('/staff/events/:id/submissions/:sid', admin, async (req, res) => {
  await E.setSubmission(req.person, req.params.id, req.params.sid, req.body);
  res.redirect(`/staff/events/${req.params.id}#submissions`);
});
r.get('/staff/events/:id/registrations.csv', requireStaff('admin', 'committee'), async (req, res) => {
  const e = await E.get(req.params.id);
  const rows = await db.many('SELECT name, email, phone, organisation, role, interests, cancelled, created_at FROM event_registrations WHERE event_id = $1 ORDER BY created_at', [e.id]);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Name,Email,Phone,Organisation,Role,Interests,Cancelled,Registered at', ...rows.map((x) => [x.name, x.email, x.phone, x.organisation, E.ROLES[x.role], x.interests, x.cancelled ? 'yes' : '', new Date(x.created_at).toISOString()].map(q).join(','))].join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="registrations-${e.starts_at.toISOString().slice(0, 10)}.csv"`).send('﻿' + csv);
});

module.exports = r;
