'use strict';
/*
 * Messages between ScaleGate and the founder. Each one gets a reference (VOS-26-0002-M03) that appears in the email
 * subject and in the portal. The founder answers against a reference; a message is "awaiting reply" until the founder
 * answers it, and files the founder attaches are filed with the application's documents under that reference.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('../db');

/** The next reference for an application's messages with the founder. Called inside the insert to avoid gaps. */
async function nextRef(app) {
  const r = await db.one(`SELECT count(*)::int AS n FROM messages WHERE application_id = $1 AND ref IS NOT NULL`, [app.id]);
  for (let n = r.n + 1; ; n += 1) {
    const ref = `${app.ref}-M${String(n).padStart(2, '0')}`;
    if (!(await db.one('SELECT 1 FROM messages WHERE ref = $1', [ref]))) return ref;
  }
}

/** A message from ScaleGate to the founder. Most expect an answer; a decision or a pure notice need not. */
async function toFounder(app, author, body, { needsReply = true } = {}) {
  for (let tries = 0; tries < 3; tries += 1) {
    const ref = await nextRef(app);
    try {
      return await db.one(`INSERT INTO messages (application_id, author_id, body, ref, needs_reply) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [app.id, author.id, body, ref, needsReply]);
    } catch (e) { if (e.code !== '23505') throw e; } // two messages at once: take the next number
  }
  throw new Error('Could not number the message; please try again.');
}

/** The founder's message, answering one of ours when `replyTo` is given; attached files are filed as documents. */
async function fromFounder(app, person, body, replyTo, files = []) {
  const parent = replyTo ? await db.one(`SELECT * FROM messages WHERE id = $1 AND application_id = $2 AND NOT internal AND author_id IS DISTINCT FROM $3`,
    [replyTo, app.id, person.id]).catch(() => null) : null;
  let m = null;
  for (let tries = 0; tries < 3 && !m; tries += 1) {
    const ref = await nextRef(app);
    try {
      m = await db.one(`INSERT INTO messages (application_id, author_id, body, ref, reply_to) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [app.id, person.id, body, ref, parent ? parent.id : null]);
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  const dir = path.join(config.uploadsDir, app.id);
  const saved = [];
  for (const f of files) {
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(f.path, path.join(dir, f.filename));
    saved.push(await db.one(`INSERT INTO documents (application_id, doc_type, filename, stored_name, mime, size, uploaded_by, message_id, note)
      VALUES ($1,'correspondence',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [app.id, f.originalname.slice(0, 200), f.filename, f.mimetype, f.size, person.id, m.id, `Sent with ${m.ref}${parent ? ' in reply to ' + parent.ref : ''}`]));
  }
  return { message: m, parent, files: saved };
}

/** Messages with the founder, with what each answers, its replies, its attachments, and whether it awaits a reply. */
async function thread(app) {
  const appId = app.id;
  const list = await db.many(`SELECT m.*, p.name AS author_name, p.staff_role, p.email AS author_email, pr.ref AS parent_ref
    FROM messages m LEFT JOIN people p ON p.id = m.author_id LEFT JOIN messages pr ON pr.id = m.reply_to
    WHERE m.application_id = $1 AND NOT m.internal ORDER BY m.created_at`, [appId]);
  const files = await db.many(`SELECT id, filename, size, message_id, created_at FROM documents WHERE application_id = $1 AND message_id IS NOT NULL AND NOT removed ORDER BY created_at`, [appId]);
  for (const m of list) {
    m.files = files.filter((f) => f.message_id === m.id);
    m.replies = list.filter((x) => x.reply_to === m.id);
    m.fromFounder = m.author_id === app.applicant_id;
    m.awaiting = !!(m.needs_reply && !m.replies.length);
  }
  return list;
}

/** Staff messages still waiting for the founder's answer, oldest first. */
const awaiting = (list) => list.filter((m) => m.awaiting);

module.exports = { toFounder, fromFounder, thread, awaiting };
