-- Oxi languages (18 November 2026): the language each person chose in the top menu (en, fr, es, zh, it, de, yo, ig,
-- ha), kept in their VentureOS profile so it follows them to every device.
ALTER TABLE people ADD COLUMN IF NOT EXISTS lang text
  CHECK (lang IS NULL OR lang IN ('en','fr','es','zh','it','de','yo','ig','ha'));
