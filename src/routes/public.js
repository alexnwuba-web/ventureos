'use strict';
const express = require('express');
const auth = require('../auth');
const Q = require('../domain/questions');
const { db } = require('../db');

const r = express.Router();
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '');

r.get('/', async (req, res) => {
  const interests = await db.many('SELECT * FROM interests WHERE visible ORDER BY sort, title');
  const campuses = await db.many('SELECT * FROM campuses WHERE visible ORDER BY sort, name');
  const cohorts = await db.many(`SELECT c.*, k.name AS campus_name, k.city AS campus_city FROM cohorts c LEFT JOIN campuses k ON k.id = c.campus_id
    WHERE c.public AND c.status IN ('planned','open','running') ORDER BY (c.status = 'open') DESC, c.starts_on NULLS LAST, c.created_at`);
  const E = require('../domain/events');
  res.render('public/home', { title: 'VentureOS — Make. Grow. Create.', kinds: Q.KINDS, interests, campuses, cohorts, events: await E.upcoming(), E, P: require('../domain/portal') });
});

r.get('/signin', (req, res) => {
  if (req.person) return res.redirect(safeNext(req.query.next) || (req.staff ? '/staff' : '/my'));
  res.render('public/signin', { title: 'Sign in', next: safeNext(req.query.next), error: null, email: '' });
});

r.post('/signin', async (req, res) => {
  const next = safeNext(req.body.next);
  try {
    const { email } = await auth.sendCode(req.body.email);
    res.redirect(`/signin/code?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    res.status(e.status).render('public/signin', { title: 'Sign in', next, error: e.message, email: req.body.email || '' });
  }
});

r.get('/signin/code', (req, res) => {
  res.render('public/code', { title: 'Enter your code', email: auth.normEmail(req.query.email), next: safeNext(req.query.next), error: null });
});

r.post('/signin/code', async (req, res) => {
  const next = safeNext(req.body.next);
  try {
    const person = await auth.checkCode(req.body.email, req.body.code);
    await auth.startSession(res, person.id);
    if (!person.name) return res.redirect('/my/profile?next=' + encodeURIComponent(next || ''));
    res.redirect(next || (person.staff_role ? '/staff' : '/my'));
  } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    res.status(e.status).render('public/code', { title: 'Enter your code', email: auth.normEmail(req.body.email), next, error: e.message });
  }
});

r.post('/signout', async (req, res) => { await auth.endSession(req, res); res.redirect('/'); });

module.exports = r;
