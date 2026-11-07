'use strict';
/* Email. Without SMTP settings, emails are written to the log (and kept in `outbox` for tests). */
const config = require('../config');

let transport = null;
const outbox = [];

function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Sends a plain message with a simple branded HTML version. `lines` is an array of paragraphs. */
async function send({ to, subject, lines, link, icalEvent }) {
  const text = [...lines, link ? `${link.label}: ${link.url}` : '', '', `${config.org.product} · ${config.org.name}`, config.org.address].filter((x) => x !== undefined).join('\n\n');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#14213d">
    <div style="padding:18px 0;border-bottom:3px solid #c8a14a"><b style="font-size:18px">VentureOS</b> <span style="color:#6b7280">· ScaleGate Africa</span></div>
    ${lines.map((l) => `<p style="line-height:1.55">${esc(l)}</p>`).join('')}
    ${link ? `<p><a href="${esc(link.url)}" style="display:inline-block;background:#14213d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(link.label)}</a></p>` : ''}
    <p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px">${esc(config.org.name)} · ${esc(config.org.address)}</p></div>`;
  const msg = { from: config.smtp.from, to, subject, text, html, ...(icalEvent ? { icalEvent: { filename: 'invite.ics', ...icalEvent } } : {}) };
  outbox.push(msg);
  if (outbox.length > 200) outbox.shift();
  const t = getTransport();
  if (!t) { console.log(`[mail] to ${to}: ${subject}\n${text}\n`); return; }
  try { await t.sendMail(msg); } catch (e) { console.error('[mail] failed:', e.message); }
}

module.exports = { send, outbox };
