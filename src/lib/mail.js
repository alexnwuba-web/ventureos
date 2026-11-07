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
  const text = [...lines, link ? `${link.label}: ${link.url}` : '', '', `${config.org.product} · ${config.org.name}`, config.org.address, `${config.scalegate.africa.host} · ${config.scalegate.europe.host}`].filter((x) => x !== undefined).join('\n\n');
  const html = `<div style="background:#f4eee4;padding:28px 12px"><div style="font-family:'Schibsted Grotesk','Segoe UI',Arial,sans-serif;max-width:560px;margin:auto;color:#15120f;background:#fbf8f3;border:1px solid #ddd2c1;border-radius:18px;padding:8px 28px 22px">
    <div style="padding:18px 0 14px;border-bottom:1px solid #ddd2c1"><span style="font-family:'Instrument Serif',Georgia,serif;font-size:26px">Venture<i style="color:#7d5f1c">OS</i></span> <span style="color:#6b6156;font-size:12px;letter-spacing:.08em;text-transform:uppercase">&nbsp;by ScaleGate Africa</span></div>
    ${lines.map((l) => `<p style="line-height:1.6;font-size:15px">${esc(l)}</p>`).join('')}
    ${link ? `<p style="margin:22px 0"><a href="${esc(link.url)}" style="display:inline-block;background:#c49a3c;color:#15120f;font-weight:600;padding:11px 20px;border-radius:999px;text-decoration:none">${esc(link.label)} &rarr;</a></p>` : ''}
    <p style="color:#6b6156;font-size:12px;border-top:1px solid #ddd2c1;padding-top:12px;margin-bottom:0">Make. Grow. Create. · ${esc(config.org.name)} · ${esc(config.org.address)}<br><a href="${esc(config.scalegate.africa.url)}" style="color:#7d5f1c">${esc(config.scalegate.africa.host)}</a> · <a href="${esc(config.scalegate.europe.url)}" style="color:#7d5f1c">${esc(config.scalegate.europe.host)}</a></p></div></div>`;
  const msg = { from: config.smtp.from, to, subject, text, html, ...(icalEvent ? { icalEvent: { filename: 'invite.ics', ...icalEvent } } : {}) };
  outbox.push(msg);
  if (outbox.length > 200) outbox.shift();
  const t = getTransport();
  if (!t) { console.log(`[mail] to ${to}: ${subject}\n${text}\n`); return; }
  try { await t.sendMail(msg); } catch (e) { console.error('[mail] failed:', e.message); }
}

module.exports = { send, outbox };
