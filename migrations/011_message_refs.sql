-- Messages between ScaleGate and the founder carry a reference (VOS-26-0002-M03). The founder answers against a
-- reference, replies are tracked, and files attached to a reply are kept with the application's documents.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS needs_reply boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS messages_ref ON messages (ref) WHERE ref IS NOT NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

-- Number the existing messages with founders, oldest first, per application.
UPDATE messages m SET ref = x.ref FROM (
  SELECT m2.id, a.ref || '-M' || lpad(row_number() OVER (PARTITION BY m2.application_id ORDER BY m2.created_at)::text, 2, '0') AS ref
  FROM messages m2 JOIN applications a ON a.id = m2.application_id WHERE NOT m2.internal) x
WHERE m.id = x.id AND m.ref IS NULL;
