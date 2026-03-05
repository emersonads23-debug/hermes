-- Migration: 005_ai_memory_tables
-- AI Memory System for persistent learning per company

CREATE TABLE IF NOT EXISTS ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'supplier_category',
    'expense_pattern',
    'revenue_pattern',
    'account_mapping',
    'financial_behavior'
  )),
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id, memory_type, memory_key)
);

-- Indexes for efficient queries
CREATE INDEX idx_ai_memories_company ON ai_memories(company_id);
CREATE INDEX idx_ai_memories_type ON ai_memories(memory_type);
CREATE INDEX idx_ai_memories_key ON ai_memories(memory_key);
CREATE INDEX idx_ai_memories_company_type ON ai_memories(company_id, memory_type);
CREATE INDEX idx_ai_memories_confidence ON ai_memories(confidence);

-- Enable RLS
ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_ai_memories" ON ai_memories
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ai_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_memories_updated_at
  BEFORE UPDATE ON ai_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_memories_updated_at();
