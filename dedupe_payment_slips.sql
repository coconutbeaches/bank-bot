-- Step 1: Remove unique constraint on file_name (run this first, before processing)
ALTER TABLE payment_slips DROP CONSTRAINT IF EXISTS payment_slips_file_name_key;

-- Step 2: After processing all slips, run this to remove duplicates
-- Keep the first occurrence of each unique transaction_ref
DELETE FROM payment_slips a USING payment_slips b
WHERE a.id > b.id 
  AND a.transaction_ref = b.transaction_ref
  AND a.transaction_ref IS NOT NULL
  AND a.transaction_ref != '';

-- Also dedupe by file_name for records without transaction_ref
DELETE FROM payment_slips a USING payment_slips b
WHERE a.id > b.id 
  AND a.file_name = b.file_name
  AND (a.transaction_ref IS NULL OR a.transaction_ref = '');

-- Step 3: Check results
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT transaction_ref) as unique_transactions,
  SUM(amount_thb) as total_amount_thb,
  MIN(date_time) as earliest_date,
  MAX(date_time) as latest_date
FROM payment_slips
WHERE transaction_ref IS NOT NULL AND transaction_ref != '';
