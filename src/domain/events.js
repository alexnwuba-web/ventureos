'use strict';
/*
 * Monthly investment presentations and meetups. Staff announce an event; founders submit to present (signed in);
 * anyone registers to attend (no account needed). Staff shortlist and select presenters, and can copy an event to
 * the same weekday of the next month.
 */
const crypto = require('crypto');
const config = require('../config');
const { db } = require('../db');
const { audit } = require('../lib/audit');
const mail = require('../lib/mail');
const P = require('./portal');

const err = (status, message) => Object.assign(new Error(message), { status });
const t = (v, n = 2000) => String(v ?? '').trim().slice(0, n);
const KINDS = { investment: 'Investment presentation', meetup: 'Meetup', demo_day: 'Demo Day', other: 'Event' };
const ROLES = { investor: 'Investor', founder: 'Founder', corporate: 'Company', government: 'Government', partner: 'Partner', student: 'Student', other: 'Other' };
const SUB_STATUS = { submitted: 'Received', shortlisted: 'Shortlisted', selected: 'Selected to present', declined: 'Not selected this time', withdrawn: 'Withdrawn', presented: 'Presented' };

function ics(e, method = 'REQUEST') {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(new Date(e.starts_at).getTime() + (e.duration_min || 120) * 60e3);
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ScaleGate Africa//VentureOS//EN', `METHOD:${method}`, 'BEGIN:VEVENT', `UID:event-${e.id}@ventureos`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`VentureOS: ${e.title}`)}`,
    `LOCATION:${esc(e.venue || e.online_link || 'Online')}`, `DESCRIPTION:${esc(`${e.summary}\n\n${config.baseUrl}/events/${e.id}`)}`,
    `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function fields(b) {
  const starts = P.lagos(b.starts_at);
  if (!starts) throw err(400, 'Choose the date and time.');
  const title = t(b.title, 160);
  if (!title) throw err(400, 'Give the event a title.');
  const n = (v) => (Number(v) > 0 ? Math.floor(Number(v)) : null);
  return [title, KINDS[b.kind] ? b.kind : 'investment', starts, Math.min(720, Math.max(30, Number(b.duration_min) || 120)), t(b.venue, 300) || null,
    t(b.online_link, 500) || null, t(b.summary, 3000), n(b.capacity), n(b.pitch_slots), /^\d{4}-\d{2}-\d{2}$/.test(b.submissions_close || '') ? b.submissions_close : null,
    b.submissions_open === 'yes', b.registration_open === 'yes', b.public === 'yes'];
}

async function create(staff, b) {
  const e = await db.one(`INSERT INTO events (title, kind, starts_at, duration_min, venue, online_link, summary, capacity, pitch_slots, submissions_close,
    submissions_open, registration_open, public, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [...fields(b), staff.id]);
  await audit(staff.id, null, 'event.created', { id: e.id, title: e.title });
  return e;
}

async function update(staff, id, b) {
  const before = await get(id);
  const e = await db.one(`UPDATE events SET title = $2, kind = $3, starts_at = $4, duration_min = $5, venue = $6, online_link = $7, summary = $8, capacity = $9,
    pitch_slots = $10, submissions_close = $11, submissions_open = $12, registration_open = $13, public = $14, status = $15, updated_at = now() WHERE id = $1 RETURNING *`,
  [id, ...fields(b), ['scheduled', 'cancelled', 'held'].includes(b.status) ? b.status : 'scheduled']);
  await audit(staff.id, null, 'event.updated', { id, title: e.title });
  // Tell registered people and selected presenters when the time, place or status changes.
  const moved = new Date(before.starts_at).getTime() !== new Date(e.starts_at).getTime() || before.venue !== e.venue || before.online_link !== e.online_link;
  if ((moved || (e.status === 'cancelled' && before.status !== 'cancelled')) && e.status !== 'held') {
    const people = await db.many(`SELECT email, name FROM event_registrations WHERE event_id = $1 AND NOT cancelled
      UNION SELECT p.email, p.name FROM event_submissions s JOIN people p ON p.id = s.person_id WHERE s.event_id = $1 AND s.status = 'selected'`, [id]);
    for (const p of people) {
      await mail.send({ to: p.email, subject: e.status === 'cancelled' ? `Cancelled: ${e.title}` : `Changed: ${e.title}`,
        lines: [`Dear ${p.name || 'guest'},`, e.status === 'cancelled' ? `${e.title} on ${P.whenLagos(before.starts_at)} has been cancelled.` : `${e.title} is now on ${P.whenLagos(e.starts_at)}${e.venue ? ', at ' + e.venue : ''}.`],
        link: { label: 'Event details', url: `${config.baseUrl}/events/${e.id}` }, icalEvent: { method: e.status === 'cancelled' ? 'CANCEL' : 'REQUEST', content: ics(e, e.status === 'cancelled' ? 'CANCEL' : 'REQUEST') } });
    }
  }
  return e;
}

