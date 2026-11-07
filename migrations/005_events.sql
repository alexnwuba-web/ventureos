-- Monthly investment presentations and meetups: announced on the front page, with submissions to present and
-- registrations to attend.

CREATE TABLE events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  kind               text NOT NULL DEFAULT 'investment' CHECK (kind IN ('investment','meetup','demo_day','other')),
  starts_at          timestamptz NOT NULL,
  duration_min       int NOT NULL DEFAULT 120,
  venue              text,                         -- address; empty for online-only
  online_link        text,                         -- shown to registered people only
  summary            text NOT NULL DEFAULT '',
  capacity           int,                          -- places to attend; null = no limit
  pitch_slots        int,                          -- ventures presenting; null/0 = no presentations
  submissions_close  date,                         -- last day to submit to present
  submissions_open   boolean NOT NULL DEFAULT true,
  registration_open  boolean NOT NULL DEFAULT true,
  public             boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','held')),
  created_by         uuid REFERENCES people(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_when ON events (starts_at);

CREATE TABLE event_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES people(id),
  application_id  uuid REFERENCES applications(id) ON DELETE SET NULL,
  venture_name    text NOT NULL,
  one_liner       text NOT NULL,
  pillar          text,
  ask_kind        text,                            -- equity | debt | grant | partners | other
  ask_amount      numeric(16,2),
  ask_currency    text,
  why_now         text,
  deck_name       text,
  deck_stored     text,
  status          text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','selected','declined','withdrawn','presented')),
  slot            text,                            -- e.g. "3rd presenter, 18:40"
  staff_note      text,                            -- shown to the founder when selected or declined
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id, venture_name)
);
CREATE INDEX event_subs ON event_submissions (event_id, status);

CREATE TABLE event_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES people(id),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text,
  organisation  text,
  role          text NOT NULL DEFAULT 'other' CHECK (role IN ('investor','founder','corporate','government','partner','student','other')),
  interests     text,
  cancelled     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, email)
);
