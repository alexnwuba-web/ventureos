'use strict';
/*
 * The first read of an application, worked out from its answers: the numbers an analyst would compute before a
 * meeting, and the flags that need a question. Flags are never a decision; they tell the reviewer where to look.
 *
 * Levels: red (must be resolved), amber (ask about it), info (worth noting).
 */

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[,\s₦$€£%]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const rows = (v) => (Array.isArray(v) ? v.filter((r) => r && Object.values(r).some((x) => x !== '' && x != null)) : []);
const sum = (list, key) => list.reduce((t, r) => t + (num(r[key]) || 0), 0);

/** Annual repayment for a loan: annuity over the repayment months, interest-only for bullet loans. */
function annualDebtService({ principal, rate, tenor, moratorium = 0, structure }) {
  if (!principal || !tenor) return null;
  const n = Math.max(1, tenor - (moratorium || 0));
  if (structure === 'bullet') return principal * rate;                      // interest each year; principal at the end
  if (structure === 'revenue_linked' || structure === 'self_liquidating') {   // judge it as if amortising over the term
    return rate ? (principal * (rate / 12) / (1 - Math.pow(1 + rate / 12, -n))) * 12 : (principal / n) * 12;
  }
  const r = rate / 12;
  const monthly = r ? principal * r / (1 - Math.pow(1 + r, -n)) : principal / n;
  return monthly * 12;
}

