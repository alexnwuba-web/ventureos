-- Two parts: the initial submission (1), then full documentation (2) for ventures invited to proceed.
ALTER TABLE applications ADD COLUMN stage int NOT NULL DEFAULT 1 CHECK (stage IN (1, 2));
ALTER TABLE applications ADD COLUMN full_submitted_at timestamptz;
