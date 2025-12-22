-- Extract recipient names from raw_text for records missing recipients
-- Pattern: Look for text after "To" section, typically before account numbers

UPDATE payment_slips
SET recipient = (
  SELECT 
    CASE
      -- Pattern 1: "ttb NAME" or "Utb NAME" or similar OCR artifacts before name
      WHEN raw_text ~ '(?i)(ttb|utb|ub)\s+([A-Z][A-Z\s]+)\s+\d{3}-\d-' THEN
        TRIM(REGEXP_REPLACE(
          (REGEXP_MATCHES(raw_text, '(?i)(ttb|utb|ub)\s+([A-Z][A-Z\s]+)\s+\d{3}-\d-', 'n'))[2],
          '\s+', ' ', 'g'
        ))
      
      -- Pattern 2: Name directly before account number (no ttb prefix)
      WHEN raw_text ~ '(?i)To[\s\S]*?([A-Z][A-Z\s]{10,50})\s+\d{3}-\d-' THEN
        TRIM(REGEXP_REPLACE(
          (REGEXP_MATCHES(raw_text, '(?i)To[\s\S]*?([A-Z][A-Z\s]{10,50})\s+\d{3}-\d-', 'n'))[1],
          '\s+', ' ', 'g'
        ))
      
      -- Pattern 3: Thai name with or without prefix
      WHEN raw_text ~ '(?i)(ttb|utb|ub)?\s*([\u0E00-\u0E7F\s]{5,50})\s+\d{3}-\d-' THEN
        TRIM(REGEXP_REPLACE(
          (REGEXP_MATCHES(raw_text, '(?i)(ttb|utb|ub)?\s*([\u0E00-\u0E7F\s]{5,50})\s+\d{3}-\d-', 'n'))[2],
          '\s+', ' ', 'g'
        ))
      
      -- Pattern 4: Shop name or company (before "Biller ID" for bill payments)
      WHEN raw_text ~ '(?i)To[\s\S]*?([A-Z][A-Za-z\s]{3,50})\s+Biller ID:' THEN
        TRIM(REGEXP_REPLACE(
          (REGEXP_MATCHES(raw_text, '(?i)To[\s\S]*?([A-Z][A-Za-z\s]{3,50})\s+Biller ID:', 'n'))[1],
          '\s+', ' ', 'g'
        ))
      
      ELSE NULL
    END
)
WHERE recipient IS NULL 
  AND raw_text IS NOT NULL
  AND raw_text != '';

-- Show statistics after update
SELECT 
  'After extraction' as stage,
  COUNT(*) FILTER (WHERE recipient IS NOT NULL) as recipients_found,
  COUNT(*) FILTER (WHERE recipient IS NULL) as still_missing,
  COUNT(*) as total_records
FROM payment_slips;
