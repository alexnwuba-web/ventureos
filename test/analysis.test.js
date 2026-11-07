'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { analyse, annualDebtService } = require('../src/domain/analysis');
const { total } = require('../src/domain/scoring');
const Q = require('../src/domain/questions');

test('debt service: annuity, moratorium and bullet', () => {
  // 12,000,000 at 0% over 12 months = 12,000,000 a year
  assert.equal(Math.round(annualDebtService({ principal: 12e6, rate: 0, tenor: 12, structure: 'monthly' })), 12e6);
  // 24% a year, 12 months: monthly payment 1,134,715.9 on 12m
  assert.equal(Math.round(annualDebtService({ principal: 12e6, rate: 0.24, tenor: 12, structure: 'monthly' }) / 12), 1134715);
  // Bullet: interest only
  assert.equal(annualDebtService({ principal: 10e6, rate: 0.2, tenor: 24, structure: 'bullet' }), 2e6);
  // A moratorium shortens the repayment period, raising the instalment
  assert.ok(annualDebtService({ principal: 10e6, rate: 0.2, tenor: 24, moratorium: 6, structure: 'monthly' }) > annualDebtService({ principal: 10e6, rate: 0.2, tenor: 24, structure: 'monthly' }));
});

test('equity: post-money, implied stake and mismatch', () => {
  const r = analyse({ kinds: ['equity'] }, { eq_amount: 100, eq_pre_money: 400, eq_offered: 25, val_methods: ['dcf'], val_workings: 'x'.repeat(150), val_comparables: [{ company: 'A' }],
    fin_history: [{ revenue: 100 }] });
  assert.equal(r.metrics.post_money, 500);
  assert.equal(r.metrics.implied_stake, 20);
  assert.ok(r.flags.some((f) => f.level === 'red' && /do not agree/.test(f.text)));
  assert.equal(r.metrics.revenue_multiple, 4);
});

test('debt: cover ratio, leverage, currency and security', () => {
  const r = analyse({ kinds: ['debt'] }, {
    loan_amount: 12e6, rate_expected: 0, tenor_months: 12, repayment_structure: 'monthly', loan_currency: 'NGN', revenue_currency: 'NGN',
    fin_history: [{ ebitda: 18e6 }], has_debt: 'no', collateral: [{ market_value: 10e6 }], credit_events: 'no',
  }, { collateral_haircut: 0.3 });
  assert.equal(r.metrics.dscr, 1.5);
  assert.equal(r.metrics.collateral_value, 7e6);
  assert.ok(r.flags.some((f) => /Security covers 58%/.test(f.text)));
  assert.ok(!r.flags.some((f) => f.area === 'Currency'));
});

test('scores total out of 100 and require every criterion', () => {
  assert.equal(total('residency', { problem: 5, ability: 5, commitment: 5, solution: 5, collaboration: 5, pan_african: 5 }), 100);
  assert.equal(total('residency', { problem: 5 }), null);
});

test('question keys are unique and every select has options', () => {
  for (const s of Q.SECTIONS) for (const f of s.fields) {
    if (['select', 'multiselect'].includes(f.type)) assert.ok(f.options && f.options.length, f.key);
    if (f.type === 'table') assert.ok(f.columns.length, f.key);
  }
  // Equity sees valuation; residency does not
  assert.ok(Q.sectionsFor(['equity']).some((s) => s.key === 'valuation'));
  assert.ok(!Q.sectionsFor(['residency']).some((s) => s.key === 'valuation'));
});
