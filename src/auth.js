'use strict';
/*
 * VentureOS's own sign-in: a person types their email, we send a six-digit code, they type it in. No passwords.
 * Codes last 10 minutes and allow 5 tries; at most 5 codes per email per hour. Sessions last 30 days.
 * People can also sign in with Google (when VENTUREOS_GOOGLE_CLIENT_ID and _SECRET are set): Google confirms the email,
 * and it signs in to the same account as that email's codes would.
 * Emails listed in VENTUREOS_ADMINS become administrators the first time they sign in.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { db } = require('./db');
const mail = require('./lib/mail');

const COOKIE = 'vos_session';
const DAYS = 30;

const hash = (email, code) => crypto.createHmac('sha256', config.sessionSecret).update(`${email}:${code}`).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

async function sendCode(emailRaw) {
  const email = normEmail(emailRaw);
  if (!validEmail(email)) throw Object.assign(new Error('Please enter a valid email address.'), { status: 400 });
  const recent = await db.one(`SELECT count(*)::int AS n FROM login_codes WHERE email = $1 AND created_at > now() - interval '1 hour'`, [email]);
  if (recent.n >= 5) throw Object.assign(new Error('Too many codes asked for this email. Please wait an hour and try again.'), { status: 429 });
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await db.query(`UPDATE login_codes SET used = true WHERE email = $1 AND NOT used`, [email]);
  await db.query(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1,$2, now() + interval '10 minutes')`, [email, hash(email, code)]);
  await mail.send({ to: email, subject: `${code} is your VentureOS sign-in code`,
    lines: [`Your sign-in code is ${code}.`, 'It works for 10 minutes. If you did not ask for it, you can ignore this email.'] });
  return { email, code };
}

/** Checks a code; returns the person (created on first sign-in) or throws. */
async function checkCode(emailRaw, codeRaw) {
  const email = normEmail(emailRaw);
  const code = String(codeRaw || '').replace(/\D/g, '');
  const row = await db.one(`SELECT * FROM login_codes WHERE email = $1 AND NOT used AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [email]);
  if (!row) throw Object.assign(new Error('That code has expired. Ask for a new one.'), { status: 400 });
  if (row.attempts >= 5) throw Object.assign(new Error('Too many wrong tries. Ask for a new code.'), { status: 400 });
  const want = Buffer.from(row.code_hash), got = Buffer.from(hash(email, code));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    await db.query('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw Object.assign(new Error('That code is not right. Check the latest email and try again.'), { status: 400 });
  }
  await db.query('UPDATE login_codes SET used = true WHERE id = $1', [row.id]);
  return personFor(email);
}

/** The account for a confirmed email address, created on first sign-in. A name from Google fills an empty name. */
async function personFor(email, name = '') {
  const admin = config.admins.includes(email);
  return db.one(`INSERT INTO people (email, name, staff_role, last_seen_at) VALUES ($1, $3, $2, now())
    ON CONFLICT (email) DO UPDATE SET last_seen_at = now(), staff_role = COALESCE(people.staff_role, EXCLUDED.staff_role),
      name = CASE WHEN people.name = '' THEN EXCLUDED.name ELSE people.name END RETURNING *`,
  [email, admin ? 'admin' : null, String(name || '').trim().slice(0, 200)]);
}

// ── Sign in with Google (OpenID Connect, authorization-code flow) ──
const google = {
  enabled: () => !!(config.google.clientId && config.google.clientSecret),
  redirectUri: () => `${config.baseUrl}/signin/google/callback`,
  fetch: (...a) => fetch(...a), // replaced in tests
  /** Where to send the person to sign in with Google. */
  url(state) {
    const q = new URLSearchParams({ client_id: config.google.clientId, redirect_uri: google.redirectUri(), response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  /** Exchanges Google's code for the person's confirmed email and name. */
  async profile(code) {
    const t = await google.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: google.redirectUri(), grant_type: 'authorization_code' }) });
    const tok = await t.json().catch(() => ({}));
    if (!t.ok || !tok.access_token) throw Object.assign(new Error('Google did not complete the sign-in. Please try again, or use an email code.'), { status: 400 });
    const u = await google.fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
    const info = await u.json().catch(() => ({}));
    const email = normEmail(info.email);
    if (!u.ok || !validEmail(email) || info.email_verified === false || info.email_verified === 'false') {
      throw Object.assign(new Error('Google could not confirm your email address. Please use an email code instead.'), { status: 400 });
    }
    return { email, name: info.name || [info.given_name, info.family_name].filter(Boolean).join(' ') };
  },
};

async function startSession(res, personId) {
  const s = await db.one(`INSERT INTO sessions (person_id, expires_at) VALUES ($1, now() + make_interval(days => $2)) RETURNING id`, [personId, DAYS]);
  res.cookie(COOKIE, jwt.sign({ sid: s.id }, config.sessionSecret, { expiresIn: `${DAYS}d` }),
    { httpOnly: true, sameSite: 'lax', secure: config.prod, path: '/', maxAge: DAYS * 864e5 });
}

async function endSession(req, res) {
  if (req.sid) await db.query('DELETE FROM sessions WHERE id = $1', [req.sid]);
  res.clearCookie(COOKIE, { path: '/' });
}

async function load(req, res, next) {
  req.person = null;
  const raw = req.cookies && req.cookies[COOKIE];
  if (raw) {
    try {
      const { sid } = jwt.verify(raw, config.sessionSecret);
      const p = await db.one('SELECT p.*, s.id AS sid FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.id = $1 AND s.expires_at > now()', [sid]);
      if (p) { req.sid = p.sid; delete p.sid; req.person = p; }
    } catch { /* stale cookie */ }
  }
  req.staff = req.person && req.person.staff_role && req.person.staff_active !== false ? req.person.staff_role : null;
  res.locals.person = req.person;
  res.locals.staff = req.staff;
  next();
}

function requirePerson(req, res, next) {
  if (req.person) return next();
  return res.redirect('/signin?next=' + encodeURIComponent(req.originalUrl));
}
/** requireStaff() for any staff; requireStaff('admin','committee') for those roles. */
const requireStaff = (...roles) => (req, res, next) => {
  if (!req.person) return res.redirect('/signin?next=' + encodeURIComponent(req.originalUrl));
  if (req.staff && (!roles.length || roles.includes(req.staff))) return next();
  return next(Object.assign(new Error('This page is for ScaleGate Africa staff.'), { status: 403 }));
};

module.exports = { COOKIE, sendCode, checkCode, personFor, google, startSession, endSession, load, requirePerson, requireStaff, normEmail, validEmail };
