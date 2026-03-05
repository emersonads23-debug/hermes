-- Fix: replace partial unique index with a real unique constraint for upsert to work
DROP INDEX IF EXISTS idx_integration_tokens_company_provider;
ALTER TABLE integration_tokens ADD CONSTRAINT integration_tokens_company_provider_unique UNIQUE (company_id, provider);