/** The same event on the same weekday of the next month (e.g. the first Thursday), not yet published. */
async function copyToNextMonth(staff, id) {
  const e = await get(id);
  const local = new Date(new Date(e.starts_at).getTime() + 3600e3);              // Lagos wall-clock as UTC fields
  const week = Math.ceil(local.getUTCDate() / 7), wd = local.getUTCDay();
  const next = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1, local.getUTCHours(), local.getUTCMinutes()));
  let d = 1 + ((wd - next.getUTCDay() + 7) % 7) + (week - 1) * 7;
  const dim = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  if (d > dim) d -= 7;                                                              // "5th Thursday" becomes the last one
  next.setUTCDate(d);
  const starts = new Date(next.getTime() - 3600e3);
  const close = e.submissions_close ? new Date(new Date(e.submissions_close).getTime() + (starts - new Date(e.starts_at))).toISOString().slice(0, 10) : null;
  const n = await db.one(`INSERT INTO events (title, kind, starts_at, duration_min, venue, online_link, summary, capacity, pitch_slots, submissions_close,
    submissions_open, registration_open, public, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13) RETURNING *`,
  [e.title, e.kind, starts, e.duration_min, e.venue, e.online_link, e.summary, e.capacity, e.pitch_slots, close, e.submissions_open, e.registration_open, staff.id]);
  await audit(staff.id, null, 'event.copied', { from: id, id: n.id });
  return n;
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw err(404, 'That event was not found.');
  const e = await db.one(`SELECT e.*, (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id AND NOT r.cancelled)::int AS registered,
    (SELECT count(*) FROM event_submissions s WHERE s.event_id = e.id AND s.status NOT IN ('withdrawn'))::int AS submissions,
    (SELECT count(*) FROM event_submissions s WHERE s.event_id = e.id AND s.status IN ('selected','presented'))::int AS selected FROM events e WHERE e.id = $1`, [id]);
  if (!e) throw err(404, 'That event was not found.');
  return e;
}

const upcoming = () => db.many(`SELECT e.*, (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id AND NOT r.cancelled)::int AS registered
  FROM events e WHERE e.public AND e.status = 'scheduled' AND e.starts_at > now() - interval '3 hours' ORDER BY e.starts_at LIMIT 6`);

/** Can founders still submit to present? */
function pitchOpen(e) {
  if (!e.pitch_slots || !e.submissions_open || e.status !== 'scheduled') return false;
  if (new Date(e.starts_at) < new Date()) return false;
  if (e.submissions_close && new Date(`${e.submissions_close}T23:59:59+01:00`) < new Date()) return false;
  return true;
}
const full = (e) => !!(e.capacity && e.registered >= e.capacity);
const registrationOpen = (e) => e.registration_open && e.status === 'scheduled' && new Date(e.starts_at) > new Date() && !full(e);

async function register(eventId, b, person) {
  const e = await get(eventId);
  if (!registrationOpen(e)) throw err(409, full(e) ? 'Sorry — this event is full.' : 'Registration for this event is closed.');
  const email = String(b.email || (person && person.email) || '').trim().toLowerCase();
  const name = t(b.name, 120) || (person && person.name) || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw err(400, 'Please give a valid email address.');
  if (name.length < 2) throw err(400, 'Please give your name.');
  const role = ROLES[b.role] ? b.role : 'other';
  const r = await db.one(`INSERT INTO event_registrations (event_id, person_id, name, email, phone, organisation, role, interests) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (event_id, email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, organisation = EXCLUDED.organisation, role = EXCLUDED.role,
      interests = EXCLUDED.interests, cancelled = false RETURNING *`,
  [e.id, person ? person.id : null, name, email, t(b.phone, 40) || null, t(b.organisation, 160) || null, role, t(b.interests, 1000) || null]);
  await mail.send({ to: email, subject: `You're registered: ${e.title}`,
    lines: [`Dear ${name},`, `You are registered for ${e.title} on ${P.whenLagos(e.starts_at)}.`, e.venue ? `Venue: ${e.venue}.` : '', e.online_link ? `Join online: ${e.online_link}` : '',
      'A calendar invitation is attached.', `If you can no longer come, please cancel so someone else can have your place: ${cancelUrl(e.id, email)}`].filter(Boolean),
    link: { label: 'Event details', url: `${config.baseUrl}/events/${e.id}` }, icalEvent: { method: 'REQUEST', content: ics(e) } });
  return r;
}

/** A link that lets a registered person cancel their own place, without signing in. */
const cancelToken = (eventId, email) => crypto.createHmac('sha256', config.sessionSecret).update(`cancel:${eventId}:${String(email).toLowerCase()}`).digest('hex').slice(0, 32);
const cancelUrl = (eventId, email) => `${config.baseUrl}/events/${eventId}/cancel?e=${encodeURIComponent(email)}&t=${cancelToken(eventId, email)}`;

async function cancelRegistration(eventId, email) {
  await db.query('UPDATE event_registrations SET cancelled = true WHERE event_id = $1 AND email = $2', [eventId, String(email || '').toLowerCase()]);
}

