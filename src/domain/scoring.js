'use strict';
/*
 * Review rubrics. Each reviewer scores every criterion 0–5; the weighted total is out of 100. A residency uses the
 * selection criteria in the VentureOS Center planning document; funding requests use the rubric for their kind.
 */
const RUBRICS = {
  // ScaleGate triage, from the VentureOS Platform Implementation Plan (B4.4). Integrity is a veto, not a weight.
  triage: {
    label: 'ScaleGate triage',
    criteria: [
      { key: 'founder', label: 'Founder', weight: 30, guide: 'Commitment, ability and evidence of past building; note the evidence' },
      { key: 'problem_fit', label: 'Problem fit', weight: 20, guide: 'A real problem in one of ScaleGate\'s sectors (food, water, energy, health)' },
      { key: 'traction', label: 'Traction', weight: 20, guide: 'What exists and who uses or pays for it. A score above 3 needs the evidence noted in your comments' },
      { key: 'europe', label: 'European leverage', weight: 15, guide: 'Why Europe, specifically: buyers, partners, capital or the founder\'s relocation' },
      { key: 'scalability', label: 'Scalability', weight: 10, guide: 'Could grow well beyond where it is now' },
    ],
  },
  residency: {
    label: 'Residency selection',
    criteria: [
      { key: 'problem', label: 'Problem', weight: 25, guide: 'A real, significant African problem, understood from the user\'s side' },
      { key: 'ability', label: 'Ability', weight: 25, guide: 'Technical or creative skill; evidence of past building or making (Make: technical depth; Grow: farm or value-chain experience; Create: a portfolio)' },
      { key: 'commitment', label: 'Commitment', weight: 20, guide: 'Willing to relocate full time; persistence in past work' },
      { key: 'solution', label: 'Solution potential', weight: 15, guide: 'Plausible approach with a path to a business' },
      { key: 'collaboration', label: 'Collaboration', weight: 10, guide: 'Openness to cross-pillar work and community' },
      { key: 'pan_african', label: 'Pan-African reach', weight: 5, guide: 'Could work beyond one country' },
    ],
  },
  equity: {
    label: 'Equity investment',
    criteria: [
      { key: 'team', label: 'Team', weight: 20, guide: 'Track record, completeness, commitment' },
      { key: 'market', label: 'Problem and market', weight: 15, guide: 'Real need; market size shown with numbers' },
      { key: 'traction', label: 'Traction', weight: 15, guide: 'Evidence customers pay or will pay' },
      { key: 'valuation', label: 'Valuation basis', weight: 20, guide: 'A method, workings and comparables that hold up; a reasonable ask' },
      { key: 'governance', label: 'Governance and ownership readiness', weight: 15, guide: 'Board, audit, separation of owner and manager, willingness to accept conditions' },
      { key: 'use', label: 'Use of funds and milestones', weight: 10, guide: 'Spend tied to measurable milestones; runway' },
      { key: 'fit', label: 'Fit with ScaleGate', weight: 5, guide: 'Route to Europe; fit with our investors\' focus' },
    ],
  },
  debt: {
    label: 'Debt finance',
    criteria: [
      { key: 'capacity', label: 'Repayment capacity', weight: 30, guide: 'Debt service cover, cash flow, contracts that pay' },
      { key: 'security', label: 'Security and guarantees', weight: 20, guide: 'Cover at forced-sale value; clean title; guarantees' },
      { key: 'credit', label: 'Credit history', weight: 15, guide: 'Existing facilities performing; no defaults' },
      { key: 'management', label: 'Management and governance', weight: 15, guide: 'Accounts, reporting, board, competence' },
      { key: 'purpose', label: 'Purpose', weight: 10, guide: 'The loan funds something that produces the repayment' },
      { key: 'resilience', label: 'Resilience', weight: 10, guide: 'Customer concentration, currency match, sector risk' },
    ],
  },
  grant: {
    label: 'Grant or sponsorship',
    criteria: [
      { key: 'impact', label: 'Impact', weight: 30, guide: 'Measurable benefit to people or environment' },
      { key: 'feasibility', label: 'Feasibility', weight: 25, guide: 'Can this team deliver this plan?' },
      { key: 'team', label: 'Team', weight: 20, guide: 'Relevant experience' },
      { key: 'budget', label: 'Budget', weight: 15, guide: 'Realistic and tied to activities' },
      { key: 'sustain', label: 'Co-funding and sustainability', weight: 10, guide: 'Other money in; continues after the grant' },
    ],
  },
};

/** Weighted total out of 100 from scores 0–5; null until every criterion is scored. */
function total(rubricKey, scores) {
  const r = RUBRICS[rubricKey];
  if (!r) return null;
  let t = 0;
  for (const c of r.criteria) {
    const s = Number(scores && scores[c.key]);
    if (!Number.isFinite(s) || s < 0 || s > 5) return null;
    t += (s / 5) * c.weight;
  }
  return Math.round(t * 10) / 10;
}

/** Summary across submitted reviews of one rubric: average, spread, recommendations. */
function summarise(reviews) {
  const done = reviews.filter((r) => r.submitted_at && r.total != null);
  if (!done.length) return null;
  const totals = done.map((r) => Number(r.total));
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const spread = Math.max(...totals) - Math.min(...totals);
  return { count: done.length, average: Math.round(avg * 10) / 10, spread: Math.round(spread * 10) / 10, wide: spread > 20,
    recommendations: done.reduce((m, r) => { m[r.recommendation] = (m[r.recommendation] || 0) + 1; return m; }, {}) };
}

/** Which rubrics apply: triage always; then the residency rubric, and after the invitation the rubric for each request. */
const rubricsFor = (app) => ['triage', ...app.kinds.filter((k) => RUBRICS[k] && (k === 'residency' || app.stage === 2))];

module.exports = { RUBRICS, total, summarise, rubricsFor };
