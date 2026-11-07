-- VentureOS as the way into ScaleGate: applications to ScaleGate's own programmes, and enquiries from organisations
-- that want to fund or co-design programmes.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_kinds_check;
ALTER TABLE applications ADD CONSTRAINT applications_kinds_check
  CHECK (kinds <@ ARRAY['residency','programme','equity','debt','grant']::text[] AND cardinality(kinds) > 0);

CREATE TABLE partner_enquiries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  organisation  text NOT NULL,
  role          text,
  email         text NOT NULL,
  phone         text,
  country       text,
  org_type      text,
  interests     text[] NOT NULL DEFAULT '{}',
  message       text,
  budget        text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','in_discussion','agreed','closed')),
  staff_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Areas of interest from ScaleGate's own programmes
INSERT INTO interests (title, body, pillar, support, sort) VALUES
 ('African companies ready to grow in Europe', 'Established companies with a proven offer, ready for international expansion: market selection and entry, customers and partners, local operating and ecosystem access, through ScaleGate''s team in the Netherlands.', 'scalegate', 'ScaleGate Scale · Equity · Debt', 2),
 ('Founders ready to build in the Netherlands', 'Innovative non-EU founders who will build and operate their company in the Netherlands, with company building and preparation for the Dutch Startup Visa.', 'scalegate', 'Dutch Startup Visa route', 3),
 ('European and international companies entering Africa', 'Companies that want to enter or expand in an African market: one defined market and a clear commercial objective, validated locally and executed with local partners.', 'scalegate', 'Scale in Africa', 4),
 ('Young people with potential but without resources', 'Free or fully sponsored venture building, mentorship and connections for young founders who would not normally have access.', 'scalegate', 'Venture Philanthropy', 5),
 ('Creative and cultural ventures', 'Artists, filmmakers, designers, performers, craftspeople and heritage practitioners building sustainable ventures and livelihoods.', 'create', 'Residency · Creative and Cultural Industries track', 85);
