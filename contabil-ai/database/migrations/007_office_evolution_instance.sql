-- Add Evolution API instance name per office
ALTER TABLE offices ADD COLUMN IF NOT EXISTS evolution_instance_name VARCHAR(100);