function analyse(app, answers, settings = {}) {
  const kinds = app.kinds || [];
  const flags = [];
  const metrics = {};
  const flag = (level, area, text) => flags.push({ level, area, text });

  const hist = rows(answers.fin_history);
  const last = hist[0] || {};
  const revenue = num(last.revenue) ?? num(answers.revenue_12m);
  const ebitda = num(last.ebitda);
  metrics.revenue_last = revenue;
  metrics.ebitda_last = ebitda;

  // ── Founders and ownership ──
  const founders = rows(answers.founders);
  const fullTime = founders.filter((f) => /^y/i.test(f.full_time || '')).length;
  if (founders.length && !fullTime) flag('amber', 'Team', 'No founder is full time on the venture.');
  if (founders.length === 1) flag('info', 'Team', 'A single founder: ask about key-person cover and who else can run it.');

  // ── Equity ──
  if (kinds.includes('equity')) {
    const amount = num(answers.eq_amount);
    const pre = num(answers.eq_pre_money);
    const offered = num(answers.eq_offered);
    if (amount && pre) {
      const post = pre + amount;
      metrics.post_money = post;
      metrics.implied_stake = (amount / post) * 100;
      if (offered != null && Math.abs(offered - metrics.implied_stake) > 1) {
        flag('red', 'Valuation', `The numbers do not agree: ${fmt(amount)} at a ${fmt(pre)} pre-money buys ${metrics.implied_stake.toFixed(1)}%, but ${offered}% is offered.`);
      }
      if (revenue) {
        metrics.revenue_multiple = pre / revenue;
        if (metrics.revenue_multiple > 15) flag('red', 'Valuation', `The pre-money is ${metrics.revenue_multiple.toFixed(1)}× last year's revenue. That needs strong comparables.`);
        else if (metrics.revenue_multiple > 6) flag('amber', 'Valuation', `The pre-money is ${metrics.revenue_multiple.toFixed(1)}× last year's revenue.`);
      } else {
        flag('amber', 'Valuation', 'A valuation with no revenue behind it: check what it rests on (assets, IP, contracts, comparables).');
      }
      if (ebitda && ebitda > 0) metrics.ebitda_multiple = pre / ebitda;
    }
    const methods = Array.isArray(answers.val_methods) ? answers.val_methods : [];
    if (!methods.length || (methods.length === 1 && methods[0] === 'estimate')) {
      flag('red', 'Valuation', 'No method behind the valuation — the founders\' estimate only. Ask for the basis before assessing anything else.');
    }
    if (String(answers.val_workings || '').trim().length < 120) flag('red', 'Valuation', 'The valuation workings are missing or too thin to check.');
    if (!rows(answers.val_comparables).length) flag('amber', 'Valuation', 'No comparable companies or deals given.');
    if (answers.val_by === 'founders' && answers.val_report !== 'yes') flag('info', 'Valuation', 'Set by the founders with no written report.');

    const prior = rows(answers.prior_rounds);
    const lastPost = prior.length ? num(prior[prior.length - 1].post_money) || num(prior[0].post_money) : null;
    if (lastPost && pre) {
      metrics.uplift_on_last_round = pre / lastPost;
      if (metrics.uplift_on_last_round > 3) flag('amber', 'Valuation', `The asking pre-money is ${metrics.uplift_on_last_round.toFixed(1)}× the last round's post-money. What changed?`);
      if (metrics.uplift_on_last_round < 1) flag('info', 'Valuation', 'A down round compared with the last raise.');
    }

    const cap = rows(answers.cap);
    if (cap.length) {
      const total = sum(cap, 'pct');
      metrics.cap_total = total;
      if (Math.abs(total - 100) > 1) flag('red', 'Ownership', `The cap table adds up to ${total.toFixed(1)}%, not 100%.`);
      const founderPct = cap.filter((r) => /founder/i.test(r.type || '')).reduce((t, r) => t + (num(r.pct) || 0), 0);
      metrics.founder_pct = founderPct;
      if (founderPct && metrics.implied_stake) {
        metrics.founder_pct_after = founderPct * (1 - metrics.implied_stake / 100);
        if (metrics.founder_pct_after < 50) flag('info', 'Ownership', `Founders would hold ${metrics.founder_pct_after.toFixed(1)}% after this round.`);
      }
    }
    if (String(answers.convertibles || '').trim()) flag('amber', 'Ownership', 'There are SAFEs, notes or share promises outside the cap table — get the fully diluted position.');
    if (answers.vesting === 'no') flag('info', 'Ownership', 'Founders\' shares do not vest.');

    const runway = num(answers.runway_after);
    if (runway != null && runway < 12) flag('amber', 'Use of funds', `Only ${runway} months of runway after this raise.`);
    if (answers.divestment === 'no') flag('info', 'Governance', 'The owners will not sell any existing shares to new investors.');
    if (answers.board_seat === 'no') flag('amber', 'Governance', 'No investor director will be accepted.');
  }

  // ── Use of funds (equity, debt, grant) ──
  const uof = rows(answers.uof);
  const requested = num(answers.eq_amount) || num(answers.loan_amount) || num(answers.grant_amount);
  if (uof.length && requested) {
    const total = sum(uof, 'amount');
    metrics.use_of_funds_total = total;
    if (Math.abs(total - requested) / requested > 0.02) flag('amber', 'Use of funds', `The use of funds adds up to ${fmt(total)}, against ${fmt(requested)} requested.`);
  }

  // ── Debt ──
  if (kinds.includes('debt')) {
    const principal = num(answers.loan_amount);
    const given = num(answers.rate_expected);
    const rate = (given != null ? given : Number(settings.debt_assumed_rate || 0.27) * 100) / 100;
    metrics.rate_used = rate * 100;
    metrics.rate_assumed = given == null;
    const tenor = num(answers.tenor_months);
    const newService = annualDebtService({ principal, rate, tenor, moratorium: num(answers.moratorium_months) || 0, structure: answers.repayment_structure });
    metrics.new_annual_service = newService;
    if (newService) metrics.new_monthly_service = newService / 12;

    const debts = answers.has_debt === 'yes' ? rows(answers.debts) : [];
    const existingService = sum(debts, 'monthly') * 12;
    const existingOutstanding = sum(debts, 'outstanding');
    metrics.existing_annual_service = existingService;
    metrics.existing_outstanding = existingOutstanding;
    const totalService = (newService || 0) + existingService;

    if (ebitda != null && totalService) {
      metrics.dscr = ebitda / totalService;
      const min = Number(settings.dscr_minimum || 1.25);
      if (metrics.dscr < 1) flag('red', 'Repayment', `EBITDA covers debt service only ${metrics.dscr.toFixed(2)}× — the business does not earn enough to repay from operations.`);
      else if (metrics.dscr < min) flag('amber', 'Repayment', `Debt service cover is ${metrics.dscr.toFixed(2)}×, below ${min}×.`);
    } else if (principal) {
      flag('amber', 'Repayment', 'No EBITDA given, so debt service cover cannot be worked out.');
    }
    if (ebitda && ebitda > 0 && principal) {
      metrics.leverage = (existingOutstanding + principal) / ebitda;
      const max = Number(settings.leverage_maximum || 3.5);
      if (metrics.leverage > max) flag('amber', 'Repayment', `Total debt would be ${metrics.leverage.toFixed(1)}× EBITDA (above ${max}×).`);
    } else if (ebitda != null && ebitda <= 0 && principal) {
      flag('red', 'Repayment', 'EBITDA is zero or negative: a loan would be repaid from something other than profits. Ask what.');
    }

    const inflow = num(answers.cash_in_monthly), outflow = num(answers.cash_out_monthly);
    if (inflow != null && outflow != null) {
      metrics.monthly_net_cash = inflow - outflow;
      if (metrics.new_monthly_service && metrics.monthly_net_cash < metrics.new_monthly_service) {
        flag('amber', 'Repayment', `Net monthly cash (${fmt(metrics.monthly_net_cash)}) is below the new monthly repayment (${fmt(metrics.new_monthly_service)}).`);
      }
    }

    if (answers.loan_currency && answers.revenue_currency && answers.loan_currency !== answers.revenue_currency) {
      flag('red', 'Currency', `The loan is in ${answers.loan_currency} but revenue is in ${answers.revenue_currency}: exchange-rate risk falls on repayment.`);
    }
    const conc = num(answers.top_customer_share);
    if (conc != null && conc > 40) flag('amber', 'Concentration', `${conc}% of revenue comes from one customer.`);

    const bad = debts.filter((d) => d.status && !/performing/i.test(d.status));
    if (bad.length) flag('red', 'Credit history', `${bad.length} existing facilit${bad.length > 1 ? 'ies are' : 'y is'} not performing (${bad.map((d) => d.lender || '—').join(', ')}).`);
    if (answers.credit_events === 'yes') flag('red', 'Credit history', 'A default, restructuring, write-off or recovery action in the last 5 years.');

    const coll = rows(answers.collateral);
    const haircut = Number(settings.collateral_haircut || 0.3);
    const cover = coll.reduce((t, c) => t + (num(c.forced_sale_value) ?? (num(c.market_value) || 0) * (1 - haircut)), 0);
    metrics.collateral_value = cover;
    if (principal) {
      metrics.collateral_cover = cover / principal;
      if (!coll.length) flag('amber', 'Security', 'No security offered.');
      else if (metrics.collateral_cover < 1) flag('amber', 'Security', `Security covers ${(metrics.collateral_cover * 100).toFixed(0)}% of the loan at forced-sale value.`);
    }
    if (coll.some((c) => /^y/i.test(c.charged || ''))) flag('red', 'Security', 'Some of the security is already pledged to another lender.');
    if (answers.loan_purpose === 'refinance') flag('info', 'Purpose', 'Refinancing: ask why the current lender will not extend.');
  }

  // ── Governance and compliance ──
  if (kinds.includes('equity') || kinds.includes('debt')) {
    if (answers.accounts === 'none') flag('red', 'Governance', 'No formal accounts are kept.');
    else if (answers.accounts === 'management') flag('amber', 'Governance', 'Accounts are not audited.');
    if (answers.owner_manager === 'founder_ceo' && !num(answers.independent_directors)) flag('amber', 'Governance', 'Owner runs the business and there is no independent director.');
    if (answers.reporting_ack === 'no') flag('red', 'Governance', 'Will not give funders regular management and audited accounts.');
    if (answers.tax_current === 'no') flag('amber', 'Compliance', 'Tax filings or payments are not up to date.');
    if (answers.pep === 'yes') flag('amber', 'Compliance', 'A politically exposed person is involved: enhanced due diligence applies.');
    if (answers.related_party === 'yes') flag('amber', 'Governance', 'Trades with founder-related companies.');
    if (answers.ip_owner === 'founders') flag('amber', 'IP', 'The IP is owned by the founders, not the company: it should be assigned before funding.');
  }
  if (answers.litigation === 'yes') flag('amber', 'Legal', 'A legal dispute is open.');

  // ── Residency ──
  if (kinds.includes('residency')) {
    if (answers.relocate === 'no') flag('red', 'Commitment', 'The lead founder will not relocate full time — the residency requires it.');
    if (answers.pillar === 'none') flag('amber', 'Fit', 'The venture does not sit in Make, Grow or Create. Software is admitted only when it serves a physical or creative problem.');
  }

  // ── Projections against history ──
  const proj = rows(answers.projections);
  if (proj.length && revenue) {
    const y3 = num((proj[2] || {}).revenue);
    if (y3) {
      metrics.cagr_3y = (Math.pow(y3 / revenue, 1 / 3) - 1) * 100;
      if (metrics.cagr_3y > 150) flag('amber', 'Projections', `Projected revenue grows ${metrics.cagr_3y.toFixed(0)}% a year for three years. Test the volume and price assumptions.`);
    }
  }

  const order = { red: 0, amber: 1, info: 2 };
  flags.sort((a, b) => order[a.level] - order[b.level]);
  return { metrics, flags, counts: { red: flags.filter((f) => f.level === 'red').length, amber: flags.filter((f) => f.level === 'amber').length } };
}

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-NG');
}

module.exports = { analyse, annualDebtService, num, fmt };
