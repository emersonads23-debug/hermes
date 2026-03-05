-- Migration 008: Restructure for correct business logic
-- Users get WhatsApp phone number (instead of separate whatsapp_contacts table)
-- Integration tokens move to company_id (each company has its own ERP credentials)

-- 1. Add phone (WhatsApp) to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- 2. Add company_id to integration_tokens (each company has its own credentials)
ALTER TABLE integration_tokens ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- 3. Drop the old unique constraint and create new one
ALTER TABLE integration_tokens DROP CONSTRAINT IF EXISTS integration_tokens_office_id_provider_key;
-- New: unique per company+provider (company_id is the main key now)
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_tokens_company_provider
  ON integration_tokens(company_id, provider) WHERE company_id IS NOT NULL;
-- Keep backward compat: unique per office+provider where company_id is null
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_tokens_office_provider_legacy
  ON integration_tokens(office_id, provider) WHERE company_id IS NULL;
