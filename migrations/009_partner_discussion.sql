-- Partner discussion: ScaleGate partners message each other about an application. The founder never sees it.
-- Discussion posts are internal messages; a post can answer another and name the partners it was sent to.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS notified uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS messages_internal ON messages (application_id, created_at) WHERE internal;

-- When each partner last read an application's discussion, so new posts can be marked and counted.
CREATE TABLE IF NOT EXISTS discussion_reads (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  person_id      uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  read_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, person_id)
);
