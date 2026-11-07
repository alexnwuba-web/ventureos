'use strict';
/*
 * Documents an application asks for, by kind. `required` lists the kinds for which a document must be uploaded
 * before the application can be submitted; `when` makes it depend on an answer.
 */
const DOCS = [
  { key: 'pitch_deck', label: 'Pitch deck', required: ['equity', 'debt', 'grant'], for: ['all'] },
  { key: 'business_plan', label: 'Business plan', required: ['equity', 'debt', 'grant'], for: ['all'],
    help: 'Problem, market, product, operations, team, financial plan and risks.' },
  { key: 'business_background', label: 'Business background questionnaire', required: ['equity', 'debt'], for: ['equity', 'debt', 'grant'],
    template: '/static/templates/VentureOS_Business_Background_Questionnaire.docx',
    help: 'Download the questionnaire, answer all 23 questions (history, owners, profit and cash flow, owners\' pay, leases, key customers and suppliers, staff and post-holders, marketing, challenges, why now, plan B), then upload it here.' },
  { key: 'tax_returns', label: 'Tax returns for the last 3 years (supporting the revenue declared)', required: ['equity', 'debt'], for: ['equity', 'debt'] },
  { key: 'leases', label: 'Lease agreements (premises, equipment, vehicles)', for: ['equity', 'debt'] },
  { key: 'org_chart', label: 'Organisation chart and CVs of the management team, with key post-holders', for: ['equity', 'debt', 'grant'] },
  { key: 'marketing_material', label: 'Marketing material (advertising, promotions, loyalty programme)', for: ['equity', 'debt'] },
  { key: 'founder_cvs', label: 'Founders\' CVs (one file or several)', required: ['residency', 'equity', 'debt'], for: ['all'] },
  { key: 'founder_ids', label: 'Founders\' identity documents (passport, NIN slip or national ID)', required: ['residency', 'equity', 'debt'], for: ['all'] },
  { key: 'incorporation', label: 'Certificate of incorporation and latest status report (e.g. CAC)', required: ['equity', 'debt'], for: ['all'],
    when: { key: 'registered', in: ['yes'] } },
  { key: 'memart', label: 'Memorandum and articles of association', required: ['equity'], for: ['equity', 'debt'], when: { key: 'registered', in: ['yes'] } },
  { key: 'financial_model', label: 'Live financial model (Excel): profit and loss, cash flow and balance sheet by quarter, with the assumptions', required: ['equity'], for: ['equity', 'debt', 'grant'] },
  { key: 'balance_sheet', label: 'Current balance sheet (latest management accounts)', required: ['equity', 'debt'], for: ['equity', 'debt'] },
  { key: 'sales_evidence', label: '12 months of sales invoices and delivery notes for current customers', required: ['equity', 'debt'], for: ['equity', 'debt'] },
  { key: 'group_chart', label: 'Ownership chart across the group: every related company, its shareholders and directors', for: ['equity', 'debt'] },
  { key: 'key_agreements', label: 'Signed key agreements (distribution mandates, supply, offtake, licences, concessions)', for: ['equity', 'debt'] },
  { key: 'price_list', label: 'Price list by product: buy and sell prices, pack sizes', for: ['equity', 'debt'] },
  { key: 'regulatory', label: 'Regulatory certificates (NAFDAC, SON, etc.) and the status of pending applications', for: ['equity', 'debt', 'residency'] },
  { key: 'capacity_plan', label: 'Capacity schedule and expansion plan, with costs', for: ['equity', 'debt'] },
  { key: 'ip_documents', label: 'IP filings or certificates (patent, utility model, design, trademark, copyright)', for: ['all'] },
  { key: 'programme_docs', label: 'Programme or sponsor documents and correspondence (e.g. BOI/iDICE, a development-finance institution)', for: ['equity', 'debt', 'grant'], when: { key: 'programme', in: ['yes'] } },
  { key: 'financial_statements', label: 'Financial statements — last 3 years, or since starting', required: ['equity', 'debt'], for: ['equity', 'debt', 'grant'] },
  { key: 'management_accounts', label: 'Management accounts for this year to date', required: ['debt'], for: ['equity', 'debt'] },
  { key: 'valuation_workings', label: 'Valuation workings or valuation report', required: ['equity'], for: ['equity'] },
  { key: 'cap_table_doc', label: 'Cap table (spreadsheet)', for: ['equity'] },
  { key: 'sha', label: 'Existing shareholders\' agreement', required: ['equity'], for: ['equity'], when: { key: 'sha_exists', in: ['yes'] } },
  { key: 'bank_statements', label: 'Bank statements — last 12 months, all business accounts', required: ['debt'], for: ['debt', 'equity'] },
  { key: 'tax_clearance', label: 'Tax clearance certificate', required: ['debt'], for: ['debt', 'equity'] },
  { key: 'loan_letters', label: 'Offer letters and statements for existing loans', required: ['debt'], for: ['debt'], when: { key: 'has_debt', in: ['yes'] } },
  { key: 'contracts', label: 'Contracts, purchase orders or offtake agreements', for: ['debt', 'equity'] },
  { key: 'collateral_docs', label: 'Title documents for the security offered', for: ['debt'] },
  { key: 'collateral_valuation', label: 'Valuation report for the security offered', for: ['debt'] },
  { key: 'board_resolution', label: 'Board resolution approving the borrowing', for: ['debt'], required: ['debt'], when: { key: 'board_approved', in: ['yes'] } },
  { key: 'grant_budget', label: 'Detailed budget', required: ['grant'], for: ['grant'] },
  { key: 'portfolio', label: 'Portfolio (photos, lookbook, samples of writing or recordings)', for: ['residency'] },
  { key: 'product_media', label: 'Photos or a short video of the actual product, prototype or work', for: ['all'] },
  { key: 'technical', label: 'Test evidence: test reports, meter readings, lab results, photos or videos of test runs', for: ['all'] },
  { key: 'letters', label: 'Letters of support, intent or recommendation', for: ['all'] },
  { key: 'other', label: 'Anything else you want us to see', for: ['all'] },
];

// Asked for in the initial submission (Part 1); every other document belongs to the full documentation (Part 2).
const PART_ONE_DOCS = new Set(['pitch_deck', 'business_plan', 'founder_cvs', 'portfolio', 'product_media', 'technical', 'letters', 'other']);
for (const d of DOCS) d.stage = PART_ONE_DOCS.has(d.key) ? 1 : 2;

const byKey = new Map(DOCS.map((d) => [d.key, d]));

function docsFor(kinds, answers = {}, stage = 2) {
  return DOCS.filter((d) => d.stage <= stage && (d.for.includes('all') || d.for.some((k) => kinds.includes(k)))).map((d) => {
    const applies = !d.when || d.when.in.includes(answers[d.when.key]);
    return { ...d, isRequired: applies && !!(d.required && d.required.some((k) => kinds.includes(k))) };
  });
}

/** Required documents not yet uploaded. */
function missingDocs(kinds, answers, uploaded, stage = 2) {
  const have = new Set(uploaded.filter((u) => !u.removed && u.status !== 'rejected').map((u) => u.doc_type));
  return docsFor(kinds, answers, stage).filter((d) => d.isRequired && !have.has(d.key));
}

module.exports = { DOCS, docsFor, missingDocs, doc: (k) => byKey.get(k) || null };
