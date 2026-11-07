'use strict';
/*
 * The staff console. Admins see and run everything. Reviewers see only applications assigned to them, declare any
 * conflict first, and do not see other reviewers' scores until they have sent their own. The committee sees all
 * applications and records decisions. Finance keeps the innovator tab.
 */
const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { requireStaff, normEmail, validEmail } = require('../auth');
const A = require('../domain/applications');
const Q = require('../domain/questions');
const D = require('../domain/documents');
const W = require('../domain/workflow');
const S = require('../domain/scoring');
const { analyse } = require('../domain/analysis');
const { audit } = require('../lib/audit');
const mail = require('../lib/mail');

const r = express.Router();
r.use('/staff', requireStaff());

const err = (status, message) => Object.assign(new Error(message), { status });
const isAdmin = (req) => req.staff === 'admin';

async function settings() {
  const out = {};
  for (const s of await db.many('SELECT key, value FROM settings')) out[s.key] = s.value;
  return out;
}

/** The application, if this staff member may see it. */
async function visible(req) {
  const app = await A.byRef(req.params.ref);
  if (!app) throw err(404, 'That application was not found.');
  if (req.staff === 'reviewer') {
    const asg = await db.one('SELECT * FROM assignments WHERE application_id = $1 AND reviewer_id = $2', [app.id, req.person.id]);
    if (!asg) throw err(403, 'This application is not assigned to you.');
    app.assignment = asg;
  } else {
    app.assignment = await db.one('SELECT * FROM assignments WHERE application_id = $1 AND reviewer_id = $2', [app.id, req.person.id]);
  }
  return app;
}

r.get('/staff', async (req, res) => {
  const where = ["a.status <> 'draft'"];
  const params = [];
  if (req.staff === 'reviewer') { params.push(req.person.id); where.push(`EXISTS (SELECT 1 FROM assignments x WHERE x.application_id = a.id AND x.reviewer_id = $${params.length})`); }
  if (req.query.status) { params.push(req.query.status); where.push(`a.status = $${params.length}`); }
  if (req.query.kind) { params.push(req.query.kind); where.push(`$${params.length} = ANY(a.kinds)`); }
  if (req.query.pillar) { params.push(req.query.pillar); where.push(`v.pillar = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(v.name ILIKE $${params.length} OR a.ref ILIKE $${params.length} OR p.email ILIKE $${params.length})`); }
  const apps = await db.many(`SELECT a.*, v.name AS venture_name, v.pillar, v.country, p.name AS applicant_name,
      (SELECT count(*) FROM assignments x WHERE x.application_id = a.id)::int AS reviewers,
      (SELECT count(*) FROM reviews rv WHERE rv.application_id = a.id AND rv.submitted_at IS NOT NULL)::int AS reviews_done,
      (SELECT round(avg(rv.total), 1) FROM reviews rv WHERE rv.application_id = a.id AND rv.submitted_at IS NOT NULL) AS avg_score
    FROM applications a JOIN ventures v ON v.id = a.venture_id JOIN people p ON p.id = a.applicant_id
    WHERE ${where.join(' AND ')} ORDER BY a.submitted_at DESC NULLS LAST LIMIT 500`, params);
  const counts = req.staff === 'reviewer' ? [] : await db.many(`SELECT status, count(*)::int AS n FROM applications GROUP BY status`);
  const drafts = req.staff === 'reviewer' ? 0 : (await db.one(`SELECT count(*)::int AS n FROM applications WHERE status = 'draft'`)).n;
  res.render('staff/home', { title: 'Applications', apps, counts, drafts, q: req.query });
});

