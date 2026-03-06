-- Add Evolution API instance fields and bot name to offices table
-- Each office can have its own Evolution API instance for WhatsApp communication

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS evolution_instance_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS evolution_api_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS evolution_instance_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bot_name VARCHAR(100) DEFAULT 'Assistente ContabilAI';
