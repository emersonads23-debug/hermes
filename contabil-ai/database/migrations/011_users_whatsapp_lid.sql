-- Add whatsapp_lid column to users for LID-to-phone mapping
-- Evolution v1.8 uses LID (Linked Device ID) instead of phone numbers
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_lid VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_lid ON users(whatsapp_lid) WHERE whatsapp_lid IS NOT NULL;
