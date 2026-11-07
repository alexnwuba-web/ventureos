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
  res.render('public/home', { title: 'VentureOS — Make. Grow. Create.', kinds: Q.KINDS, interests, campuses, cohorts, events: await E.upcoming(), E, P: require('../domain/portal'), SG: Q.SG_PROGRAMMES });
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

// ── Organisations that want to fund or co-design programmes (ScaleGate's impact initiatives) ──
const PARTNER_INTERESTS = {
  venture_philanthropy: 'Sponsor young founders (Venture Philanthropy)',
  founder_programme: 'A founder or venture-building programme',
  challenge: 'An open innovation or challenge programme',
  market_access: 'A market access programme (including into Europe)',
  venture_studio: 'A venture studio around our capability or technology',
  creative: 'Creative and cultural industries',
  center: 'Sponsor a VentureOS Center track, residency or campus facility',
  invest: 'Invest in or lend to VentureOS ventures',
};
const ORG_TYPES = ['Foundation', 'Development-finance institution', 'Government or agency', 'Company', 'Investor or bank', 'University or research body', 'Donor', 'Ecosystem partner', 'Other'];
r.get('/partner', (req, res) => res.render('public/partner', { title: 'Partner with us', PARTNER_INTERESTS, ORG_TYPES, error: null, sent: req.query.sent === '1', b: {} }));
r.post('/partner', async (req, res) => {
  const b = req.body || {};
  const t = (v, n) => String(v || '').trim().slice(0, n);
  const email = t(b.email, 200).toLowerCase();
  const interests = [].concat(b.interests || []).filter((x) => PARTNER_INTERESTS[x]);
  const problem = !t(b.name, 120) || !t(b.organisation, 160) ? 'Please give your name and organisation.'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Please give a valid email address.' : !interests.length ? 'Choose at least one area of interest.'
      : b.consent !== 'on' ? 'Please agree that we may contact you about this enquiry.' : null;
  if (problem || b.website) return res.status(400).render('public/partner', { title: 'Partner with us', PARTNER_INTERESTS, ORG_TYPES, error: problem || 'Please try again.', sent: false, b });
  const e = await db.one(`INSERT INTO partner_enquiries (name, organisation, role, email, phone, country, org_type, interests, message, budget) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [t(b.name, 120), t(b.organisation, 160), t(b.role, 120) || null, email, t(b.phone, 40) || null, t(b.country, 80) || null, ORG_TYPES.includes(b.org_type) ? b.org_type : null,
      interests, t(b.message, 4000) || null, t(b.budget, 120) || null]);
  const mail = require('../lib/mail');
  const config = require('../config');
  await mail.send({ to: email, subject: 'Thank you — ScaleGate Africa', lines: [`Dear ${e.name},`, 'Thank you for your interest in working with ScaleGate Africa and VentureOS. A partner will be in touch within ten working days to arrange a call.'] });
  for (const a of await db.many(`SELECT email FROM people WHERE staff_role = 'admin'`)) {
    await mail.send({ to: a.email, subject: `Partner enquiry: ${e.organisation}`, lines: [`${e.name} (${e.role || '—'}), ${e.organisation} — ${e.org_type || ''}`, `Interested in: ${interests.map((x) => PARTNER_INTERESTS[x]).join('; ')}`, e.message || ''],
      link: { label: 'Open partner enquiries', url: `${config.baseUrl}/staff/partners` } });
  }
  res.redirect('/partner?sent=1');
});
r.PARTNER_INTERESTS = PARTNER_INTERESTS;

r.post('/signout', async (req, res) => { await auth.endSession(req, res); res.redirect('/'); });

module.exports = r;
