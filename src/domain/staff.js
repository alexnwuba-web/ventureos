'use strict';
/* Staff roles: what each one is for and what it may do. The staff console shows this table; the routes enforce it. */

const ROLES = {
  admin: { label: 'Administrator', summary: 'Runs everything: staff and roles, the front page, settings, the integrity veto.' },
  officer: { label: 'Officer', summary: 'Runs applications day to day: screening, meetings, follow-ups, document requests, reviewers and events.' },
  committee: { label: 'Committee', summary: 'Sees every application and records the decisions.' },
  reviewer: { label: 'Reviewer', summary: 'Scores only the applications assigned to them, after declaring any conflict.' },
  finance: { label: 'Finance', summary: 'Keeps the innovator tab: charges, repayments and statements.' },
};
const ORDER = ['admin', 'officer', 'committee', 'reviewer', 'finance'];
const OFFICES = ['Lagos', 'The Hague', 'Remote'];

// [what, roles allowed]
const MATRIX = [
  ['See all applications', ['admin', 'officer', 'committee', 'finance']],
  ['See only applications assigned to them', ['reviewer']],
  ['Score and review an assigned application', ['admin', 'officer', 'committee', 'reviewer']],
  ['Message founders', ['admin', 'officer', 'committee', 'finance']],
  ['Invite to meetings, set follow-ups, request documents', ['admin', 'officer', 'committee']],
  ['Move applications between stages', ['admin', 'officer']],
  ['Assign reviewers', ['admin', 'officer']],
  ['Record decisions (accept, offer, waitlist, decline)', ['admin', 'committee']],
  ['Create and run events', ['admin', 'officer']],
  ['Innovator tab entries', ['admin', 'finance']],
  ['Front page, cohorts and campuses', ['admin']],
  ['Staff and roles (this console)', ['admin']],
  ['Integrity veto', ['admin']],
];

const isRole = (r) => ORDER.includes(r);
const label = (r) => (ROLES[r] ? ROLES[r].label : r);

module.exports = { ROLES, ORDER, OFFICES, MATRIX, isRole, label };
