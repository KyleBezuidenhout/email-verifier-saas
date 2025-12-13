-- Migration: Add name and csv_file_path columns to vayne_orders table
-- Run this in Railway's database console or via psql

-- Add name column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='vayne_orders' AND column_name='name'
    ) THEN
        ALTER TABLE vayne_orders ADD COLUMN name VARCHAR(255);
        RAISE NOTICE 'Added name column to vayne_orders table';
    ELSE
        RAISE NOTICE 'name column already exists in vayne_orders table';
    END IF;
END $$;

-- Add csv_file_path column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='vayne_orders' AND column_name='csv_file_path'
    ) THEN
        ALTER TABLE vayne_orders ADD COLUMN csv_file_path VARCHAR(500);
        RAISE NOTICE 'Added csv_file_path column to vayne_orders table';
    ELSE
        RAISE NOTICE 'csv_file_path column already exists in vayne_orders table';
    END IF;
END $$;

