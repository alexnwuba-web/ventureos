'use strict';
/*
 * The question bank. An application asks for one or more of:
 *   residency — a place in a VentureOS Center cohort (live-work-build, Lagos)
 *   equity    — investment for shares (or a SAFE / convertible note)
 *   debt      — a loan or trade/asset finance
 *   grant     — a grant or sponsorship
 *
 * Each section says which kinds it applies to (`for`). Each field can be required for every kind the section
 * applies to (`required: true`) or only some (`required: ['equity','debt']`), and can depend on another answer
 * (`showIf: { key, in: [...] }`). Answers are stored by field key, so keys must stay unique and stable.
 *
 * Field types: text, textarea, number, money, percent, date, url, email, select, multiselect, yesno, check, table.
 * A table has `columns` (each { key, label, type }) and `rows` (how many blank rows to offer).
 */

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'XOF', 'ZAR'];

const COUNTRIES = ['Nigeria', 'Ghana', 'Côte d\'Ivoire', 'Senegal', 'Benin', 'Togo', 'Sierra Leone', 'Liberia', 'The Gambia', 'Guinea',
  'Burkina Faso', 'Mali', 'Niger', 'Cameroon', 'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Ethiopia', 'South Africa', 'Egypt', 'Morocco',
  'Netherlands', 'United Kingdom', 'United States', 'Other'];

const TRACKS = [
  { value: 'water', label: 'Make — Water (air-to-water, borehole and brown-water treatment)' },
  { value: 'energy', label: 'Make — Energy (solar for heat, storage, waste-to-power)' },
  { value: 'petroleum', label: 'Make — Petroleum, refining and petrochemicals (bench scale)' },
  { value: 'waste', label: 'Make — Waste-to-value and recycling' },
  { value: 'cooling', label: 'Make — Cooling and built environment' },
  { value: 'diagnostics', label: 'Make — Health diagnostics and test kits' },
  { value: 'production', label: 'Grow — Production and natural/organic farming' },
  { value: 'processing', label: 'Grow — Processing, drying and milling' },
  { value: 'cold_chain', label: 'Grow — Storage and solar cold chain' },
  { value: 'agro_inputs', label: 'Grow — Agro-inputs, soil and seed testing' },
  { value: 'food_export', label: 'Grow — Packaged Nigerian food for export' },
  { value: 'packaging', label: 'Grow — Packaging (food-grade, natural farm crates)' },
  { value: 'fashion', label: 'Create — Fashion and textiles' },
  { value: 'music', label: 'Create — Music' },
  { value: 'art', label: 'Create — Art' },
  { value: 'authorship', label: 'Create — Authorship and publishing' },
  { value: 'theatre', label: 'Create — Theatre, stage and screen production' },
  { value: 'media', label: 'Create — Media and design' },
  { value: 'tourism', label: 'Create — Tourism, heritage and hospitality' },
  { value: 'ornithology', label: 'Across pillars — Ornithology and biodiversity' },
];

const FACILITIES = ['Maker lab (3D printers, laser cutter, CNC, electronics)', 'Water, chemistry and fuels lab', 'Energy test bay',
  'Cold-storage development yard', 'Pilot food-processing unit and food-testing lab', 'Packaging studio', 'Music studio',
  'Photo and video studio', 'Fashion atelier', 'Art studio', 'Writers\' room', 'Black-box theatre / event hall', 'Greenhouse / hydroponics'];

