'use strict';
/* Helpers available in every page. */
const Q = require('../domain/questions');
const W = require('../domain/workflow');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(n, cur = '') {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const s = Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}bn` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}m` : Math.round(v).toLocaleString('en-NG');
  return `${cur ? cur + ' ' : ''}${s}`;
}
const full = (n) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 }));
const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '—');
const status = (s) => W.STATUSES[s] || { label: s, tone: 'muted' };
const kindLabel = (k) => (Q.KINDS[k] ? Q.KINDS[k].short : k);
const pillarLabel = (p) => ({ make: 'Make', grow: 'Grow', create: 'Create' }[p] || '—');

/** An answer as readable text. */
function answerText(f, v) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
  if (f.type === 'check') return v ? 'Yes' : 'No';
  if (f.type === 'yesno') return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v;
  if (f.type === 'select') return Q.option(f, v);
  if (f.type === 'multiselect') return v.map((x) => Q.option(f, x)).join('; ');
  if (f.type === 'money') return full(v);
  if (f.type === 'percent') return `${v}%`;
  if (f.type === 'date') return date(v);
  return String(v);
}

module.exports = { esc, money, full, date, when, status, kindLabel, pillarLabel, answerText, KINDS: Q.KINDS, STATUSES: W.STATUSES };
