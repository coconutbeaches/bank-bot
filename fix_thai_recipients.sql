-- Fix missing Thai recipients by re-parsing raw_text
-- This updates records where recipient is NULL but raw_text contains Thai names

-- First, let's see how many records need fixing
SELECT 
  COUNT(*) as records_needing_fix,
  COUNT(CASE WHEN raw_text ~ '[ก-ฮ]' THEN 1 END) as with_thai_text
FROM payment_slips
WHERE recipient IS NULL 
  AND raw_text IS NOT NULL;

-- Update recipients from "To" line in raw_text
UPDATE payment_slips
SET recipient = (
  SELECT substring(line FROM '^(?:To|Recipient|Payee)[:\s]+(.+)$')
  FROM regexp_split_to_table(raw_text, E'\\n') AS line
  WHERE line ~ '^(To|Recipient|Payee)[:\s]+'
  LIMIT 1
)
WHERE recipient IS NULL
  AND raw_text IS NOT NULL
  AND raw_text ~ '^(?:To|Recipient|Payee)[:\s]+';

-- Update recipients from Thai title lines (นาย, นาง, น.ส.)
UPDATE payment_slips
SET recipient = (
  SELECT line
  FROM regexp_split_to_table(raw_text, E'\\n') AS line
  WHERE line ~ '^(นาย|นาง|น\.ส\.|MR\.|MS\.|MRS\.|MISS|DR\.|K\.)\s+[ก-ฮA-Z]'
  LIMIT 1
)
WHERE recipient IS NULL
  AND raw_text IS NOT NULL
  AND raw_text ~ '(นาย|นาง|น\.ส\.)';

-- Update recipients from Thai names (lines starting with Thai characters)
UPDATE payment_slips
SET recipient = (
  SELECT line
  FROM regexp_split_to_table(raw_text, E'\\n') AS line
  WHERE line ~ '^[ก-ฮ][ก-ฮะ-์\s]{8,}$'
    AND length(line) < 100
  LIMIT 1
)
WHERE recipient IS NULL
  AND raw_text IS NOT NULL
  AND raw_text ~ '[ก-ฮ]';

-- Check results
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN recipient IS NOT NULL THEN 1 END) as with_recipient,
  COUNT(CASE WHEN recipient IS NULL THEN 1 END) as still_missing
FROM payment_slips;

-- Show sample of updated Thai recipients
SELECT file_name, recipient, LEFT(raw_text, 150) as text_sample
FROM payment_slips
WHERE recipient ~ '[ก-ฮ]'
LIMIT 10;