const SECTIONS = [
  // ───────────────────────────── Every application ─────────────────────────────
  {
    key: 'venture', title: 'The venture', for: ['all'],
    intro: 'Who you are as a business. If you have not registered a company yet, say so — that is fine for a residency.',
    fields: [
      { key: 'venture_name', label: 'Venture or brand name', type: 'text', required: true },
      { key: 'one_liner', label: 'What the venture does, in one sentence', type: 'text', required: true, max: 200 },
      { key: 'registered', label: 'Is the venture a registered company?', type: 'yesno', required: true },
      { key: 'legal_name', label: 'Registered company name', type: 'text', showIf: { key: 'registered', in: ['yes'] }, required: ['equity', 'debt'] },
      { key: 'registration_country', label: 'Country of registration', type: 'select', options: COUNTRIES, showIf: { key: 'registered', in: ['yes'] }, required: ['equity', 'debt'] },
      { key: 'rc_number', label: 'Registration number (e.g. CAC RC number)', type: 'text', showIf: { key: 'registered', in: ['yes'] }, required: ['equity', 'debt'] },
      { key: 'date_incorporated', label: 'Date of incorporation', type: 'date', showIf: { key: 'registered', in: ['yes'] } },
      { key: 'hq_country', label: 'Country where you operate now', type: 'select', options: COUNTRIES, required: true },
      { key: 'hq_city', label: 'City', type: 'text', required: true },
      { key: 'website', label: 'Website or social page', type: 'url' },
      { key: 'stage', label: 'Stage', type: 'select', required: true, options: [
        { value: 'idea', label: 'Idea — not built yet' }, { value: 'prototype', label: 'Prototype or first body of work' },
        { value: 'pilot', label: 'Pilot with a real user or partner' }, { value: 'early_revenue', label: 'Early revenue' },
        { value: 'growth', label: 'Growing revenue' }, { value: 'established', label: 'Established business (3+ years trading)' }] },
      { key: 'pillar', label: 'Pillar', type: 'select', required: ['residency'], options: [
        { value: 'make', label: 'Make — water, energy, petroleum and petrochemicals, waste, cooling, diagnostics' },
        { value: 'grow', label: 'Grow — agriculture, food processing, packaging and export' },
        { value: 'create', label: 'Create — fashion, music, art, authorship, theatre, media, tourism' },
        { value: 'none', label: 'None of these' }] },
      { key: 'sector', label: 'Sector, in your own words', type: 'text', required: true },
    ],
  },
  {
    key: 'team', title: 'Founders and team', for: ['all'],
    intro: 'List every founder and anyone who owns part of the business. Investors and lenders back people first.',
    fields: [
      { key: 'founders', label: 'Founders', type: 'table', required: true, rows: 4, columns: [
        { key: 'name', label: 'Full name' }, { key: 'role', label: 'Role' }, { key: 'email', label: 'Email' },
        { key: 'ownership', label: 'Ownership %', type: 'percent' }, { key: 'full_time', label: 'Full time?', type: 'select', options: ['Yes', 'No'] },
        { key: 'years', label: 'Years of relevant experience', type: 'number' }] },
      { key: 'team_size', label: 'People working in the venture now (including founders)', type: 'number', required: true },
      { key: 'track_record', label: 'What have the founders built, made or run before? Give evidence — products, sales, exits, portfolios, publications.', type: 'textarea', required: true },
      { key: 'key_gaps', label: 'Which skills is the team missing, and how will you fill them?', type: 'textarea', required: true },
      { key: 'advisers', label: 'Advisers or mentors already involved', type: 'textarea' },
    ],
  },
  {
    key: 'problem', title: 'Problem, solution and market', for: ['all'],
    fields: [
      { key: 'problem', label: 'What problem do you solve? Describe it from the user\'s side.', type: 'textarea', required: true },
      { key: 'who_suffers', label: 'Who has this problem, and how many of them are there?', type: 'textarea', required: true },
      { key: 'alternatives', label: 'What do they do about it today?', type: 'textarea', required: true },
      { key: 'solution', label: 'Your solution, and how it works', type: 'textarea', required: true },
      { key: 'differentiation', label: 'Why is yours better, cheaper or more workable in African conditions?', type: 'textarea', required: true },
      { key: 'market_size', label: 'How big is the market you can realistically reach in 3 years? Show how you calculated it.', type: 'textarea', required: true,
        help: 'Numbers, not adjectives: e.g. "4,000 boreholes in Lagos estates × ₦600,000 per treatment unit = ₦2.4bn".' },
      { key: 'go_to_market', label: 'How will you reach and sell to customers?', type: 'textarea', required: true },
      { key: 'competitors', label: 'Competitors', type: 'table', rows: 3, columns: [
        { key: 'name', label: 'Competitor' }, { key: 'what', label: 'What they offer' }, { key: 'difference', label: 'How you differ' }] },
      { key: 'pan_african', label: 'Could this work beyond one country? Where next, and why?', type: 'textarea' },
    ],
  },
  {
    key: 'traction', title: 'Traction and evidence', for: ['all'],
    fields: [
      { key: 'proof_points', label: 'What evidence shows people want this? (users, pilots, pre-orders, letters of intent, sales, awards)', type: 'textarea', required: true },
      { key: 'customers_count', label: 'Paying customers to date', type: 'number' },
      { key: 'revenue_12m', label: 'Revenue in the last 12 months', type: 'money' },
      { key: 'growth_rate', label: 'Revenue growth over the last 12 months', type: 'percent' },
      { key: 'partners', label: 'Partners, offtakers or institutions already working with you', type: 'textarea' },
    ],
  },

  // ───────────────────────────── Residency (VentureOS Center) ─────────────────────────────
  {
    key: 'residency', title: 'VentureOS Center residency', for: ['residency'],
    intro: 'A 6–12 month live-work-build residency in Lagos: problem immersion, prototype, pilot, then scale and the route to Europe through ScaleGate in The Hague.',
    fields: [
      { key: 'track', label: 'Challenge track', type: 'select', options: TRACKS, required: true },
      { key: 'relocate', label: 'Will you (the lead founder) relocate to Lagos full time for the residency?', type: 'yesno', required: true },
      { key: 'residents', label: 'How many of your team would live on campus?', type: 'number', required: true },
      { key: 'earliest_start', label: 'Earliest date you can start', type: 'date', required: true },
      { key: 'residency_length', label: 'Residency length you need', type: 'select', options: ['6 months', '9 months', '12 months'], required: true },
      { key: 'video_link', label: 'Link to a 2-minute video of you explaining the problem and what you will build', type: 'url', required: true,
        help: 'YouTube (unlisted is fine), Google Drive or similar.' },
      { key: 'technical_depth', label: 'Make: what technical work have you done on this? (designs, tests, lab results, patents)', type: 'textarea',
        showIf: { key: 'pillar', in: ['make'] }, required: ['residency'] },
      { key: 'value_chain', label: 'Grow: what is your real farm or value-chain experience? (crops, volumes, buyers, farms)', type: 'textarea',
        showIf: { key: 'pillar', in: ['grow'] }, required: ['residency'] },
      { key: 'portfolio_link', label: 'Create: link to your portfolio (collections, recordings, writing, productions)', type: 'url',
        showIf: { key: 'pillar', in: ['create'] }, required: ['residency'] },
      { key: 'immersion_plan', label: 'Where would you do problem immersion — which communities, sites, farms or markets — and who are the real users?', type: 'textarea', required: true },
      { key: 'build_plan', label: 'What will exist at the end of the residency that does not exist today?', type: 'textarea', required: true },
      { key: 'facilities', label: 'Facilities you would need', type: 'multiselect', options: FACILITIES },
      { key: 'cross_pillar', label: 'How could you work with ventures in the other pillars? (e.g. a fashion founder using natural dyes from a Grow venture)', type: 'textarea', required: true },
      { key: 'study', label: 'Would you like to combine the residency with part-time study or a research affiliation?', type: 'yesno' },
      { key: 'sponsor', label: 'Do you have a sponsor, scholarship or employer who would pay part of your residence costs? Who?', type: 'textarea' },
      { key: 'upside_preference', label: 'Grow ventures choose how the center shares in success after the tab is cleared', type: 'select',
        showIf: { key: 'pillar', in: ['grow'] }, options: [{ value: 'equity', label: 'Equity (3–5%)' }, { value: 'royalty', label: 'Royalty (2–3% of net revenue, up to 5 years)' }, { value: 'undecided', label: 'Decide at admission' }] },
      { key: 'tab_ack', label: 'I understand the innovator tab: housing, meals, workspace, studio time and venture services accrue to the venture company (not to me personally), and are repaid at 10–15% of net revenue once revenue passes an agreed threshold; any balance with no qualifying revenue within 3 years of completion is forgiven. Founders keep their IP.', type: 'check', required: true },
    ],
  },

  // ───────────────────────────── Equity ─────────────────────────────
  {
    key: 'equity_ask', title: 'The raise', for: ['equity'],
    fields: [
      { key: 'eq_amount', label: 'Amount you are raising', type: 'money', required: true },
      { key: 'eq_currency', label: 'Currency', type: 'select', options: CURRENCIES, required: true },
      { key: 'eq_instrument', label: 'Instrument', type: 'select', required: true, options: [
        { value: 'ordinary', label: 'Ordinary shares' }, { value: 'preference', label: 'Preference shares' },
        { value: 'safe', label: 'SAFE (simple agreement for future equity)' }, { value: 'note', label: 'Convertible note' }, { value: 'open', label: 'Open to proposals' }] },
      { key: 'eq_pre_money', label: 'Pre-money valuation you are asking for', type: 'money', required: true,
        help: 'The value of the company before the new money goes in. For a SAFE or note, give the valuation cap.' },
      { key: 'eq_offered', label: 'Share of the company offered for this amount', type: 'percent', required: true },
      { key: 'eq_discount', label: 'Discount to the next round (SAFE or note only)', type: 'percent', showIf: { key: 'eq_instrument', in: ['safe', 'note'] } },
      { key: 'eq_committed', label: 'Amount already committed by others in this round', type: 'money' },
      { key: 'eq_lead', label: 'Lead investor, if any', type: 'text' },
      { key: 'eq_close', label: 'When do you need to close?', type: 'date' },
    ],
  },
  {
    key: 'valuation', title: 'Basis of the valuation', for: ['equity'],
    intro: 'A valuation without a basis cannot be assessed. Show how you arrived at the number, what it rests on, and what would make it lower.',
    fields: [
      { key: 'val_methods', label: 'Methods you used', type: 'multiselect', required: true, options: [
        { value: 'multiple', label: 'Revenue or earnings multiple' }, { value: 'comparables', label: 'Comparable transactions' },
        { value: 'dcf', label: 'Discounted cash flow' }, { value: 'last_round', label: 'Price of our last round' },
        { value: 'assets', label: 'Net assets or replacement cost' }, { value: 'scorecard', label: 'Scorecard / Berkus (pre-revenue)' },
        { value: 'estimate', label: 'Founders\' estimate — no formal method' }] },
      { key: 'val_workings', label: 'Show the calculation: the figures, multiples or discount rate you used, and where each one came from', type: 'textarea', required: true, minLength: 120 },
      { key: 'val_comparables', label: 'Comparable companies or deals', type: 'table', rows: 4, columns: [
        { key: 'company', label: 'Company' }, { key: 'country', label: 'Country' }, { key: 'year', label: 'Year' },
        { key: 'valuation', label: 'Valuation', type: 'money' }, { key: 'multiple', label: 'Multiple (e.g. 3× revenue)' }, { key: 'source', label: 'Source' }] },
      { key: 'val_assumptions', label: 'The key assumptions the valuation depends on', type: 'textarea', required: true },
      { key: 'val_by', label: 'Who set the valuation?', type: 'select', required: true, options: [
        { value: 'founders', label: 'The founders' }, { value: 'adviser', label: 'An independent adviser or valuer' }, { value: 'investor', label: 'A previous or lead investor' }] },
      { key: 'val_report', label: 'Is there a written valuation report?', type: 'yesno' },
      { key: 'val_justify', label: 'Why should an investor accept this valuation rather than a lower one?', type: 'textarea', required: true },
      { key: 'val_downside', label: 'What would make the company worth less? Give your downside case.', type: 'textarea', required: true },
    ],
  },
  {
    key: 'use_of_funds', title: 'Use of funds and milestones', for: ['equity', 'debt', 'grant'],
    fields: [
      { key: 'uof', label: 'How the money will be spent (should add up to the amount requested)', type: 'table', required: true, rows: 6, columns: [
        { key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'when', label: 'When (month)' }] },
      { key: 'milestones', label: 'What will the money achieve, and by when? (milestones you can be measured against)', type: 'textarea', required: true },
      { key: 'runway_after', label: 'Months of runway after this money (equity and grants)', type: 'number', required: ['equity'] },
      { key: 'next_round', label: 'What happens next — next raise, break-even, or self-funding — and when?', type: 'textarea', required: ['equity'] },
    ],
  },
  {
    key: 'cap_table', title: 'Ownership (cap table)', for: ['equity'],
    fields: [
      { key: 'cap', label: 'Current shareholders, before this round (should add up to 100%)', type: 'table', required: true, rows: 6, columns: [
        { key: 'holder', label: 'Shareholder' }, { key: 'type', label: 'Type', type: 'select', options: ['Founder', 'Investor', 'Employee pool', 'Other'] },
        { key: 'shares', label: 'Shares', type: 'number' }, { key: 'pct', label: '%', type: 'percent' }] },
      { key: 'prior_rounds', label: 'Previous funding rounds', type: 'table', rows: 3, columns: [
        { key: 'date', label: 'Date' }, { key: 'instrument', label: 'Instrument' }, { key: 'amount', label: 'Amount', type: 'money' },
        { key: 'post_money', label: 'Post-money valuation', type: 'money' }, { key: 'investors', label: 'Investors' }] },
      { key: 'convertibles', label: 'Outstanding SAFEs, notes, options or promises of shares not shown above', type: 'textarea' },
      { key: 'esop', label: 'Employee share pool, if any', type: 'percent' },
      { key: 'vesting', label: 'Do founders\' shares vest over time?', type: 'yesno' },
      { key: 'sha_exists', label: 'Is there a shareholders\' agreement in place?', type: 'yesno', required: true },
    ],
  },
  {
    key: 'governance', title: 'Governance, ownership and investor rights', for: ['equity', 'debt'],
    intro: 'Capital follows governance. These answers tell us how the business is run and what conditions you would accept.',
    fields: [
      { key: 'board', label: 'Who sits on the board, and how often does it meet?', type: 'textarea', required: true },
      { key: 'independent_directors', label: 'Number of independent (non-owner, non-staff) directors', type: 'number', required: ['equity'] },
      { key: 'owner_manager', label: 'Who runs the business day to day?', type: 'select', required: true, options: [
        { value: 'founder_ceo', label: 'The founder-owner is also the chief executive' },
        { value: 'professional', label: 'A professional chief executive who is not the main owner' },
        { value: 'planned', label: 'We plan to appoint professional management' }] },
      { key: 'accounts', label: 'Your most recent accounts are', type: 'select', required: true, options: [
        { value: 'audited', label: 'Audited by an external auditor' }, { value: 'management', label: 'Management accounts only' }, { value: 'none', label: 'We do not keep formal accounts yet' }] },
      { key: 'auditor', label: 'Auditor', type: 'text', showIf: { key: 'accounts', in: ['audited'] } },
      { key: 'reporting_ack', label: 'Would you give investors or lenders monthly management accounts and audited annual accounts?', type: 'yesno', required: true },
      { key: 'board_seat', label: 'Would you accept an investor director on the board?', type: 'select', required: ['equity'], options: [
        { value: 'yes', label: 'Yes' }, { value: 'observer', label: 'An observer seat only' }, { value: 'no', label: 'No' }] },
      { key: 'divestment', label: 'Would the existing owners sell part of their shares to new investors (a private placement), not only issue new shares?', type: 'select', required: ['equity'], options: [
        { value: 'yes', label: 'Yes' }, { value: 'minority', label: 'Yes, a minority stake only' }, { value: 'no', label: 'No' }] },
      { key: 'listing', label: 'Would you list the company on a stock exchange within 5–7 years?', type: 'select', options: [
        { value: 'yes', label: 'Yes, that is the plan' }, { value: 'maybe', label: 'Possibly' }, { value: 'no', label: 'No' }] },
      { key: 'conditions', label: 'Which governance conditions would you accept as a condition of the money? (e.g. independent directors, audit, a finance director, a budget approved by the board)', type: 'textarea', required: ['equity'] },
      { key: 'exit', label: 'How do investors get their money back? (sale, listing, buy-back, dividends) — and when?', type: 'textarea', required: ['equity'] },
      { key: 'key_person', label: 'What happens if a key founder leaves or is unable to work?', type: 'textarea' },
    ],
  },

  // ───────────────────────────── Financials (equity, debt, grant) ─────────────────────────────
  {
    key: 'financials', title: 'Financial position', for: ['equity', 'debt', 'grant'],
    intro: 'Figures for your last three financial years and your position today. Use the currency you report in.',
    fields: [
      { key: 'fin_currency', label: 'Reporting currency', type: 'select', options: CURRENCIES, required: true },
      { key: 'fin_year_end', label: 'Financial year end (month)', type: 'text', required: ['equity', 'debt'] },
      { key: 'fin_history', label: 'Results', type: 'table', required: ['equity', 'debt'], rows: 3, fixedRows: ['Last year', 'Year before', 'Two years before'], columns: [
        { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'gross_profit', label: 'Gross profit', type: 'money' },
        { key: 'ebitda', label: 'EBITDA (profit before interest, tax, depreciation)', type: 'money' }, { key: 'net_profit', label: 'Net profit', type: 'money' },
        { key: 'total_assets', label: 'Total assets', type: 'money' }, { key: 'equity', label: 'Shareholders\' funds', type: 'money' }] },
      { key: 'cash_balance', label: 'Cash in the bank today', type: 'money', required: true },
      { key: 'monthly_burn', label: 'Average monthly costs', type: 'money', required: true },
      { key: 'monthly_revenue', label: 'Average monthly revenue (last 6 months)', type: 'money' },
      { key: 'tax_current', label: 'Are your tax filings and payments up to date?', type: 'yesno', required: ['equity', 'debt'] },
      { key: 'projections', label: 'Projections', type: 'table', required: ['equity', 'debt'], rows: 5, fixedRows: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'], columns: [
        { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'ebitda', label: 'EBITDA', type: 'money' },
        { key: 'cash_end', label: 'Cash at year end', type: 'money' }, { key: 'headcount', label: 'Staff', type: 'number' }] },
      { key: 'projection_basis', label: 'What are the projections based on? (prices, volumes, conversion, costs)', type: 'textarea', required: ['equity', 'debt'] },
    ],
  },

  // ───────────────────────────── Debt ─────────────────────────────
  {
    key: 'debt_request', title: 'The loan', for: ['debt'],
    fields: [
      { key: 'loan_amount', label: 'Amount you want to borrow', type: 'money', required: true },
      { key: 'loan_currency', label: 'Currency of the loan', type: 'select', options: CURRENCIES, required: true },
      { key: 'loan_purpose', label: 'Purpose', type: 'select', required: true, options: [
        { value: 'working_capital', label: 'Working capital' }, { value: 'asset', label: 'Equipment or asset purchase' },
        { value: 'trade', label: 'Trade finance (LPO, invoice or import finance)' }, { value: 'project', label: 'Project or construction finance' },
        { value: 'refinance', label: 'Refinancing existing debt' }, { value: 'bridge', label: 'Bridge to an equity round' }] },
      { key: 'loan_purpose_detail', label: 'Exactly what the loan pays for, and how that produces the money to repay it', type: 'textarea', required: true },
      { key: 'tenor_months', label: 'Loan period (months)', type: 'number', required: true },
      { key: 'moratorium_months', label: 'Months before the first repayment (moratorium), if needed', type: 'number' },
      { key: 'repayment_structure', label: 'How you propose to repay', type: 'select', required: true, options: [
        { value: 'monthly', label: 'Equal monthly instalments' }, { value: 'quarterly', label: 'Quarterly instalments' },
        { value: 'bullet', label: 'Interest during the loan, principal at the end' }, { value: 'self_liquidating', label: 'From a specific contract or sale when it pays (self-liquidating)' },
        { value: 'revenue_linked', label: 'A share of revenue until repaid' }] },
      { key: 'rate_expected', label: 'Interest rate you expect to pay (per year)', type: 'percent' },
      { key: 'drawdown', label: 'Do you need it all at once, or in stages? When?', type: 'textarea' },
    ],
  },
  {
    key: 'repayment', title: 'Repayment capacity', for: ['debt'],
    intro: 'Lenders ask one question first: where does the money to repay come from, and how certain is it?',
    fields: [
      { key: 'repayment_source', label: 'Where will repayments come from?', type: 'textarea', required: true },
      { key: 'revenue_currency', label: 'What currency do you earn your revenue in?', type: 'select', options: CURRENCIES, required: true },
      { key: 'contracts', label: 'Contracts, purchase orders or offtake agreements that support repayment', type: 'table', rows: 4, columns: [
        { key: 'counterparty', label: 'Customer / counterparty' }, { key: 'value', label: 'Value', type: 'money' }, { key: 'term', label: 'Term' },
        { key: 'payment_terms', label: 'Payment terms' }, { key: 'status', label: 'Signed / in negotiation' }] },
      { key: 'top_customer_share', label: 'Share of revenue from your single largest customer', type: 'percent', required: true },
      { key: 'receivable_days', label: 'Average days customers take to pay you', type: 'number' },
      { key: 'payable_days', label: 'Average days you take to pay suppliers', type: 'number' },
      { key: 'cash_in_monthly', label: 'Average money coming in per month (last 12 months, from bank statements)', type: 'money', required: true },
      { key: 'cash_out_monthly', label: 'Average money going out per month (last 12 months)', type: 'money', required: true },
    ],
  },
  {
    key: 'existing_debt', title: 'Existing borrowing and credit history', for: ['debt'],
    fields: [
      { key: 'has_debt', label: 'Does the company (or any founder, for the business) have loans or credit facilities now?', type: 'yesno', required: true },
      { key: 'debts', label: 'Current loans and facilities', type: 'table', rows: 4, showIf: { key: 'has_debt', in: ['yes'] }, required: ['debt'], columns: [
        { key: 'lender', label: 'Lender' }, { key: 'facility', label: 'Facility type' }, { key: 'outstanding', label: 'Outstanding', type: 'money' },
        { key: 'rate', label: 'Rate % p.a.', type: 'percent' }, { key: 'maturity', label: 'Maturity' }, { key: 'monthly', label: 'Monthly repayment', type: 'money' },
        { key: 'status', label: 'Status', type: 'select', options: ['Performing', 'Late', 'Restructured', 'In default'] }] },
      { key: 'credit_events', label: 'In the last 5 years, has the company or any founder defaulted, restructured a loan, had a loan written off, or faced recovery action?', type: 'yesno', required: true },
      { key: 'credit_events_detail', label: 'Explain what happened and how it was resolved', type: 'textarea', showIf: { key: 'credit_events', in: ['yes'] }, required: ['debt'] },
      { key: 'bureau_consent', label: 'I consent to ScaleGate Africa and its lending partners checking the company\'s and founders\' records with credit bureaus (e.g. CRC, FirstCentral, CreditRegistry).', type: 'check', required: true },
    ],
  },
  {
    key: 'security', title: 'Security and guarantees', for: ['debt'],
    fields: [
      { key: 'collateral', label: 'Assets offered as security', type: 'table', rows: 4, columns: [
        { key: 'type', label: 'Type', type: 'select', options: ['Land / building', 'Equipment', 'Vehicles', 'Receivables', 'Inventory', 'Cash / deposit', 'Shares', 'Other'] },
        { key: 'description', label: 'Description and location' }, { key: 'owner', label: 'Legal owner' },
        { key: 'market_value', label: 'Market value', type: 'money' }, { key: 'forced_sale_value', label: 'Forced-sale value', type: 'money' },
        { key: 'valued_on', label: 'Valued on (date) and by' }, { key: 'title', label: 'Title document (C of O, deed, invoice…)' },
        { key: 'charged', label: 'Already pledged to another lender?', type: 'select', options: ['No', 'Yes'] }] },
      { key: 'no_collateral_reason', label: 'If you are offering no security, why should the loan be made without it?', type: 'textarea' },
      { key: 'personal_guarantee', label: 'Would the founders give personal guarantees?', type: 'select', required: true, options: ['Yes', 'No', 'Negotiable'] },
      { key: 'corporate_guarantee', label: 'Any other company or person willing to guarantee the loan?', type: 'text' },
      { key: 'insurance', label: 'Insurance on the business and the assets (insurer, cover, expiry)', type: 'textarea' },
      { key: 'board_approved', label: 'Has your board approved borrowing this amount?', type: 'yesno', required: true },
    ],
  },

  // ───────────────────────────── Grant / sponsorship ─────────────────────────────
  {
    key: 'grant', title: 'Grant or sponsorship', for: ['grant'],
    fields: [
      { key: 'grant_amount', label: 'Amount requested', type: 'money', required: true },
      { key: 'grant_currency', label: 'Currency', type: 'select', options: CURRENCIES, required: true },
      { key: 'grant_purpose', label: 'What the grant will do', type: 'textarea', required: true },
      { key: 'impact', label: 'The impact you will measure (people served, water treated, food loss avoided, jobs, emissions)', type: 'textarea', required: true },
      { key: 'co_funding', label: 'Other money going into the same work (your own, other funders)', type: 'money' },
      { key: 'sustain', label: 'How does the work continue after the grant ends?', type: 'textarea', required: true },
      { key: 'reporting_ack_grant', label: 'I will report progress and spending against the budget as the funder requires.', type: 'check', required: true },
    ],
  },

  // ───────────────────────────── Legal and declaration (every application) ─────────────────────────────
  {
    key: 'legal', title: 'Legal, IP and compliance', for: ['all'],
    fields: [
      { key: 'ip_owner', label: 'Who owns the intellectual property (designs, code, recipes, brand, recordings)?', type: 'select', required: true, options: [
        { value: 'company', label: 'The company' }, { value: 'founders', label: 'The founders personally' }, { value: 'third_party', label: 'A third party (licensed to us)' },
        { value: 'mixed', label: 'Mixed' }, { value: 'none', label: 'No IP yet' }] },
      { key: 'ip_registered', label: 'Registered patents, designs, trademarks or copyright (and where)', type: 'textarea' },
      { key: 'licences', label: 'Licences and approvals you hold or need (NAFDAC, SON, NMDPRA, NCC, CBN, state permits…)', type: 'textarea' },
      { key: 'litigation', label: 'Is the venture or any founder in a legal dispute?', type: 'yesno', required: true },
      { key: 'litigation_detail', label: 'Describe the dispute', type: 'textarea', showIf: { key: 'litigation', in: ['yes'] }, required: true },
      { key: 'related_party', label: 'Does the business trade with companies owned by founders or their families?', type: 'yesno', required: ['equity', 'debt'] },
      { key: 'related_party_detail', label: 'Describe those dealings', type: 'textarea', showIf: { key: 'related_party', in: ['yes'] }, required: ['equity', 'debt'] },
      { key: 'pep', label: 'Is any founder, director or shareholder a politically exposed person (or a close relative of one)?', type: 'yesno', required: ['equity', 'debt'] },
    ],
  },
  {
    key: 'declaration', title: 'Declaration', for: ['all'],
    fields: [
      { key: 'heard_from', label: 'How did you hear about VentureOS?', type: 'select', options: ['ScaleGate', 'VentureOS monthly meeting', 'iDICE / AfriLabs', 'University or polytechnic', 'Social media', 'A friend or founder', 'Other'] },
      { key: 'decl_true', label: 'The information in this application and its documents is true and complete. I will tell ScaleGate Africa promptly if anything material changes.', type: 'check', required: true },
      { key: 'decl_data', label: 'I agree that ScaleGate Africa may hold and use this information to assess the application and share it, in confidence, with its reviewers, committee and prospective funders, under the Nigeria Data Protection Act 2023.', type: 'check', required: true },
      { key: 'signatory', label: 'Your full name', type: 'text', required: true },
      { key: 'signatory_role', label: 'Your role in the venture', type: 'text', required: true },
    ],
  },
];

