'use strict';
/*
 * Sample data for trying VentureOS locally: an admin, a reviewer, Cohort 0 and three applications (a Make residency,
 * a Grow equity raise, and a Create residency + debt request). Refuses to run in production.
 *   VENTUREOS_DATABASE_URL=… node scripts/demo.js
 */
const config = require('../src/config');
if (config.prod) { console.error('Not in production.'); process.exit(1); }
const { db, end } = require('../src/db');
const { migrate } = require('../src/migrate');
const A = require('../src/domain/applications');

const set = (appId, values) => Promise.all(Object.entries(values).map(([k, v]) => db.query(
  `INSERT INTO answers (application_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (application_id, key) DO UPDATE SET value = EXCLUDED.value`, [appId, k, JSON.stringify(v)])));

(async () => {
  await migrate();
  const person = (email, name, role = null) => db.one(`INSERT INTO people (email, name, staff_role) VALUES ($1,$2,$3)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, staff_role = EXCLUDED.staff_role RETURNING *`, [email, name, role]);
  await person('alex@scalegate.org', 'Alexander Nwuba', 'admin');
  await person('reviewer@scalegate.org', 'Ngozi Reviewer', 'reviewer');
  await db.query(`INSERT INTO cohorts (name, opens_on, closes_on, starts_on, size_target, status) SELECT 'Cohort 0', '2027-02-01', '2027-04-30', '2027-07-01', 10, 'planned'
    WHERE NOT EXISTS (SELECT 1 FROM cohorts WHERE name = 'Cohort 0')`);

  const f1 = await person('chidi@example.ng', 'Chidi Okeke');
  const a1 = await A.create(f1, { kinds: ['residency'], ventureName: 'ClearBore Water' });
  await set(a1.id, { one_liner: 'Removes sulphur and gas from borehole water for homes and estates', registered: 'no', hq_country: 'Nigeria', hq_city: 'Enugu', stage: 'prototype',
    pillar: 'make', sector: 'Water treatment', founders: [{ name: 'Chidi Okeke', role: 'Founder', ownership: 100, full_time: 'Yes', years: 6 }], team_size: 2,
    track_record: 'Chemical engineer; built aeration units for 14 homes in Enugu.', key_gaps: 'Sales and manufacturing', problem: 'Borehole water smells of rotten eggs and stains fittings.',
    who_suffers: 'Households and estates on boreholes', alternatives: 'Bottled water, sachet water', solution: 'Aeration and catalytic filter unit', differentiation: 'Works without grid power',
    market_size: '200,000 private boreholes in Lagos and Enugu × ₦450,000 = ₦90bn', go_to_market: 'Plumbers and estate managers', proof_points: '14 prototype units installed',
    track: 'water', relocate: 'yes', residents: 1, earliest_start: '2027-07-01', residency_length: '9 months', video_link: 'https://youtu.be/example',
    technical_depth: 'Lab tests show H2S down from 4 mg/L to below 0.05 mg/L.', immersion_plan: 'Estates in Lekki and Ajah', build_plan: 'A certified, manufacturable unit',
    cross_pillar: 'Water for the food processing unit', tab_ack: true, ip_owner: 'founders', litigation: 'no', decl_true: true, decl_data: true, signatory: 'Chidi Okeke', signatory_role: 'Founder' });
  await db.query(`UPDATE applications SET status = 'submitted', submitted_at = now() - interval '3 days' WHERE id = $1`, [a1.id]);
  await db.query(`UPDATE ventures SET pillar = 'make', country = 'Nigeria' WHERE id = $1`, [a1.venture_id]);

  const f2 = await person('amaka@example.ng', 'Amaka Eze');
  const a2 = await A.create(f2, { kinds: ['equity'], ventureName: 'Zobo & Co' });
  await set(a2.id, { one_liner: 'Shelf-stable hibiscus and moringa teas for the diaspora', registered: 'yes', legal_name: 'Zobo and Co Limited', registration_country: 'Nigeria', rc_number: 'RC 1734002',
    hq_country: 'Nigeria', hq_city: 'Lagos', stage: 'early_revenue', pillar: 'grow', sector: 'Packaged food',
    founders: [{ name: 'Amaka Eze', role: 'CEO', ownership: 80, full_time: 'Yes', years: 9 }, { name: 'Bola Ade', role: 'Operations', ownership: 20, full_time: 'No', years: 4 }],
    eq_amount: 150000000, eq_currency: 'NGN', eq_instrument: 'ordinary', eq_pre_money: 1200000000, eq_offered: 15, val_methods: ['estimate'], val_by: 'founders',
    val_workings: 'Our brand and the size of the diaspora market justify the valuation; similar brands in the UK are valued highly and we expect to grow fast.',
    fin_currency: 'NGN', fin_history: [{ label: 'Last year', revenue: 60000000, ebitda: -5000000 }, { label: 'Year before', revenue: 22000000 }, { label: 'Two years before' }],
    cap: [{ holder: 'Amaka Eze', type: 'Founder', pct: 80 }, { holder: 'Bola Ade', type: 'Founder', pct: 20 }],
    uof: [{ item: 'NAFDAC and EU certification', amount: 25000000 }, { item: 'Packaging line', amount: 70000000 }, { item: 'UK distribution', amount: 40000000 }],
    runway_after: 10, accounts: 'management', owner_manager: 'founder_ceo', independent_directors: 0, board_seat: 'observer', divestment: 'no', ip_owner: 'company', reporting_ack: 'yes',
    projections: [{ label: 'Year 1', revenue: 150000000 }, { label: 'Year 2', revenue: 400000000 }, { label: 'Year 3', revenue: 1100000000 }, { label: 'Year 4' }, { label: 'Year 5' }] });
  await db.query(`UPDATE applications SET status = 'review', stage = 2, submitted_at = now() - interval '9 days', full_submitted_at = now() - interval '2 days' WHERE id = $1`, [a2.id]);
  await db.query(`UPDATE ventures SET pillar = 'grow', country = 'Nigeria' WHERE id = $1`, [a2.venture_id]);

  const f3 = await person('efe@example.gh', 'Efe Mensah');
  const a3 = await A.create(f3, { kinds: ['residency', 'debt'], ventureName: 'Kente Loom Studio' });
  await set(a3.id, { one_liner: 'Contemporary woven textiles for European interiors', registered: 'yes', hq_country: 'Ghana', hq_city: 'Accra', stage: 'growth', pillar: 'create', sector: 'Textiles',
    loan_amount: 40000000, loan_currency: 'USD', loan_purpose: 'asset', tenor_months: 24, repayment_structure: 'monthly', revenue_currency: 'GHS', top_customer_share: 62,
    fin_history: [{ label: 'Last year', revenue: 90000000, ebitda: 12000000 }], has_debt: 'yes', debts: [{ lender: 'GCB Bank', outstanding: 8000000, monthly: 600000, status: 'Performing' }],
    collateral: [{ type: 'Equipment', description: 'Looms', market_value: 25000000, charged: 'No' }], credit_events: 'no' });
  await db.query(`UPDATE applications SET status = 'submitted', submitted_at = now() - interval '1 day' WHERE id = $1`, [a3.id]);
  await db.query(`UPDATE ventures SET pillar = 'create', country = 'Ghana' WHERE id = $1`, [a3.venture_id]);

  console.log('Demo data ready. Sign in as alex@scalegate.org (the code is printed in the log when SMTP is not set).');
  await end();
})().catch((e) => { console.error(e); process.exit(1); });
