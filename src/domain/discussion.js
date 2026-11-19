'use strict';
/*
 * Partner discussion: ScaleGate partners talk to each other about an application. Posts are internal messages, so the
 * founder never sees them. A post can answer an earlier one and can be sent to chosen partners, who are emailed.
 * Reviewers who declared a conflict on an application are kept out of its discussion.
 */
const { db } = require('../db');

/** Staff roles that take part in every application's discussion; assigned reviewers join their own applications. */
const CORE_ROLES = ['admin', 'officer', 'committee'];

/** Whether this staff member may read and post in the application's discussion. */
function canJoin(staff, app) {
  if (staff === 'reviewer') return !!(app.assignment && (app.assignment.conflict === null || app.assignment.conflict === 'none'));
  return CORE_ROLES.includes(staff) || staff === 'finance';
}

/** The partners on an application: active admins, officers and committee members, and its reviewers without a conflict. */
async function teamOf(appId) {
  return db.many(`SELECT p.id, p.name, p.email, p.staff_role, p.staff_title, (x.reviewer_id IS NOT NULL) AS assigned
    FROM people p LEFT JOIN assignments x ON x.application_id = $1 AND x.reviewer_id = p.id
    WHERE p.staff_role IS NOT NULL AND p.staff_active IS NOT FALSE
      AND (p.staff_role = ANY($2) OR (x.reviewer_id IS NOT NULL AND (x.conflict IS NULL OR x.conflict = 'none')))
    ORDER BY (x.reviewer_id IS NOT NULL) DESC, p.name`, [appId, CORE_ROLES]);
}

/** The discussion, oldest first, with whether each post is new to this person and whether it was sent to them. */
async function postsOf(appId, personId) {
  const seen = await db.one('SELECT read_at FROM discussion_reads WHERE application_id = $1 AND person_id = $2', [appId, personId]);
  const posts = await db.many(`SELECT m.*, p.name AS author_name, p.staff_role AS author_role, p.staff_title AS author_title,
      pr.body AS parent_body, pp.name AS parent_author,
      (SELECT array_agg(n.name ORDER BY n.name) FROM people n WHERE n.id = ANY(m.notified)) AS notified_names
    FROM messages m LEFT JOIN people p ON p.id = m.author_id
      LEFT JOIN messages pr ON pr.id = m.reply_to LEFT JOIN people pp ON pp.id = pr.author_id
    WHERE m.application_id = $1 AND m.internal ORDER BY m.created_at`, [appId]);
  for (const m of posts) {
    m.isNew = m.author_id !== personId && (!seen || new Date(m.created_at) > new Date(seen.read_at));
    m.toMe = (m.notified || []).includes(personId);
  }
  return posts;
}

async function markRead(appId, personId) {
  await db.query(`INSERT INTO discussion_reads (application_id, person_id, read_at) VALUES ($1, $2, now())
    ON CONFLICT (application_id, person_id) DO UPDATE SET read_at = now()`, [appId, personId]);
}

/** Adds a post. `notify` holds the ids of the partners to email; only members of the team are kept. */
async function post(app, author, { body, replyTo, notify }) {
  const team = await teamOf(app.id);
  const ids = new Set(team.map((t) => t.id));
  const wanted = [...new Set([].concat(notify || []).map(String))].filter((id) => ids.has(id) && id !== author.id);
  const parent = replyTo ? await db.one('SELECT id FROM messages WHERE id = $1 AND application_id = $2 AND internal', [replyTo, app.id]).catch(() => null) : null;
  const m = await db.one(`INSERT INTO messages (application_id, author_id, body, internal, reply_to, notified) VALUES ($1,$2,$3,true,$4,$5) RETURNING *`,
    [app.id, author.id, body, parent ? parent.id : null, wanted]);
  await markRead(app.id, author.id);
  return { message: m, recipients: team.filter((t) => wanted.includes(t.id)) };
}

/**
 * SQL condition for the applications a staff member can see discussions on (alias `a` for applications),
 * with the person's id as parameter $1 and role as $2.
 */
const VISIBLE = `a.status <> 'draft' AND (NOT a.vetoed OR $2 = 'admin') AND (
    $2 <> 'reviewer' OR EXISTS (SELECT 1 FROM assignments x WHERE x.application_id = a.id AND x.reviewer_id = $1 AND (x.conflict IS NULL OR x.conflict = 'none')))`;

/** Count of discussion posts this person has not read yet, across the applications they can see. */
async function unreadTotal(person, staff) {
  if (!staff) return 0;
  const r = await db.one(`SELECT count(*)::int AS n FROM messages m JOIN applications a ON a.id = m.application_id
      LEFT JOIN discussion_reads dr ON dr.application_id = a.id AND dr.person_id = $1
    WHERE m.internal AND m.author_id IS DISTINCT FROM $1 AND ${VISIBLE}
      AND m.created_at > COALESCE(dr.read_at, $3::timestamptz, '-infinity')`, [person.id, staff, person.staff_since || null]);
  return r.n;
}

/** Unread counts per application id, for the applications list. */
async function unreadByApp(person, staff) {
  const rows = await db.many(`SELECT m.application_id, count(*)::int AS n FROM messages m JOIN applications a ON a.id = m.application_id
      LEFT JOIN discussion_reads dr ON dr.application_id = a.id AND dr.person_id = $1
    WHERE m.internal AND m.author_id IS DISTINCT FROM $1 AND ${VISIBLE}
      AND m.created_at > COALESCE(dr.read_at, $3::timestamptz, '-infinity')
    GROUP BY m.application_id`, [person.id, staff, person.staff_since || null]);
  return Object.fromEntries(rows.map((r) => [r.application_id, r.n]));
}

/** The discussions inbox: every application with partner posts, unread first, then most recent. */
async function inbox(person, staff) {
  return db.many(`SELECT a.id, a.ref, a.status, v.name AS venture_name, v.pillar,
      count(m.id)::int AS posts,
      count(m.id) FILTER (WHERE m.author_id IS DISTINCT FROM $1 AND m.created_at > COALESCE(dr.read_at, $3::timestamptz, '-infinity'))::int AS unread,
      bool_or($1 = ANY(m.notified) AND m.created_at > COALESCE(dr.read_at, '-infinity')) AS for_me,
      max(m.created_at) AS last_at,
      (SELECT json_build_object('body', l.body, 'author', lp.name) FROM messages l LEFT JOIN people lp ON lp.id = l.author_id
        WHERE l.application_id = a.id AND l.internal ORDER BY l.created_at DESC LIMIT 1) AS last
    FROM messages m JOIN applications a ON a.id = m.application_id JOIN ventures v ON v.id = a.venture_id
      LEFT JOIN discussion_reads dr ON dr.application_id = a.id AND dr.person_id = $1
    WHERE m.internal AND ${VISIBLE}
    GROUP BY a.id, v.name, v.pillar, dr.read_at
    ORDER BY (count(m.id) FILTER (WHERE m.author_id IS DISTINCT FROM $1 AND m.created_at > COALESCE(dr.read_at, $3::timestamptz, '-infinity')) > 0) DESC, max(m.created_at) DESC
    LIMIT 300`, [person.id, staff, person.staff_since || null]);
}

module.exports = { CORE_ROLES, canJoin, teamOf, postsOf, markRead, post, unreadTotal, unreadByApp, inbox };
