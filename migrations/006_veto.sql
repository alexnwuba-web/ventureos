-- The integrity veto (VentureOS Platform Implementation Plan, B4.2): any administrator may set it on any venture at any
-- stage. It removes the venture from the active list, is visible only to administrators, and has no reason field.
ALTER TABLE applications ADD COLUMN vetoed boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN vetoed_at timestamptz;
