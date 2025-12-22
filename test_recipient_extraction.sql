-- Test recipient extraction patterns without modifying data
-- This shows what would be extracted for records currently missing recipients

SELECT 
  file_name,
  amount_thb,
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
  END as extracted_recipient,
  SUBSTRING(raw_text, 1, 300) as text_preview
FROM payment_slips
WHERE recipient IS NULL 
  AND raw_text IS NOT NULL
  AND raw_text != ''
LIMIT 20;
