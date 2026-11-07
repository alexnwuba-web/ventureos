-- Staff console: an Officer role, job title and office, and suspending a member of staff without deleting them.
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_staff_role_check;
ALTER TABLE people ADD CONSTRAINT people_staff_role_check CHECK (staff_role IN ('admin','officer','reviewer','committee','finance'));
ALTER TABLE people ADD COLUMN IF NOT EXISTS staff_title text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS staff_office text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS staff_active boolean NOT NULL DEFAULT true;
ALTER TABLE people ADD COLUMN IF NOT EXISTS staff_since timestamptz;
UPDATE people SET staff_since = created_at WHERE staff_role IS NOT NULL AND staff_since IS NULL;
CREATE INDEX IF NOT EXISTS audit_staff ON audit (at DESC) WHERE action LIKE 'staff.%';
