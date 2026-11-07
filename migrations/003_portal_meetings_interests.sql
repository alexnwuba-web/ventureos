-- The applicant portal: meetings (first and follow-up), follow-up actions and document requests.
-- The front page: projects that interest ScaleGate, editable by staff.

CREATE TABLE meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title           text NOT NULL,
  kind            text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','follow_up','interview','due_diligence','site_visit','other')),
  starts_at       timestamptz NOT NULL,
  duration_min    int NOT NULL DEFAULT 60,
  mode            text NOT NULL DEFAULT 'video' CHECK (mode IN ('in_person','video','phone')),
  location        text,                                -- address for in-person meetings
  video_link      text,                                -- Zoom / Google Meet / Teams link, or a phone number
  agenda          text,
  with_staff      text,                                -- who will attend from ScaleGate
  status          text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','reschedule','cancelled','held')),
  founder_note    text,                                -- the founder's reply or the times they suggest instead
  summary         text,                                -- shared with the founder after the meeting
  internal_notes  text,                                -- staff only
  follows_id      uuid REFERENCES meetings(id),        -- a follow-up of an earlier meeting
  reminded_at     timestamptz,
  created_by      uuid REFERENCES people(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_app ON meetings (application_id, starts_at);
CREATE INDEX meetings_upcoming ON meetings (starts_at) WHERE status IN ('proposed','accepted');

CREATE TABLE actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES meetings(id) ON DELETE SET NULL,
  body            text NOT NULL,
  owner           text NOT NULL DEFAULT 'founder' CHECK (owner IN ('founder','scalegate')),
  due_on          date,
  done_at         timestamptz,
  done_by         uuid REFERENCES people(id),
  created_by      uuid REFERENCES people(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX actions_app ON actions (application_id, created_at);

CREATE TABLE document_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES meetings(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  due_on          date,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','received','accepted','cancelled')),
  created_by      uuid REFERENCES people(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX docreq_app ON document_requests (application_id);
ALTER TABLE documents ADD COLUMN request_id uuid REFERENCES document_requests(id) ON DELETE SET NULL;

CREATE TABLE interests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  pillar      text CHECK (pillar IN ('make','grow','create','scalegate')),
  support     text,                                   -- e.g. "Residency · Equity · Debt"
  sort        int NOT NULL DEFAULT 100,
  visible     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO interests (title, body, pillar, support, sort) VALUES
 ('Clean water', 'Water from humid air; treatment of brown and borehole water, including sulphur and gas removal; low-cost testing.', 'make', 'Residency · Equity · Grant', 10),
 ('Energy that works in the heat', 'Solar engineered for hot, high-sunlight conditions; storage; biogas and waste-to-power.', 'make', 'Residency · Equity · Debt', 20),
 ('Petroleum, refining and petrochemicals', 'Modular refinery efficiency, flare-gas capture and gas-to-products, cleaner fuels, plastics back into feedstock, oil-spill remediation.', 'make', 'Residency · Equity', 30),
 ('Waste to value', 'Recycling, upcycling and turning farm, municipal and plastic waste into products and power.', 'make', 'Residency · Equity · Grant', 40),
 ('Solar cold storage and natural farm packaging', 'Cooling as a service at the farm gate, and crates and boxes made from local materials, so less food is lost between farm and market.', 'grow', 'Residency · Equity · Debt · Grant', 50),
 ('Nigerian food for global markets', 'Dry soups and stews, spices, herbal teas, coffee, bean-to-bar chocolate, nuts and flours — certified, shelf-stable and export-ready.', 'grow', 'Residency · Equity · Debt', 60),
 ('Food-grade and sustainable packaging', 'Barrier pouches, heat-stable packs, compostable films and packaging made from cassava, plantain and cocoa waste, made locally in small runs.', 'grow', 'Residency · Equity', 70),
 ('Fashion, music and storytelling', 'Labels, catalogues and productions built for export: fashion and textiles, recordings, publishing, theatre, film and audio.', 'create', 'Residency · Equity · Grant', 80),
 ('Heritage, eco and food tourism', 'Festivals, birding trails, eco-lodges, farm stays and visitor experiences.', 'create', 'Residency · Equity · Debt', 90),
 ('Ornithology and conservation technology', 'Low-cost sound recorders with AI species identification, bird-strike risk monitoring for airports, farmland biodiversity monitoring.', 'make', 'Residency · Grant', 100),
 ('Established businesses ready to scale', 'Operating businesses in West and East Africa seeking equity or debt, or a route into Europe through ScaleGate in The Hague.', 'scalegate', 'Equity · Debt', 110);
