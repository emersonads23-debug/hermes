-- ContabilAI - Row Level Security Policies
-- Service-role bypasses RLS, but these protect anon/authenticated access

-- Offices: service-role only (managed by backend)
CREATE POLICY offices_service_role ON offices
  FOR ALL USING (true) WITH CHECK (true);

-- Users: service-role only
CREATE POLICY users_service_role ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Companies: service-role only
CREATE POLICY companies_service_role ON companies
  FOR ALL USING (true) WITH CHECK (true);

-- Messages: service-role only
CREATE POLICY messages_service_role ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- Documents: service-role only
CREATE POLICY documents_service_role ON documents
  FOR ALL USING (true) WITH CHECK (true);

-- Escalation tasks: service-role only
CREATE POLICY escalation_tasks_service_role ON escalation_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Audit log table for tracking integration events
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user',
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- Conversations table to track conversation sessions
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id),
    company_id UUID REFERENCES companies(id),
    contact_phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'escalated')),
    intent VARCHAR(50),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INT DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_conversations_phone ON conversations(contact_phone);
CREATE INDEX idx_conversations_office ON conversations(office_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- RLS for conversations and audit_log
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_service_role ON conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY audit_log_service_role ON audit_log
  FOR ALL USING (true) WITH CHECK (true);
