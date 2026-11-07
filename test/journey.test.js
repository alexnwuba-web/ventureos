'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, signIn, mail } = require('./helpers');

let app;
before(async () => { await reset(); app = createApp(); });
after(end);

const equityDebtAnswers = {
  venture: { venture_name: 'AquaPure', one_liner: 'Borehole water treatment for estates', registered: 'yes', legal_name: 'AquaPure Ltd', registration_country: 'Nigeria',
    rc_number: 'RC123', hq_country: 'Nigeria', hq_city: 'Lagos', year_started: '2021', stage: 'revenue', sg_sector: 'water', pillar: 'make', sector: 'Water' },
  team: { founders: [{ name: 'Ada Obi', role: 'CEO', email: 'ada@x.ng', ownership: '70', full_time: 'Yes', years: '8' }, { name: 'Tunde B', role: 'CTO', ownership: '30', full_time: 'Yes' }],
    team_size: '6', hours_per_week: '60', track_record: 'Built two water plants', key_gaps: 'Finance director' },
  problem: { problem: 'Sulphur gas in borehole water costs estates N2m a year in bottled water', who_suffers: 'Estate residents', alternatives: 'Bottled water', solution: 'Modular treatment',
    differentiation: 'Cheaper', market_size: '4,000 estates x N600k', go_to_market: 'Estate managers' },
  traction: { proof_points: '12 installs', revenue_12m: '48,000,000' },
  ambition: { five_years: 'In 500 estates', blocker: 'Working capital', help_needed: 'Equity and a lender' },
  development: { helpers: 'My uncle lent us N2m in 2021', prior_agreements: 'no', evidence: 'Lab reports from 12 installations, H2S below 0.05 mg/L', independent_test: 'yes' },
  funding_context: { raised_to_date: 'N10m from founders', programme: 'no', other_advisers: 'None', mandate: 'yes' },
  structure: { investee: 'AquaPure Ltd', group: 'None', agreements: [{ counterparty: 'Estate Co', what: 'Supply', signed: 'In draft' }] },
  trading: { monthly_sales: [{ month: 'Oct', invoiced: '4,000,000', paid: '2,000,000' }, { month: 'Sep', invoiced: '4,000,000', paid: '2,500,000' }],
    invoicing_entity: 'AquaPure Ltd', customers: [{ name: 'Estate Co', share: '55' }], capacity: 'Two installs a week', input_costs: 'Passed on quarterly' },
  equity_ask: { eq_amount: '100,000,000', eq_currency: 'NGN', eq_instrument: 'ordinary', eq_pre_money: '400,000,000', eq_offered: '25' },
  valuation: { val_today: 'Assets of N60m', val_year: 'Year 2', val_tranches: 'discuss', val_methods: ['estimate'], val_workings: 'We believe the company is worth this because the team is strong, the market is very large and we have already installed twelve units for estates in Lagos.', val_assumptions: 'Growth', val_by: 'founders', val_justify: 'Strong team', val_downside: 'Slow sales' },
  use_of_funds: { uof: [{ item: 'Units', amount: '60,000,000', when: 'M1' }, { item: 'Hiring', amount: '30,000,000', when: 'M3' }], milestones: '50 installs', runway_after: '9', next_round: 'Series A 2028' },
  cap_table: { cap: [{ holder: 'Ada', type: 'Founder', shares: '700', pct: '70' }, { holder: 'Tunde', type: 'Founder', shares: '300', pct: '30' }], sha_exists: 'no' },
  governance: { board: 'Two founders', independent_directors: '0', owner_manager: 'founder_ceo', accounts: 'management', reporting_ack: 'yes', board_seat: 'yes',
    divestment: 'minority', conditions: 'Audit', exit: 'Trade sale', dividends: 'From year 4', management: [{ role: 'CEO', name: 'Ada Obi', in_post: 'Yes' }] },
  financials: { fin_currency: 'NGN', fin_year_end: 'December', fin_history: [{ revenue: '40,000,000', ebitda: '8,000,000' }, {}, {}], cash_balance: '5,000,000', monthly_burn: '3,000,000',
    tax_current: 'yes', projections: [{ revenue: '80000000' }, { revenue: '150000000' }, { revenue: '300000000' }, {}, {}], projection_basis: 'Installs' },
  debt_request: { loan_amount: '50,000,000', loan_currency: 'USD', loan_purpose: 'asset', loan_purpose_detail: 'Trucks', tenor_months: '36', repayment_structure: 'monthly' },
  repayment: { repayment_source: 'Contracts', revenue_currency: 'NGN', top_customer_share: '55', cash_in_monthly: '4,000,000', cash_out_monthly: '3,000,000' },
  existing_debt: { has_debt: 'yes', debts: [{ lender: 'Bank A', outstanding: '10,000,000', monthly: '500,000', status: 'Late' }], credit_events: 'no', bureau_consent: 'on' },
  security: { collateral: [{ type: 'Equipment', market_value: '20,000,000', charged: 'No' }], personal_guarantee: 'Yes', board_approved: 'no' },
  legal: { ip_owner: 'founders', litigation: 'no', related_party: 'no', pep: 'no' },
  declaration: { decl_true: 'on', decl_data: 'on', signatory: 'Ada Obi', signatory_role: 'CEO' },
};