r.get('/staff/a/:ref', async (req, res) => {
  const app = await visible(req);
  const answers = await A.answersOf(app.id);
  const docs = await A.documentsOf(app.id);
  const ready = await A.readiness(app, answers, docs);
  const analysis = analyse(app, answers, await settings());
  const assignments = await db.many(`SELECT x.*, p.name, p.email FROM assignments x JOIN people p ON p.id = x.reviewer_id WHERE x.application_id = $1 ORDER BY x.created_at`, [app.id]);
  let reviews = await db.many(`SELECT rv.*, p.name AS reviewer_name FROM reviews rv JOIN people p ON p.id = rv.reviewer_id WHERE rv.application_id = $1 ORDER BY rv.submitted_at NULLS LAST`, [app.id]);
  const rubrics = app.kinds.map((k) => k);
  const mine = reviews.filter((rv) => rv.reviewer_id === req.person.id);
  // Independent review: a reviewer sees others' scores only after sending their own.
  const sentMine = mine.length && mine.every((rv) => rv.submitted_at) && mine.length >= rubrics.length;
  const othersHidden = req.staff === 'reviewer' && !sentMine;
  if (othersHidden) reviews = mine;
  const summaries = Object.fromEntries(rubrics.map((k) => [k, S.summarise(reviews.filter((rv) => rv.rubric === k))]));
  const messages = await db.many(`SELECT m.*, p.name AS author_name, p.staff_role FROM messages m LEFT JOIN people p ON p.id = m.author_id
    WHERE m.application_id = $1 ${req.staff === 'reviewer' ? 'AND m.internal' : ''} ORDER BY m.created_at`, [app.id]);
  const history = req.staff === 'reviewer' ? [] : await db.many(`SELECT au.*, p.name AS actor_name FROM audit au LEFT JOIN people p ON p.id = au.actor_id
    WHERE au.application_id = $1 ORDER BY au.at DESC LIMIT 200`, [app.id]);
  const reviewersAvailable = isAdmin(req) ? await db.many(`SELECT id, name, email, staff_role FROM people WHERE staff_role IS NOT NULL ORDER BY name`) : [];
  const cohorts = isAdmin(req) ? await db.many('SELECT * FROM cohorts ORDER BY created_at DESC') : [];
  const canSeeAnswers = req.staff !== 'reviewer' || (app.assignment && app.assignment.conflict === 'none');
  res.render('staff/application', { title: `${app.venture_name} · ${app.ref}`, app, answers: canSeeAnswers ? answers : {}, canSeeAnswers, docs: canSeeAnswers ? docs : [],
    ready, analysis, assignments, reviews, mine, othersHidden, summaries, rubrics, messages, history, reviewersAvailable, cohorts,
    sections: Q.sectionsFor(app.kinds), docList: D.docsFor(app.kinds, answers), RUBRICS: S.RUBRICS,
    // A practical challenge is for residencies; due diligence is for funding requests.
    NEXT: (W.NEXT[app.status] || []).filter((t) => (t !== 'challenge' || app.kinds.includes('residency')) && (t !== 'due_diligence' || app.kinds.some((k) => k !== 'residency'))), Q, isAdmin: isAdmin(req), notice: req.query.n || null });
});

r.post('/staff/a/:ref/status', async (req, res) => {
  const app = await visible(req);
  const to = String(req.body.to || '');
  const note = String(req.body.note || '').trim().slice(0, 4000);
  if (to === 'info_requested' && !note) throw err(400, 'Say what information you need: the founder sees this note.');
  await A.move(app, to, req.person, note);
  if (note && (to === 'info_requested' || W.isDecision(to))) {
    await db.query('INSERT INTO messages (application_id, author_id, body) VALUES ($1,$2,$3)', [app.id, req.person.id, note]);
  }
  const st = W.STATUSES[to];
  const lines = to === 'info_requested'
    ? [`Dear ${app.applicant_name || 'founder'},`, `We need more information on your application ${app.ref} (${app.venture_name}):`, note, 'Your application is open again for changes. Update it and send it back to us.']
    : [`Dear ${app.applicant_name || 'founder'},`, `Your application ${app.ref} (${app.venture_name}) has moved to: ${st.founder}.`, ...(note && W.isDecision(to) ? [note] : [])];
  await mail.send({ to: app.applicant_email, subject: `VentureOS ${app.ref}: ${st.founder}`, lines, link: { label: 'See your application', url: `${config.baseUrl}/my/a/${app.ref}` } });
  res.redirect(`/staff/a/${app.ref}?n=moved`);
});

