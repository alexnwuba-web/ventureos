'use strict';
/*
 * Where an application stands. The founder edits it while it is a draft, or when we ask for more information.
 *
 *   draft → submitted → screening → review → (challenge task | due diligence) → interview → committee → decision
 *
 * A residency goes through a 1–2 week practical challenge; a funding request goes through due diligence.
 * At any stage before a decision staff can ask for more information (the founder edits and sends it back).
 */
const STATUSES = {
  draft: { label: 'Draft', founder: 'Not sent yet', tone: 'muted' },
  submitted: { label: 'Submitted', founder: 'Received — we will screen it shortly', tone: 'blue' },
  screening: { label: 'Screening', founder: 'Being screened', tone: 'blue' },
  info_requested: { label: 'Information requested', founder: 'We need more from you', tone: 'amber' },
  review: { label: 'Independent review', founder: 'With reviewers', tone: 'blue' },
  challenge: { label: 'Challenge task', founder: 'Practical challenge task', tone: 'violet' },
  due_diligence: { label: 'Due diligence', founder: 'Due diligence', tone: 'violet' },
  interview: { label: 'Interview', founder: 'Interview', tone: 'violet' },
  committee: { label: 'Committee', founder: 'With the selection committee', tone: 'violet' },
  accepted: { label: 'Accepted', founder: 'Accepted', tone: 'green', final: true },
  offer: { label: 'Offer / term sheet', founder: 'Offer made', tone: 'green', final: true },
  waitlisted: { label: 'Waitlisted', founder: 'Waitlisted', tone: 'amber', final: true },
  declined: { label: 'Declined', founder: 'Not successful this time', tone: 'red', final: true },
  withdrawn: { label: 'Withdrawn', founder: 'Withdrawn', tone: 'muted', final: true },
};

const NEXT = {
  draft: ['withdrawn'],
  submitted: ['screening', 'info_requested', 'declined'],
  screening: ['review', 'info_requested', 'declined'],
  info_requested: ['screening', 'declined'],
  review: ['challenge', 'due_diligence', 'interview', 'info_requested', 'declined', 'waitlisted'],
  challenge: ['interview', 'declined', 'waitlisted'],
  due_diligence: ['interview', 'committee', 'info_requested', 'declined'],
  interview: ['committee', 'declined', 'waitlisted'],
  committee: ['accepted', 'offer', 'waitlisted', 'declined'],
  waitlisted: ['committee', 'declined'],
  accepted: [], offer: ['accepted', 'declined'], declined: [], withdrawn: [],
};

const editable = (status) => status === 'draft' || status === 'info_requested';
const canMove = (from, to) => (NEXT[from] || []).includes(to);
/** Decisions are recorded by the committee or an admin. */
const isDecision = (to) => ['accepted', 'offer', 'waitlisted', 'declined'].includes(to);

module.exports = { STATUSES, NEXT, editable, canMove, isDecision };