const KINDS = {
  residency: { label: 'VentureOS Center residency', short: 'Residency', blurb: 'A 6–12 month live-work-build place in Lagos for Make, Grow and Create ventures, with labs, studios, housing and the route to Europe.' },
  equity: { label: 'Equity investment', short: 'Equity', blurb: 'Investment for shares, a SAFE or a convertible note, introduced through ScaleGate to its investors.' },
  debt: { label: 'Debt finance', short: 'Debt', blurb: 'A loan, asset finance or trade finance (LPO, invoice, import) arranged with lending partners.' },
  grant: { label: 'Grant or sponsorship', short: 'Grant', blurb: 'Grant funding or sponsorship from development partners, foundations and corporate sponsors.' },
};

const fieldIndex = new Map();
for (const s of SECTIONS) for (const f of s.fields) {
  if (fieldIndex.has(f.key)) throw new Error(`Duplicate question key ${f.key}`);
  fieldIndex.set(f.key, { ...f, section: s.key });
}

const appliesTo = (section, kinds) => section.for.includes('all') || section.for.some((k) => kinds.includes(k));
const sectionsFor = (kinds) => SECTIONS.filter((s) => appliesTo(s, kinds));
const field = (key) => fieldIndex.get(key) || null;

/** Is this field shown, given the answers so far? */
function visible(f, answers) {
  if (!f.showIf) return true;
  const v = answers[f.showIf.key];
  return f.showIf.in.includes(Array.isArray(v) ? v[0] : v);
}