test('a founder applies for equity and debt, staff review it and the committee decides', async () => {
  const founder = await signIn(app, 'ada@example.ng', 'Ada Obi');
  const admin = await signIn(app, 'admin@scalegate.test', 'Alex Admin');
  const adminRow = await db.one(`SELECT * FROM people WHERE email = 'admin@scalegate.test'`);
  assert.equal(adminRow.staff_role, 'admin');

  // Start
  let r = await founder.post('/my/new').type('form').send({ venture_name: 'AquaPure', 'kinds[]': ['equity', 'debt'] }).expect(302);
  const ref = /\/my\/a\/(VOS-\d\d-\d{4})/.exec(r.headers.location)[1];
  await founder.get(`/my/a/${ref}`).expect(200);

  // Not ready yet
  r = await founder.get(`/my/a/${ref}/review`).expect(200);
  assert.match(r.text, /still missing/);
  await founder.post(`/my/a/${ref}/submit`).expect(400);

  // Part 1 — the initial submission: only Part 1 parts exist yet
  await founder.get(`/my/a/${ref}/s/cap_table`).expect(404);
  r = await founder.get(`/my/a/${ref}/documents`).expect(200);
  assert.doesNotMatch(r.text, /Business background questionnaire/);
  const part1 = ['venture', 'team', 'problem', 'traction', 'ambition', 'development', 'funding_context', 'equity_ask', 'valuation', 'use_of_funds', 'debt_request', 'repayment', 'existing_debt', 'legal', 'declaration'];
  for (const section of part1) await founder.post(`/my/a/${ref}/s/${section}`).type('form').send(toForm(equityDebtAnswers[section])).expect(302);
  let ans = Object.fromEntries((await db.many(`SELECT key, value FROM answers a JOIN applications x ON x.id = a.application_id WHERE x.ref = $1`, [ref])).map((x) => [x.key, x.value]));
  assert.equal(ans.eq_amount, 100000000, 'money is stored as a number');
  assert.deepEqual(ans.val_methods, ['estimate']);
  assert.equal(ans.val_assumptions, undefined, 'Part 2 questions are not saved in Part 1');
  assert.equal(ans.founders.length, 2);
  r = await founder.get(`/my/a/${ref}/review`).expect(200);
  assert.match(r.text, /Pitch deck/);
  for (const t of ['pitch_deck', 'business_plan', 'founder_cvs']) {
    await founder.post(`/my/a/${ref}/documents`).field('doc_type', t).attach('file', Buffer.from('%PDF-1.4 test'), `${t}.pdf`).expect(302);
  }
  await founder.post(`/my/a/${ref}/documents`).field('doc_type', 'other').attach('file', Buffer.from('MZ'), 'virus.exe').expect(400);
  r = await founder.get(`/my/a/${ref}/review`).expect(200);
  assert.match(r.text, /Everything required is in/);
  await founder.post(`/my/a/${ref}/submit`).expect(302);
  assert.equal((await db.one('SELECT status, stage FROM applications WHERE ref = $1', [ref])).status, 'submitted');
  assert.ok(mail.outbox.some((m) => m.to === 'admin@scalegate.test' && /New initial submission: AquaPure/.test(m.subject)));
  await founder.post(`/my/a/${ref}/s/venture`).type('form').send(toForm(equityDebtAnswers.venture)).expect(409);

  // Screening, then the invitation to Part 2
  r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /No method behind the valuation/, 'valuation is checked from the initial submission');
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'screening' }).expect(302);
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'full_requested', note: 'Strong initial case.' }).expect(302);
  assert.ok(mail.outbox.some((m) => m.to === 'ada@example.ng' && /would like to proceed/.test(m.text)));
  assert.equal((await db.one('SELECT stage FROM applications WHERE ref = $1', [ref])).stage, 2);

  // Part 2 — full documentation
  r = await founder.get(`/my/a/${ref}`).expect(200);
  assert.match(r.text, /we would like to proceed/);
  assert.match(r.text, />New</);
  for (const [section, a] of Object.entries(equityDebtAnswers)) {
    await founder.post(`/my/a/${ref}/s/${section}`).type('form').send(toForm(a)).expect(302);
  }
  ans = Object.fromEntries((await db.many(`SELECT key, value FROM answers a JOIN applications x ON x.id = a.application_id WHERE x.ref = $1`, [ref])).map((x) => [x.key, x.value]));
  assert.equal(ans.fin_history[0].label, 'Last year');
  assert.equal(ans.bureau_consent, true);
  assert.equal(ans.founders.length, 2, 'Part 1 answers are kept');
  r = await founder.get(`/my/a/${ref}/review`).expect(200);
  assert.match(r.text, /Bank statements/);
  assert.match(r.text, /Business background questionnaire/);
  r = await founder.get(`/my/a/${ref}/documents`).expect(200);
  assert.match(r.text, /VentureOS_Business_Background_Questionnaire.docx/);
  await founder.get('/static/templates/VentureOS_Business_Background_Questionnaire.docx').expect(200);
  for (const t of ['business_background', 'tax_returns', 'balance_sheet', 'sales_evidence', 'founder_ids', 'incorporation', 'memart', 'financial_model', 'financial_statements',
    'management_accounts', 'valuation_workings', 'bank_statements', 'tax_clearance', 'loan_letters']) {
    await founder.post(`/my/a/${ref}/documents`).field('doc_type', t).attach('file', Buffer.from('%PDF-1.4 test'), `${t}.pdf`).expect(302);
  }
  r = await founder.get(`/my/a/${ref}/review`).expect(200);
  assert.match(r.text, /Everything required is in/);
  await founder.post(`/my/a/${ref}/submit`).expect(302);
  assert.equal((await db.one('SELECT status FROM applications WHERE ref = $1', [ref])).status, 'full_submitted');

  // Staff: the first read flags the problems
  r = await admin.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /No method behind the valuation/);
  assert.match(r.text, /exchange-rate risk/);
  assert.match(r.text, /not performing/);
  assert.match(r.text, /55% of revenue comes from one customer/);
  assert.match(r.text, /owned by the founders, not the company/);
  assert.match(r.text, /Only 56% of invoiced sales were paid/);
  assert.match(r.text, /Key agreement not signed: Estate Co/);
  assert.match(r.text, /no claim on shares or IP/);
  assert.match(r.text, /signed engagement letter/);
  // The triage rubric applies, plus the equity and debt rubrics after the invitation
  assert.match(r.text, /ScaleGate triage/);

  // A reviewer cannot see it until assigned, then must declare conflicts before reading
  const rev = await signIn(app, 'rev@scalegate.test', 'Rita Reviewer');
  await admin.post('/staff/people').type('form').send({ email: 'rev@scalegate.test', role: 'reviewer' }).expect(302);
  await rev.get(`/staff/a/${ref}`).expect(403);
  const revRow = await db.one(`SELECT id FROM people WHERE email = 'rev@scalegate.test'`);
  await admin.post(`/staff/a/${ref}/assign`).type('form').send({ reviewer: revRow.id }).expect(302);
  r = await rev.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /Declare any conflict of interest/);
  assert.doesNotMatch(r.text, /First read/);
  await rev.post(`/staff/a/${ref}/review`).type('form').send({ rubric: 'equity' }).expect(403);
  await rev.post(`/staff/a/${ref}/conflict`).type('form').send({ none: 'yes' }).expect(302);
  r = await rev.get(`/staff/a/${ref}`).expect(200);
  assert.match(r.text, /First read/);

  // Reviewer can open documents now; a stranger cannot
  const doc = await db.one(`SELECT d.id FROM documents d JOIN applications a ON a.id = d.application_id WHERE a.ref = $1 LIMIT 1`, [ref]);
  await rev.get(`/files/${doc.id}`).expect(200);
  const stranger = await signIn(app, 'someone@else.ng', 'Some One');
  await stranger.get(`/files/${doc.id}`).expect(403);
  await stranger.get(`/my/a/${ref}`).expect(404);
  await stranger.get('/staff').expect(403);

  // Scoring: incomplete cannot be sent; complete gives a weighted total
  await rev.post(`/staff/a/${ref}/review`).type('form').send({ rubric: 'equity', send: 'yes', 'scores[team]': '4' }).expect(400);
  const scores = { team: 4, market: 3, traction: 3, valuation: 1, governance: 2, use: 3, fit: 4 };
  const form = { rubric: 'equity', send: 'yes', recommendation: 'hold', comments: 'Valuation has no basis' };
  for (const [k, v] of Object.entries(scores)) form[`scores[${k}]`] = String(v);
  await rev.post(`/staff/a/${ref}/review`).type('form').send(form).expect(302);
  const review = await db.one(`SELECT * FROM reviews WHERE rubric = 'equity'`);
  // (4×20 + 3×15 + 3×15 + 1×20 + 2×15 + 3×10 + 4×5) / 5 = 270 / 5 = 54
  assert.equal(review.total, 54);
  await rev.post(`/staff/a/${ref}/review`).type('form').send(form).expect(409);

  // Workflow: only allowed moves; info request reopens for the founder
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'accepted' }).expect(409);
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'info_requested' }).expect(400);
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'info_requested', note: 'Please send your valuation workings.' }).expect(302);
  r = await founder.get(`/my/a/${ref}`).expect(200);
  assert.match(r.text, /Please send your valuation workings/);
  await founder.post(`/my/a/${ref}/s/valuation`).type('form').send(toForm({ ...equityDebtAnswers.valuation, val_methods: ['multiple', 'comparables'],
    val_workings: 'Revenue N48m x 6x (median of 4 West African water utilities 2023-25, see comparables) = N288m; plus contracted backlog of N112m valued at 1x = N400m pre-money.' })).expect(302);
  await founder.post(`/my/a/${ref}/submit`).expect(302);
  assert.equal((await db.one('SELECT status FROM applications WHERE ref = $1', [ref])).status, 'full_submitted');

  for (const to of ['review', 'due_diligence', 'interview', 'committee']) await admin.post(`/staff/a/${ref}/status`).type('form').send({ to }).expect(302);
  // A reviewer cannot record decisions
  await rev.post(`/staff/a/${ref}/status`).type('form').send({ to: 'offer' }).expect(403);
  await admin.post(`/staff/a/${ref}/status`).type('form').send({ to: 'offer', note: 'Term sheet to follow.' }).expect(302);
  const final = await db.one('SELECT * FROM applications WHERE ref = $1', [ref]);
  assert.equal(final.status, 'offer');
  assert.ok(final.decided_at);
  const hist = await db.many(`SELECT action FROM audit WHERE application_id = $1`, [final.id]);
  assert.ok(hist.some((h) => h.action === 'document.opened'));
});

