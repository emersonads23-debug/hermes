-- Add metadata JSONB column to integration_tokens for storing provider-specific config
-- (e.g. Conta Azul client_id, client_secret per company)
ALTER TABLE integration_tokens ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
