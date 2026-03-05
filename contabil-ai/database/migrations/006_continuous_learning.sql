-- Migration: 006_continuous_learning
-- Extend AI Memory System with Continuous Learning

-- Add new fields to ai_memories
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE ai_memories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'candidate', 'deprecated'));

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_ai_memories_status ON ai_memories(status);
CREATE INDEX IF NOT EXISTS idx_ai_memories_last_used ON ai_memories(last_used_at);

-- Memory metrics table for daily tracking
CREATE TABLE IF NOT EXISTS memory_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  memory_hits INTEGER NOT NULL DEFAULT 0,
  memory_misses INTEGER NOT NULL DEFAULT 0,
  new_memories_created INTEGER NOT NULL DEFAULT 0,
  confidence_updates INTEGER NOT NULL DEFAULT 0,
  deprecated_count INTEGER NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  UNIQUE(company_id, date)
);

CREATE INDEX idx_memory_metrics_company ON memory_metrics(company_id);
CREATE INDEX idx_memory_metrics_date ON memory_metrics(date);

-- Enable RLS
ALTER TABLE memory_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_memory_metrics" ON memory_metrics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RPC function to atomically increment memory usage count
CREATE OR REPLACE FUNCTION increment_memory_usage(memory_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ai_memories
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
