-- Campuses (the VentureOS Center in Lagos first) and cohort announcements, shown on the front page.

CREATE TABLE campuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  city        text,
  country     text,
  status      text NOT NULL DEFAULT 'design' CHECK (status IN ('design','renovation','open','planned')),
  summary     text NOT NULL DEFAULT '',
  spaces      text,          -- one line per space or feature
  capacity    text,          -- e.g. "About 15 apartments in phase 1"
  opens       text,          -- e.g. "Cohort 0, mid-2027"
  sort        int NOT NULL DEFAULT 100,
  visible     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO campuses (name, city, country, status, summary, spaces, capacity, opens, sort) VALUES (
  'VentureOS Center', 'Lagos', 'Nigeria', 'design',
  'A live-work-build campus: one office building becomes the Build Hub for technical, business and music work, and the neighbouring buildings become residences for innovators from across Africa. The campus runs to a zero-failure standard for power and water, and is the first customer and live demonstration site for its own ventures'' technology.',
  E'Build Hub: open coworking, team rooms, quiet pods, call booths, boardroom and a 60–100 seat event and pitch hall that converts to a black-box theatre\nMaker lab: 3D printers, laser cutter, small CNC, electronics benches\nWater, chemistry and fuels lab with fume extraction and gas detection\nEnergy test bay and cold-storage development yard\nPilot food-processing unit, food-testing lab and packaging studio\nSoundproofed music studio and rehearsal room; photo and video studio\nResidences: studio and one-bedroom apartments, shared dining and lounges, laundry and study room\nArt studio, fashion atelier and writers'' room; lounges that become exhibition space\nOne kitchen serving the restaurant, café, members and residents\nPower: grid, solar with batteries and generator backup; water: borehole with on-site treatment',
  'About 15 apartments in phase 1, about 30 when the residences extend to four buildings; cohorts of 12–20 resident innovators',
  'Cohort 0 in mid-2027', 10);

ALTER TABLE cohorts ADD COLUMN campus_id uuid REFERENCES campuses(id);
ALTER TABLE cohorts ADD COLUMN timing text;               -- shown when exact dates are not set, e.g. "Mid-2027"
ALTER TABLE cohorts ADD COLUMN announcement text;         -- the public description
ALTER TABLE cohorts ADD COLUMN public boolean NOT NULL DEFAULT false;

INSERT INTO cohorts (name, size_target, status, campus_id, timing, announcement, public)
SELECT 'Cohort 0', 10, 'planned', c.id, 'Mid-2027',
  '8–10 founders across Make, Grow and Create, mainly from Nigeria and West Africa, for a 6–12 month residency: problem immersion, prototype, pilot, then scale and the route to Europe through ScaleGate in The Hague. Recruitment runs in the first half of 2027; you can apply now.',
  true
FROM campuses c WHERE c.name = 'VentureOS Center' AND NOT EXISTS (SELECT 1 FROM cohorts WHERE name = 'Cohort 0');
