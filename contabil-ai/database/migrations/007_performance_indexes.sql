-- Performance indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_messages_office_id ON messages(office_id);
CREATE INDEX IF NOT EXISTS idx_documents_office_id ON documents(office_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_financial_insights_company_created ON financial_insights(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memories_company_confidence ON ai_memories(company_id, confidence DESC) WHERE status = 'active';
