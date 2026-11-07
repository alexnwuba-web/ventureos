'use strict';
/*
 * The applicant portal: meetings (first meetings, follow-ups, interviews, site visits), follow-up actions and
 * document requests. Times are entered and shown in Lagos time (WAT, UTC+1, no daylight saving).
 */
const crypto = require('crypto');
const config = require('../config');
const { db } = require('../db');
const { audit } = require('../lib/audit');
const mail = require('../lib/mail');

const err = (status, message) => Object.assign(new Error(message), { status });
const KINDS = { initial: 'First meeting', follow_up: 'Follow-up meeting', interview: 'Interview', due_diligence: 'Due diligence meeting', site_visit: 'Site visit', other: 'Meeting' };
const MODES = { in_person: 'In person', video: 'Video call', phone: 'Phone call' };
const STATUS = { proposed: 'Awaiting your reply', accepted: 'Confirmed', declined: 'Declined', reschedule: 'New time requested', cancelled: 'Cancelled', held: 'Held' };
const STAFF_STATUS = { proposed: 'Invitation sent', accepted: 'Accepted', declined: 'Declined by founder', reschedule: 'Founder asked for another time', cancelled: 'Cancelled', held: 'Held' };

/** "2026-11-20T10:00" in Lagos time → Date. */
function lagos(local) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(local || ''))) return null;
  const d = new Date(`${local}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Date → "2026-11-20T10:00" in Lagos time (for form fields). */
function toLocal(d) { return new Date(new Date(d).getTime() + 3600e3).toISOString().slice(0, 16); }
const whenLagos = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' (Lagos time)';
const text = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

/** A calendar invitation (iCalendar) for a meeting. */
function ics(m, app, method = 'REQUEST') {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(new Date(m.starts_at).getTime() + (m.duration_min || 60) * 60e3);
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const where = m.mode === 'in_person' ? (m.location || config.org.address) : (m.video_link || MODES[m.mode]);
  const desc = [m.agenda ? `Agenda:\n${m.agenda}` : '', m.video_link ? `Join: ${m.video_link}` : '', `VentureOS: ${config.baseUrl}/my/a/${app.ref}/meetings`].filter(Boolean).join('\n\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ScaleGate Africa//VentureOS//EN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${m.id}@ventureos`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(m.starts_at)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${m.title} — ${app.venture_name} / ScaleGate Africa`)}`, `LOCATION:${esc(where)}`, `DESCRIPTION:${esc(desc)}`,
    `ORGANIZER;CN=ScaleGate Africa:mailto:${config.org.email}`, `STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, `SEQUENCE:${Math.floor(new Date(m.updated_at || Date.now()).getTime() / 1000) % 100000}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function meetingLines(m) {
  const where = m.mode === 'in_person' ? `At ${m.location || config.org.address}` : m.mode === 'video' ? `Video call${m.video_link ? `: ${m.video_link}` : ' (link to follow)'}` : `Phone call${m.video_link ? `: ${m.video_link}` : ''}`;
  return [`${m.title}: ${whenLagos(m.starts_at)}, ${m.duration_min} minutes.`, where + '.', ...(m.with_staff ? [`From ScaleGate: ${m.with_staff}.`] : []), ...(m.agenda ? [`Agenda: ${m.agenda}`] : [])];
}

async function staffEmails(app, m) {
  const rows = await db.many(`SELECT DISTINCT email FROM people WHERE staff_role = 'admin' OR id = $1`, [m && m.created_by]);
  return rows.map((r) => r.email);
}

// ── Meetings ──
async function meetingsOf(appId) {
  return db.many(`SELECT m.*, p.name AS created_by_name FROM meetings m LEFT JOIN people p ON p.id = m.created_by WHERE m.application_id = $1 ORDER BY m.starts_at`, [appId]);
}
async function meeting(app, id) {
  const m = await db.one('SELECT * FROM meetings WHERE id = $1 AND application_id = $2', [id, app.id]);
  if (!m) throw err(404, 'That meeting was not found.');
  return m;
}

async function invite(app, staff, body) {
  const starts = lagos(body.starts_at);
  if (!starts) throw err(400, 'Choose the date and time of the meeting.');
  const mode = MODES[body.mode] ? body.mode : 'video';
  const kind = KINDS[body.kind] ? body.kind : 'initial';
  const m = await db.one(`INSERT INTO meetings (application_id, title, kind, starts_at, duration_min, mode, location, video_link, agenda, with_staff, follows_id, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
  [app.id, text(body.title, 160) || KINDS[kind], kind, starts, Math.min(480, Math.max(15, Number(body.duration_min) || 60)), mode,
    mode === 'in_person' ? (text(body.location, 300) || config.org.address) : null, text(body.video_link, 500) || null, text(body.agenda) || null,
    text(body.with_staff, 300) || null, body.follows_id || null, staff.id]);
  await audit(staff.id, app.id, 'meeting.invited', { id: m.id, title: m.title, at: m.starts_at });
  await mail.send({ to: app.applicant_email, subject: `Invitation: ${m.title} with ScaleGate Africa (${app.ref})`,
    lines: [`Dear ${app.applicant_name || 'founder'},`, `ScaleGate Africa would like to meet you about ${app.venture_name}.`, ...meetingLines(m),
      'Please accept, decline or ask for another time in your VentureOS portal. A calendar invitation is attached.'],
    link: { label: 'Reply to the invitation', url: `${config.baseUrl}/my/a/${app.ref}/meetings` }, icalEvent: { method: 'REQUEST', content: ics(m, app) } });
  return m;
}

/** Staff change a meeting: new time (the founder is asked again), cancel, or record it as held. */
async function update(app, staff, id, body) {
  const m = await meeting(app, id);
  const action = body.action;
  if (action === 'reschedule') {
    const starts = lagos(body.starts_at);
    if (!starts) throw err(400, 'Choose the new date and time.');
    const mode = MODES[body.mode] ? body.mode : m.mode;
    const u = await db.one(`UPDATE meetings SET starts_at = $3, duration_min = $4, mode = $5, location = $6, video_link = $7, agenda = COALESCE(NULLIF($8,''), agenda),
      status = 'proposed', founder_note = NULL, reminded_at = NULL, updated_at = now() WHERE id = $1 AND application_id = $2 RETURNING *`,
    [m.id, app.id, starts, Math.min(480, Math.max(15, Number(body.duration_min) || m.duration_min)), mode,
      mode === 'in_person' ? (text(body.location, 300) || m.location || config.org.address) : null, text(body.video_link, 500) || m.video_link, text(body.agenda)]);
    await audit(staff.id, app.id, 'meeting.rescheduled', { id: m.id, at: u.starts_at });
    await mail.send({ to: app.applicant_email, subject: `New time: ${u.title} with ScaleGate Africa (${app.ref})`,
      lines: [`Dear ${app.applicant_name || 'founder'},`, 'We have set a new time for our meeting.', ...meetingLines(u), 'Please confirm it in your VentureOS portal.'],
      link: { label: 'Reply', url: `${config.baseUrl}/my/a/${app.ref}/meetings` }, icalEvent: { method: 'REQUEST', content: ics(u, app) } });
    return u;
  }
  if (action === 'cancel') {
    const u = await db.one(`UPDATE meetings SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`, [m.id]);
    await audit(staff.id, app.id, 'meeting.cancelled', { id: m.id });
    await mail.send({ to: app.applicant_email, subject: `Cancelled: ${m.title} (${app.ref})`,
      lines: [`Dear ${app.applicant_name || 'founder'},`, `The meeting on ${whenLagos(m.starts_at)} has been cancelled.`, ...(body.reason ? [text(body.reason)] : []), 'We will be in touch about next steps.'],
      icalEvent: { method: 'CANCEL', content: ics(u, app, 'CANCEL') } });
    return u;
  }
  if (action === 'held') {
    const u = await db.one(`UPDATE meetings SET status = 'held', summary = $2, internal_notes = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [m.id, text(body.summary, 8000) || null, text(body.internal_notes, 8000) || null]);
    // Follow-up actions and document requests agreed at the meeting, one per line.
    const lines = (v) => String(v || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const due = day(body.due_on);
    for (const a of lines(body.founder_actions)) await addAction(app, staff, { body: a, owner: 'founder', due_on: due, meeting_id: m.id }, false);
    for (const a of lines(body.our_actions)) await addAction(app, staff, { body: a, owner: 'scalegate', due_on: due, meeting_id: m.id }, false);
    for (const d of lines(body.documents)) await requestDocument(app, staff, { title: d, due_on: due, meeting_id: m.id }, false);
    await audit(staff.id, app.id, 'meeting.held', { id: m.id });
    if (u.summary || lines(body.founder_actions).length || lines(body.documents).length) {
      await mail.send({ to: app.applicant_email, subject: `Follow-up from our meeting (${app.ref})`,
        lines: [`Dear ${app.applicant_name || 'founder'},`, `Thank you for meeting us on ${whenLagos(m.starts_at)}.`, ...(u.summary ? [u.summary] : []),
          ...(lines(body.founder_actions).length ? ['Agreed next steps for you:', ...lines(body.founder_actions).map((x) => `• ${x}`)] : []),
          ...(lines(body.documents).length ? ['Documents we asked for:', ...lines(body.documents).map((x) => `• ${x}`)] : []),
          ...(due ? [`Please complete these by ${new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`] : [])],
        link: { label: 'Open your portal', url: `${config.baseUrl}/my/a/${app.ref}/followups` } });
    }
    return u;
  }
  throw err(400, 'Unknown action.');
}

/** The founder answers an invitation: accept, decline, or ask for another time. */
async function reply(app, founder, id, body) {
  const m = await meeting(app, id);
  if (!['proposed', 'accepted', 'reschedule'].includes(m.status)) throw err(409, 'This meeting can no longer be changed.');
  if (new Date(m.starts_at) < new Date()) throw err(409, 'This meeting time has passed.');
  const answer = { accept: 'accepted', decline: 'declined', reschedule: 'reschedule' }[body.answer];
  if (!answer) throw err(400, 'Choose an answer.');
  const note = text(body.note, 2000);
  if (answer === 'reschedule' && !note) throw err(400, 'Suggest two or three times that would suit you.');
  const u = await db.one(`UPDATE meetings SET status = $2, founder_note = $3, updated_at = now() WHERE id = $1 RETURNING *`, [m.id, answer, note || null]);
  await audit(founder.id, app.id, 'meeting.' + answer, { id: m.id, note: note || undefined });
  const verb = { accepted: 'accepted', declined: 'declined', reschedule: 'asked for another time for' }[answer];
  for (const to of await staffEmails(app, m)) {
    await mail.send({ to, subject: `${app.venture_name} ${verb} ${m.title} (${app.ref})`,
      lines: [`${app.applicant_name || 'The founder'} has ${verb} the meeting on ${whenLagos(m.starts_at)}.`, ...(note ? [`Their note: ${note}`] : [])],
      link: { label: 'Open the application', url: `${config.baseUrl}/staff/a/${app.ref}#meetings` } });
  }
  return u;
}

// ── Follow-up actions ──
async function addAction(app, staff, body, notify = true) {
  const b = text(body.body, 1000);
  if (!b) throw err(400, 'Describe the action.');
  const a = await db.one(`INSERT INTO actions (application_id, meeting_id, body, owner, due_on, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [app.id, body.meeting_id || null, b, body.owner === 'scalegate' ? 'scalegate' : 'founder', day(body.due_on), staff.id]);
  await audit(staff.id, app.id, 'action.added', { id: a.id, owner: a.owner });
  if (notify && a.owner === 'founder') {
    await mail.send({ to: app.applicant_email, subject: `A next step for ${app.venture_name} (${app.ref})`,
      lines: [`Dear ${app.applicant_name || 'founder'},`, b, ...(a.due_on ? [`Due by ${a.due_on}.`] : [])], link: { label: 'Open your portal', url: `${config.baseUrl}/my/a/${app.ref}/followups` } });
  }
  return a;
}
async function setActionDone(app, person, id, done) {
  const a = await db.one('SELECT * FROM actions WHERE id = $1 AND application_id = $2', [id, app.id]);
  if (!a) throw err(404, 'Not found.');
  if (!person.staff_role && a.owner !== 'founder') throw err(403, 'Only ScaleGate can close its own actions.');
  await db.query('UPDATE actions SET done_at = CASE WHEN $2 THEN now() END, done_by = CASE WHEN $2 THEN $3::uuid END WHERE id = $1', [id, !!done, person.id]);
  await audit(person.id, app.id, done ? 'action.done' : 'action.reopened', { id });
}

// ── Document requests ──
async function requestDocument(app, staff, body, notify = true) {
  const title = text(body.title, 200);
  if (!title) throw err(400, 'Say which document you need.');
  const r = await db.one(`INSERT INTO document_requests (application_id, meeting_id, title, description, due_on, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [app.id, body.meeting_id || null, title, text(body.description, 2000) || null, day(body.due_on), staff.id]);
  await audit(staff.id, app.id, 'request.added', { id: r.id, title });
  if (notify) {
    await mail.send({ to: app.applicant_email, subject: `Document requested: ${title} (${app.ref})`,
      lines: [`Dear ${app.applicant_name || 'founder'},`, `Please upload: ${title}.`, ...(r.description ? [r.description] : []), ...(r.due_on ? [`Due by ${r.due_on}.`] : [])],
      link: { label: 'Upload it in your portal', url: `${config.baseUrl}/my/a/${app.ref}/followups` } });
  }
  return r;
}
async function setRequestStatus(app, staff, id, status) {
  if (!['open', 'received', 'accepted', 'cancelled'].includes(status)) throw err(400, 'Unknown status.');
  await db.query('UPDATE document_requests SET status = $3 WHERE id = $1 AND application_id = $2', [id, app.id, status]);
  await audit(staff.id, app.id, 'request.' + status, { id });
}

async function followupsOf(appId) {
  const actions = await db.many(`SELECT a.*, m.title AS meeting_title, m.starts_at AS meeting_at FROM actions a LEFT JOIN meetings m ON m.id = a.meeting_id
    WHERE a.application_id = $1 ORDER BY a.done_at NULLS FIRST, a.due_on NULLS LAST, a.created_at`, [appId]);
  const requests = await db.many(`SELECT r.*, m.title AS meeting_title FROM document_requests r LEFT JOIN meetings m ON m.id = r.meeting_id
    WHERE r.application_id = $1 ORDER BY (r.status = 'open') DESC, r.due_on NULLS LAST, r.created_at`, [appId]);
  const files = await db.many(`SELECT * FROM documents WHERE application_id = $1 AND request_id IS NOT NULL AND NOT removed ORDER BY created_at`, [appId]);
  for (const r of requests) r.files = files.filter((f) => f.request_id === r.id);
  return { actions, requests };
}

/** Counts for the portal tabs. */
async function counts(appId) {
  return db.one(`SELECT
    (SELECT count(*) FROM meetings WHERE application_id = $1 AND status IN ('proposed','accepted','reschedule') AND starts_at > now())::int AS upcoming,
    (SELECT count(*) FROM meetings WHERE application_id = $1 AND status = 'proposed' AND starts_at > now())::int AS awaiting,
    (SELECT count(*) FROM actions WHERE application_id = $1 AND owner = 'founder' AND done_at IS NULL)::int AS actions,
    (SELECT count(*) FROM document_requests WHERE application_id = $1 AND status = 'open')::int AS requests`, [appId]);
}

/** Reminders the day before: confirmed or still-awaited meetings in the next 24 hours, once each. */
async function sendReminders() {
  const due = await db.many(`SELECT m.*, a.ref, v.name AS venture_name, p.email AS applicant_email, p.name AS applicant_name
    FROM meetings m JOIN applications a ON a.id = m.application_id JOIN ventures v ON v.id = a.venture_id JOIN people p ON p.id = a.applicant_id
    WHERE m.status IN ('accepted','proposed') AND m.reminded_at IS NULL AND m.starts_at > now() AND m.starts_at < now() + interval '24 hours'`);
  for (const m of due) {
    const app = { ref: m.ref, venture_name: m.venture_name };
    await mail.send({ to: m.applicant_email, subject: `Reminder: ${m.title} with ScaleGate Africa`,
      lines: [`Dear ${m.applicant_name || 'founder'},`, 'A reminder of our meeting:', ...meetingLines(m)],
      link: { label: 'Open your portal', url: `${config.baseUrl}/my/a/${m.ref}/meetings` }, icalEvent: { method: 'REQUEST', content: ics(m, app) } });
    for (const to of await staffEmails(app, m)) {
      await mail.send({ to, subject: `Tomorrow: ${m.title} — ${m.venture_name} (${m.ref})`, lines: meetingLines(m), link: { label: 'Open the application', url: `${config.baseUrl}/staff/a/${m.ref}#meetings` } });
    }
    await db.query('UPDATE meetings SET reminded_at = now() WHERE id = $1', [m.id]);
  }
  return due.length;
}

module.exports = { KINDS, MODES, STATUS, STAFF_STATUS, lagos, toLocal, whenLagos, ics, meetingsOf, meeting, invite, update, reply, addAction, setActionDone,
  requestDocument, setRequestStatus, followupsOf, counts, sendReminders, id: () => crypto.randomUUID() };
