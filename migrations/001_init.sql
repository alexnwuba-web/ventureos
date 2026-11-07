-- VentureOS: people and sign-in, ventures, applications (residency, equity, debt, grant), answers, documents,
-- reviews and scoring, messages, the audit trail, cohorts and the innovator tab.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE people (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT '',
  phone       text,
  country     text,
  -- Staff role, or null for founders: admin (everything), reviewer (scores assigned applications),
  -- committee (sees all, records decisions), finance (the innovator tab).
  staff_role  text CHECK (staff_role IN ('admin','reviewer','committee','finance')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE login_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  used        boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_email ON login_codes (email, created_at DESC);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cohorts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,                       -- e.g. "Cohort 0"
  opens_on     date,
  closes_on    date,
  starts_on    date,
  size_target  int,
  status       text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','closed','running','completed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ventures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES people(id),
  name        text NOT NULL DEFAULT '',
  pillar      text CHECK (pillar IN ('make','grow','create')),
  country     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE application_seq START 1;

CREATE TABLE applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL UNIQUE,                -- VOS-26-0001
  venture_id    uuid NOT NULL REFERENCES ventures(id),
  applicant_id  uuid NOT NULL REFERENCES people(id),
  kinds         text[] NOT NULL,                     -- any of residency, equity, debt, grant
  cohort_id     uuid REFERENCES cohorts(id),
  status        text NOT NULL DEFAULT 'draft',
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kinds <@ ARRAY['residency','equity','debt','grant']::text[] AND cardinality(kinds) > 0)
);
CREATE INDEX applications_status ON applications (status);

-- One row per question; the question bank (src/domain/questions.js) defines the keys.
CREATE TABLE answers (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  key            text NOT NULL,
  value          jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, key)
);

CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_type       text NOT NULL,                      -- from src/domain/documents.js
  filename       text NOT NULL,
  stored_name    text NOT NULL,
  mime           text,
  size           int,
  uploaded_by    uuid REFERENCES people(id),
  status         text NOT NULL DEFAULT 'received' CHECK (status IN ('received','accepted','rejected')),
  note           text,
  removed        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_app ON documents (application_id);

CREATE TABLE assignments (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES people(id),
  assigned_by    uuid REFERENCES people(id),
  conflict       text,                               -- null until declared; 'none' or the reason
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, reviewer_id)
);

CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES people(id),
  rubric         text NOT NULL,                      -- residency | equity | debt | grant
  scores         jsonb NOT NULL DEFAULT '{}',        -- criterion key -> 0..5
  total          numeric,                            -- weighted, out of 100
  recommendation text CHECK (recommendation IN ('advance','hold','decline')),
  comments       text,
  submitted_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, reviewer_id, rubric)
);

CREATE TABLE messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_id      uuid REFERENCES people(id),
  body           text NOT NULL,
  internal       boolean NOT NULL DEFAULT false,     -- staff notes the founder never sees
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit (
  id             bigserial PRIMARY KEY,
  actor_id       uuid REFERENCES people(id),
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  action         text NOT NULL,
  detail         jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_app ON audit (application_id, at DESC);

-- The innovator tab: carrying costs charged to a venture during residency, less sponsorship, repaid from revenue.
-- Charges are positive, credits negative; the balance is the sum.
CREATE TABLE tab_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id  uuid NOT NULL REFERENCES ventures(id),
  kind        text NOT NULL CHECK (kind IN ('housing','meals','workspace','studio','services','uplift','sponsorship','repayment','writeoff','conversion','adjustment')),
  amount      numeric(14,2) NOT NULL,
  currency    text NOT NULL DEFAULT 'NGN',
  period      text,                                  -- e.g. 2027-07
  memo        text,
  posted_by   uuid REFERENCES people(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tab_venture ON tab_entries (venture_id, created_at);

CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO settings (key, value) VALUES
  ('debt_assumed_rate', '0.27'),          -- annual rate used for debt service when the founder gives none
  ('dscr_minimum', '1.25'),
  ('leverage_maximum', '3.5'),
  ('collateral_haircut', '0.3'),          -- market value less this when no forced-sale value is given
  ('tab_rates', '{"housing": 0, "meals": 0, "workspace": 0}');