test('a residency application asks residency questions and the tab works', async () => {
  const f = await signIn(app, 'kemi@example.ng', 'Kemi');
  let r = await f.post('/my/new').type('form').send({ venture_name: 'Indigo Threads', 'kinds[]': 'residency' }).expect(302);
  const ref = /(VOS-\d\d-\d{4})/.exec(r.headers.location)[1];
  r = await f.get(`/my/a/${ref}`).expect(200);
  assert.match(r.text, /VentureOS Center residency/);
  assert.doesNotMatch(r.text, /Basis of the valuation/);
  await f.post(`/my/a/${ref}/s/venture`).type('form').send(toForm({ venture_name: 'Indigo Threads', pillar: 'create', registered: 'no' })).expect(302);
  r = await f.get(`/my/a/${ref}/s/residency`).expect(200);
  assert.match(r.text, /portfolio/);
  // Create founders must give a portfolio; Make founders' technical question is hidden
  const app2 = await db.one('SELECT * FROM applications WHERE ref = $1', [ref]);
  const Q = require('../src/domain/questions');
  const answers = { pillar: 'create' };
  const missing = Q.missing(app2.kinds, answers, 1).flatMap((s) => s.missing.map((m) => m.key));
  assert.ok(missing.includes('portfolio_link'));
  assert.ok(!missing.includes('technical_depth'));
  assert.ok(missing.includes('tab_ack'));

  // Tab: finance posts charges and a sponsorship credit
  const admin = await signIn(app, 'admin@scalegate.test');
  await admin.post(`/staff/tab/${app2.venture_id}`).type('form').send({ kind: 'housing', amount: '250,000', period: '2027-07' }).expect(302);
  await admin.post(`/staff/tab/${app2.venture_id}`).type('form').send({ kind: 'sponsorship', amount: '100000' }).expect(302);
  const bal = await db.one('SELECT sum(amount) AS b FROM tab_entries WHERE venture_id = $1', [app2.venture_id]);
  assert.equal(bal.b, 150000);
  r = await f.get(`/my/tab/${app2.venture_id}`).expect(200);
  assert.match(r.text, /150,000/);
});

