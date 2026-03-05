-- Add Evolution API instance name and bot name per office
ALTER TABLE offices ADD COLUMN IF NOT EXISTS evolution_instance_name VARCHAR(100);
ALTER TABLE offices ADD COLUMN IF NOT EXISTS bot_name VARCHAR(100) DEFAULT 'ContabilAI';
