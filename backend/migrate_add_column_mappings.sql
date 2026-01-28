-- Migration: Add column mapping fields to jobs table
-- These store the user's manual column selections for the enrichment worker

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS column_first_name VARCHAR(255) NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS column_last_name VARCHAR(255) NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS column_website VARCHAR(255) NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS column_company_size VARCHAR(255) NULL;

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name LIKE 'column_%';