test('sign-in codes: wrong codes, expiry of tries', async () => {
  const request = require('supertest');
  const a = request.agent(app);
  await a.post('/signin').type('form').send({ email: 'not-an-email' }).expect(400);
  await a.post('/signin').type('form').send({ email: 'x@y.ng' }).expect(302);
  for (let i = 0; i < 5; i++) await a.post('/signin/code').type('form').send({ email: 'x@y.ng', code: '000000' }).expect(400);
  const code = /(\d{6})/.exec(mail.outbox.filter((m) => m.to === 'x@y.ng').pop().subject)[1];
  const r = await a.post('/signin/code').type('form').send({ email: 'x@y.ng', code }).expect(400);
  assert.match(r.text, /Too many wrong tries/);
});

/** Turns a section's answers into form fields named a[key], a[key][0][col], a[key][]. */
function toForm(answers) {
  const out = {};
  for (const [k, v] of Object.entries(answers)) {
    if (Array.isArray(v) && typeof v[0] === 'object') v.forEach((row, i) => { for (const [c, cv] of Object.entries(row || {})) out[`a[${k}][${i}][${c}]`] = cv; });
    else if (Array.isArray(v)) out[`a[${k}][]`] = v;
    else out[`a[${k}]`] = v;
  }
  return out;
}
