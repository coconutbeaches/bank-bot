-- Clear the table to restart with raw_text capture
TRUNCATE TABLE payment_slips RESTART IDENTITY CASCADE;

-- Verify it's empty
SELECT COUNT(*) as row_count FROM payment_slips;