async function submit(eventId, person, b, deck) {
  const e = await get(eventId);
  if (!pitchOpen(e)) throw err(409, 'Submissions to present at this event are closed.');
  let app = null;
  if (b.application) app = await db.one(`SELECT a.*, v.name AS venture_name, v.pillar FROM applications a JOIN ventures v ON v.id = a.venture_id WHERE a.id = $1 AND a.applicant_id = $2`, [b.application, person.id]);
  const venture = t(b.venture_name, 160) || (app && app.venture_name);
  const one = t(b.one_liner, 300);
  if (!venture || !one) throw err(400, 'Give the venture name and what it does in one sentence.');
  const amount = Number(String(b.ask_amount || '').replace(/[,\s]/g, '')) || null;
  const s = await db.one(`INSERT INTO event_submissions (event_id, person_id, application_id, venture_name, one_liner, pillar, ask_kind, ask_amount, ask_currency, why_now, deck_name, deck_stored)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (event_id, person_id, venture_name) DO UPDATE SET one_liner = EXCLUDED.one_liner, application_id = EXCLUDED.application_id, pillar = EXCLUDED.pillar,
      ask_kind = EXCLUDED.ask_kind, ask_amount = EXCLUDED.ask_amount, ask_currency = EXCLUDED.ask_currency, why_now = EXCLUDED.why_now,
      deck_name = COALESCE(EXCLUDED.deck_name, event_submissions.deck_name), deck_stored = COALESCE(EXCLUDED.deck_stored, event_submissions.deck_stored),
      status = CASE WHEN event_submissions.status = 'withdrawn' THEN 'submitted' ELSE event_submissions.status END, updated_at = now() RETURNING *`,
  [e.id, person.id, app ? app.id : null, venture, one, ['make', 'grow', 'create'].includes(b.pillar) ? b.pillar : (app && app.pillar) || null,
    ['equity', 'debt', 'grant', 'partners', 'other'].includes(b.ask_kind) ? b.ask_kind : null, amount, t(b.ask_currency, 3) || null, t(b.why_now, 1500) || null,
    deck ? deck.name : null, deck ? deck.stored : null]);
  await audit(person.id, app ? app.id : null, 'event.submitted', { event: e.id, venture });
  await mail.send({ to: person.email, subject: `Received: your submission to present at ${e.title}`,
    lines: [`Dear ${person.name},`, `Thank you. We have received ${venture}'s submission to present at ${e.title} on ${P.whenLagos(e.starts_at)}.`,
      'We will let you know whether you have been selected. You can follow it in your VentureOS portal.'], link: { label: 'Your portal', url: `${config.baseUrl}/my` } });
  for (const a of await db.many(`SELECT email FROM people WHERE staff_role = 'admin'`)) {
    await mail.send({ to: a.email, subject: `Submission to present: ${venture} — ${e.title}`, lines: [one], link: { label: 'Open the event', url: `${config.baseUrl}/staff/events/${e.id}` } });
  }
  return s;
}

async function setSubmission(staff, eventId, subId, b) {
  const s = await db.one(`SELECT s.*, p.email, p.name FROM event_submissions s JOIN people p ON p.id = s.person_id WHERE s.id = $1 AND s.event_id = $2`, [subId, eventId]);
  if (!s) throw err(404, 'Not found.');
  const status = SUB_STATUS[b.status] ? b.status : s.status;
  const u = await db.one(`UPDATE event_submissions SET status = $2, slot = $3, staff_note = $4, updated_at = now() WHERE id = $1 RETURNING *`,
    [s.id, status, t(b.slot, 120) || null, t(b.staff_note, 2000) || null]);
  await audit(staff.id, s.application_id, 'event.submission.' + status, { event: eventId, venture: s.venture_name });
  if (status !== s.status && ['selected', 'declined'].includes(status)) {
    const e = await get(eventId);
    await mail.send({ to: s.email, subject: status === 'selected' ? `Selected to present at ${e.title}` : `Your submission to present at ${e.title}`,
      lines: [`Dear ${s.name},`, status === 'selected'
        ? `${s.venture_name} has been selected to present at ${e.title} on ${P.whenLagos(e.starts_at)}${e.venue ? ', at ' + e.venue : ''}.${u.slot ? ` Your slot: ${u.slot}.` : ''}`
        : `Thank you for submitting ${s.venture_name}. It has not been selected for ${e.title}, but you are welcome to submit for a later month.`,
      ...(u.staff_note ? [u.staff_note] : [])],
      link: { label: 'Your portal', url: `${config.baseUrl}/my` }, ...(status === 'selected' ? { icalEvent: { method: 'REQUEST', content: ics(e) } } : {}) });
  }
  return u;
}

module.exports = { cancelToken, cancelUrl, KINDS, ROLES, SUB_STATUS, ics, create, update, copyToNextMonth, get, upcoming, pitchOpen, registrationOpen, full, register, cancelRegistration, submit, setSubmission };