/** Is this field required for this set of kinds (and visible)? */
function isRequired(f, section, kinds, answers) {
  if (!visible(f, answers)) return false;
  if (f.required === true) return true;
  if (Array.isArray(f.required)) return f.required.some((k) => kinds.includes(k) && (section.for.includes('all') || section.for.includes(k)));
  return false;
}

function filled(f, v) {
  if (v === undefined || v === null || v === '') return false;
  if (f.type === 'check') return v === true || v === 'on' || v === 'yes';
  if (f.type === 'table') return Array.isArray(v) && v.some((row) => Object.values(row || {}).some((x) => x !== '' && x !== null && x !== undefined));
  if (f.type === 'multiselect') return Array.isArray(v) && v.length > 0;
  if (f.minLength && typeof v === 'string' && v.trim().length < f.minLength) return false;
  return String(v).trim() !== '';
}

/** Missing required answers, by section: [{ section, title, missing: [{key,label}] }]. */
function missing(kinds, answers) {
  const out = [];
  for (const s of sectionsFor(kinds)) {
    const m = s.fields.filter((f) => isRequired(f, s, kinds, answers) && !filled(f, answers[f.key])).map((f) => ({ key: f.key, label: f.label }));
    if (m.length) out.push({ section: s.key, title: s.title, missing: m });
  }
  return out;
}

const option = (f, v) => {
  if (!f || !f.options) return v;
  const o = f.options.find((x) => (typeof x === 'string' ? x : x.value) === v);
  return o ? (typeof o === 'string' ? o : o.label) : v;
};

module.exports = { SECTIONS, KINDS, CURRENCIES, TRACKS, sectionsFor, field, visible, isRequired, filled, missing, option };
