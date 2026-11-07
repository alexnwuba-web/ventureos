'use strict';
/*
 * Documents an application asks for, by kind. `required` lists the kinds for which a document must be uploaded
 * before the application can be submitted; `when` makes it depend on an answer.
 */
const DOCS = [
  { key: 'pitch_deck', label: 'Pitch deck', required: ['equity', 'debt', 'grant'], for: ['all'] },
  { key: 'business_plan', label: 'Business plan', required: ['equity', 'debt', 'grant'], for: ['all'],
    help: 'Problem, market, product, operations, team, financial plan and risks.' },
  { key: 'founder_cvs', label: 'Founders\' CVs (one file or several)', required: ['residency', 'equity', 'debt'], for: ['all'] },
  { key: 'founder_ids', label: 'Founders\' identity documents (passport, NIN slip or national ID)', required: ['equity', 'debt'], for: ['all'] },
  { key: 'incorporation', label: 'Certificate of incorporation and latest status report (e.g. CAC)', required: ['equity', 'debt'], for: ['all'],
    when: { key: 'registered', in: ['yes'] } },
  { key: 'memart', label: 'Memorandum and articles of association', required: ['equity'], for: ['equity', 'debt'], when: { key: 'registered', in: ['yes'] } },
  { key: 'financial_model', label: 'Financial model (spreadsheet with projections and assumptions)', required: ['equity'], for: ['equity', 'debt', 'grant'] },
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
  { key: 'technical', label: 'Technical evidence (drawings, test results, lab reports, patents)', for: ['residency', 'equity'] },
  { key: 'letters', label: 'Letters of support, intent or recommendation', for: ['all'] },
  { key: 'other', label: 'Anything else you want us to see', for: ['all'] },
];

const byKey = new Map(DOCS.map((d) => [d.key, d]));

function docsFor(kinds, answers = {}) {
  return DOCS.filter((d) => d.for.includes('all') || d.for.some((k) => kinds.includes(k))).map((d) => {
    const applies = !d.when || d.when.in.includes(answers[d.when.key]);
    return { ...d, isRequired: applies && !!(d.required && d.required.some((k) => kinds.includes(k))) };
  });
}

/** Required documents not yet uploaded. */
function missingDocs(kinds, answers, uploaded) {
  const have = new Set(uploaded.filter((u) => !u.removed && u.status !== 'rejected').map((u) => u.doc_type));
  return docsFor(kinds, answers).filter((d) => d.isRequired && !have.has(d.key));
}

module.exports = { DOCS, docsFor, missingDocs, doc: (k) => byKey.get(k) || null };