r.post('/staff/a/:ref/assign', requireStaff('admin'), async (req, res) => {
  const app = await visible(req);
  const reviewer = await db.one('SELECT * FROM people WHERE id = $1 AND staff_role IS NOT NULL', [req.body.reviewer]);
  if (!reviewer) throw err(400, 'Choose a member of staff.');
  if (reviewer.id === app.applicant_id) throw err(400, 'The applicant cannot review their own application.');
  await db.query('INSERT INTO assignments (application_id, reviewer_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [app.id, reviewer.id, req.person.id]);
  await audit(req.person.id, app.id, 'reviewer.assigned', { reviewer: reviewer.email });
  await mail.send({ to: reviewer.email, subject: `Please review ${app.venture_name} (${app.ref})`,
    lines: [`You have been asked to review ${app.venture_name} (${app.ref}).`, 'First declare whether you have any conflict of interest. If you know the founders, say so and do not score.'],
    link: { label: 'Open the application', url: `${config.baseUrl}/staff/a/${app.ref}` } });
  res.redirect(`/staff/a/${app.ref}#reviews`);
});

r.post('/staff/a/:ref/unassign', requireStaff('admin'), async (req, res) => {
  const app = await visible(req);
  await db.query('DELETE FROM assignments WHERE application_id = $1 AND reviewer_id = $2', [app.id, req.body.reviewer]);
  await audit(req.person.id, app.id, 'reviewer.removed', { reviewer: req.body.reviewer });
  res.redirect(`/staff/a/${app.ref}#reviews`);
});

r.post('/staff/a/:ref/conflict', async (req, res) => {
  const app = await visible(req);
  if (!app.assignment) throw err(403, 'This application is not assigned to you.');
  const conflict = req.body.none === 'yes' ? 'none' : String(req.body.reason || '').trim().slice(0, 1000);
  if (!conflict) throw err(400, 'Describe the conflict, or confirm you have none.');
  await db.query('UPDATE assignments SET conflict = $3 WHERE application_id = $1 AND reviewer_id = $2', [app.id, req.person.id, conflict]);
  await audit(req.person.id, app.id, conflict === 'none' ? 'conflict.none' : 'conflict.declared', conflict === 'none' ? null : { reason: conflict });
  res.redirect(`/staff/a/${app.ref}#reviews`);
});

r.post('/staff/a/:ref/review', async (req, res) => {
  const app = await visible(req);
  if (!app.assignment || app.assignment.conflict !== 'none') throw err(403, 'Declare that you have no conflict of interest before scoring.');
  const rubric = String(req.body.rubric || '');
  if (!app.kinds.includes(rubric) || !S.RUBRICS[rubric]) throw err(400, 'Unknown rubric.');
  const existing = await db.one('SELECT * FROM reviews WHERE application_id = $1 AND reviewer_id = $2 AND rubric = $3', [app.id, req.person.id, rubric]);
  if (existing && existing.submitted_at) throw err(409, 'You have already sent this review.');
  const scores = {};
  for (const c of S.RUBRICS[rubric].criteria) {
    const v = req.body.scores && req.body.scores[c.key];
    if (v !== undefined && v !== '') scores[c.key] = Math.max(0, Math.min(5, Number(v)));
  }
  const total = S.total(rubric, scores);
  const send = req.body.send === 'yes';
  const recommendation = ['advance', 'hold', 'decline'].includes(req.body.recommendation) ? req.body.recommendation : null;
  if (send && (total === null || !recommendation)) throw err(400, 'Score every criterion and choose a recommendation before sending.');
  await db.query(`INSERT INTO reviews (application_id, reviewer_id, rubric, scores, total, recommendation, comments, submitted_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8 THEN now() END, now())
    ON CONFLICT (application_id, reviewer_id, rubric) DO UPDATE SET scores = EXCLUDED.scores, total = EXCLUDED.total, recommendation = EXCLUDED.recommendation,
      comments = EXCLUDED.comments, submitted_at = EXCLUDED.submitted_at, updated_at = now()`,
  [app.id, req.person.id, rubric, scores, total, recommendation, String(req.body.comments || '').slice(0, 6000), send]);
  await audit(req.person.id, app.id, send ? 'review.sent' : 'review.saved', { rubric, total });
  res.redirect(`/staff/a/${app.ref}?n=${send ? 'review-sent' : 'review-saved'}#reviews`);
});

r.post('/staff/a/:ref/message', async (req, res) => {
  const app = await visible(req);
  const body = String(req.body.body || '').trim().slice(0, 4000);
  const internal = req.staff === 'reviewer' || req.body.internal === 'yes';
  if (body) {
    await db.query('INSERT INTO messages (application_id, author_id, body, internal) VALUES ($1,$2,$3,$4)', [app.id, req.person.id, body, internal]);
    await audit(req.person.id, app.id, internal ? 'note' : 'message', null);
    if (!internal) {
      await mail.send({ to: app.applicant_email, subject: `A message about your VentureOS application ${app.ref}`,
        lines: [`Dear ${app.applicant_name || 'founder'},`, body], link: { label: 'Reply in VentureOS', url: `${config.baseUrl}/my/a/${app.ref}#messages` } });
    }
  }
  res.redirect(`/staff/a/${app.ref}#messages`);
});

r.post('/staff/a/:ref/documents/:id', requireStaff('admin'), async (req, res) => {
  const app = await visible(req);
  const status = ['received', 'accepted', 'rejected'].includes(req.body.status) ? req.body.status : 'received';
  await db.query('UPDATE documents SET status = $3, note = $4 WHERE id = $1 AND application_id = $2', [req.params.id, app.id, status, String(req.body.note || '').slice(0, 1000) || null]);
  await audit(req.person.id, app.id, 'document.' + status, { id: req.params.id });
  res.redirect(`/staff/a/${app.ref}#documents`);
});

r.post('/staff/a/:ref/cohort', requireStaff('admin'), async (req, res) => {
  const app = await visible(req);
  await db.query('UPDATE applications SET cohort_id = $2 WHERE id = $1', [app.id, req.body.cohort || null]);
  await audit(req.person.id, app.id, 'cohort', { cohort: req.body.cohort || null });
  res.redirect(`/staff/a/${app.ref}`);
});

// ── People ──
r.get('/staff/people', requireStaff('admin'), async (req, res) => {
  const staff = await db.many(`SELECT p.*, (SELECT count(*) FROM assignments x WHERE x.reviewer_id = p.id)::int AS assigned FROM people p WHERE staff_role IS NOT NULL ORDER BY staff_role, name`);
  const founders = await db.one(`SELECT count(*)::int AS n FROM people WHERE staff_role IS NULL`);
  res.render('staff/people', { title: 'Staff', staffList: staff, founders: founders.n, error: req.query.e || null });
});
r.post('/staff/people', requireStaff('admin'), async (req, res) => {
  const email = normEmail(req.body.email);
  const role = ['admin', 'reviewer', 'committee', 'finance'].includes(req.body.role) ? req.body.role : null;
  if (!validEmail(email) || !role) return res.redirect('/staff/people?e=' + encodeURIComponent('Give a valid email and a role.'));
  await db.query(`INSERT INTO people (email, name, staff_role) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET staff_role = EXCLUDED.staff_role,
    name = CASE WHEN people.name = '' THEN EXCLUDED.name ELSE people.name END`, [email, String(req.body.name || '').trim().slice(0, 120), role]);
  await audit(req.person.id, null, 'staff.set', { email, role });
  await mail.send({ to: email, subject: 'You have been added to VentureOS', lines: [`You have been added to VentureOS (ScaleGate Africa) as ${role}.`, 'Sign in with this email address; we will send you a code.'],
    link: { label: 'Sign in', url: `${config.baseUrl}/signin` } });
  res.redirect('/staff/people');
});
r.post('/staff/people/:id/role', requireStaff('admin'), async (req, res) => {
  if (req.params.id === req.person.id) return res.redirect('/staff/people?e=' + encodeURIComponent('You cannot change your own role.'));
  const role = ['admin', 'reviewer', 'committee', 'finance'].includes(req.body.role) ? req.body.role : null;
  await db.query('UPDATE people SET staff_role = $2 WHERE id = $1', [req.params.id, role]);
  await audit(req.person.id, null, 'staff.set', { id: req.params.id, role });
  res.redirect('/staff/people');
});

// ── Cohorts ──
r.get('/staff/cohorts', requireStaff('admin', 'committee'), async (req, res) => {
  const cohorts = await db.many(`SELECT c.*, (SELECT count(*) FROM applications a WHERE a.cohort_id = c.id)::int AS apps,
    (SELECT count(*) FROM applications a WHERE a.cohort_id = c.id AND a.status = 'accepted')::int AS accepted FROM cohorts c ORDER BY c.created_at DESC`);
  res.render('staff/cohorts', { title: 'Cohorts', cohorts });
});
r.post('/staff/cohorts', requireStaff('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) throw err(400, 'Give the cohort a name.');
  const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  await db.query('INSERT INTO cohorts (name, opens_on, closes_on, starts_on, size_target, status) VALUES ($1,$2,$3,$4,$5,$6)',
    [name, d(req.body.opens_on), d(req.body.closes_on), d(req.body.starts_on), Number(req.body.size_target) || null, ['planned', 'open', 'closed', 'running', 'completed'].includes(req.body.status) ? req.body.status : 'planned']);
  await audit(req.person.id, null, 'cohort.created', { name });
  res.redirect('/staff/cohorts');
});

// ── The innovator tab ──
const TAB_KINDS = { housing: 'Housing', meals: 'Meals', workspace: 'Workspace and labs', studio: 'Studio time', services: 'Venture services', uplift: 'Carrying uplift',
  sponsorship: 'Sponsorship / scholarship (credit)', repayment: 'Repayment (credit)', writeoff: 'Write-off (credit)', conversion: 'Settled or converted at a round (credit)', adjustment: 'Adjustment' };
const CREDITS = ['sponsorship', 'repayment', 'writeoff', 'conversion'];

r.get('/staff/tab', requireStaff('admin', 'finance', 'committee'), async (req, res) => {
  const ventures = await db.many(`SELECT v.*, p.name AS owner_name, coalesce(sum(t.amount), 0) AS balance, count(t.id)::int AS entries,
      (SELECT a.ref FROM applications a WHERE a.venture_id = v.id AND a.status = 'accepted' LIMIT 1) AS accepted_ref
    FROM ventures v JOIN people p ON p.id = v.owner_id LEFT JOIN tab_entries t ON t.venture_id = v.id
    WHERE EXISTS (SELECT 1 FROM applications a WHERE a.venture_id = v.id AND (a.status = 'accepted' OR 'residency' = ANY(a.kinds) AND a.status <> 'draft')) OR EXISTS (SELECT 1 FROM tab_entries t2 WHERE t2.venture_id = v.id)
    GROUP BY v.id, p.name ORDER BY v.name`);
  res.render('staff/tab-list', { title: 'Innovator tab', ventures });
});
r.get('/staff/tab/:venture', requireStaff('admin', 'finance', 'committee'), async (req, res) => {
  const v = await db.one('SELECT v.*, p.name AS owner_name, p.email AS owner_email FROM ventures v JOIN people p ON p.id = v.owner_id WHERE v.id = $1', [req.params.venture]);
  if (!v) throw err(404, 'Not found.');
  const entries = await db.many('SELECT t.*, p.name AS posted_by_name FROM tab_entries t LEFT JOIN people p ON p.id = t.posted_by WHERE t.venture_id = $1 ORDER BY t.created_at', [v.id]);
  res.render('staff/tab', { title: `Tab · ${v.name}`, venture: v, entries, TAB_KINDS, canPost: ['admin', 'finance'].includes(req.staff) });
});
r.post('/staff/tab/:venture', requireStaff('admin', 'finance'), async (req, res) => {
  const v = await db.one('SELECT * FROM ventures WHERE id = $1', [req.params.venture]);
  if (!v) throw err(404, 'Not found.');
  const kind = TAB_KINDS[req.body.kind] ? req.body.kind : null;
  let amount = Math.abs(Number(String(req.body.amount || '').replace(/[,\s]/g, '')));
  if (!kind || !Number.isFinite(amount) || !amount) throw err(400, 'Choose what the entry is for and give an amount.');
  if (CREDITS.includes(kind)) amount = -amount;
  if (kind === 'adjustment' && req.body.direction === 'credit') amount = -amount;
  await db.query('INSERT INTO tab_entries (venture_id, kind, amount, currency, period, memo, posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [v.id, kind, amount, ['NGN', 'USD', 'EUR', 'GBP'].includes(req.body.currency) ? req.body.currency : 'NGN', String(req.body.period || '').slice(0, 20) || null, String(req.body.memo || '').slice(0, 500) || null, req.person.id]);
  await audit(req.person.id, null, 'tab.posted', { venture: v.id, kind, amount });
  res.redirect(`/staff/tab/${v.id}`);
});

module.exports = r;
