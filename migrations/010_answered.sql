-- The ten-working-day answer clock stops once ScaleGate has answered the founder: a message to the founder,
-- a request for information, an invitation to the full documentation or to a meeting, or a decision.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS answered_at timestamptz;

-- Applications already answered before this change.
UPDATE applications a SET answered_at = x.first_at FROM (
  SELECT application_id, min(at) AS first_at FROM audit
  WHERE action IN ('message', 'meeting.invited')
     OR (action = 'status' AND detail->>'to' IN ('info_requested', 'full_requested', 'accepted', 'offer', 'waitlisted', 'declined'))
  GROUP BY application_id) x
WHERE a.id = x.application_id AND a.answered_at IS NULL;
