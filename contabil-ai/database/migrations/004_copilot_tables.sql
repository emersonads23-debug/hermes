-- ContabilAI - Copilot Tables Migration
-- Autonomous Financial Copilot sessions and actions

-- ============================================================
-- Copilot Sessions (analysis runs)
-- ============================================================
CREATE TABLE copilot_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'daily' CHECK (trigger_type IN (
        'daily', 'manual', 'whatsapp', 'alert_triggered', 'scheduled'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN (
        'running', 'completed', 'failed'
    )),
    input_data JSONB DEFAULT '{}',
    summary TEXT,
    recommendations JSONB DEFAULT '[]',
    risks_detected INTEGER DEFAULT 0,
    actions_taken INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_copilot_sessions_company ON copilot_sessions(company_id);
CREATE INDEX idx_copilot_sessions_office ON copilot_sessions(office_id);
CREATE INDEX idx_copilot_sessions_created ON copilot_sessions(created_at DESC);
CREATE INDEX idx_copilot_sessions_status ON copilot_sessions(status);

-- ============================================================
-- Copilot Actions (individual actions taken by copilot)
-- ============================================================
CREATE TABLE copilot_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES copilot_sessions(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'risk_detected', 'recommendation', 'alert_sent', 'task_created',
        'whatsapp_sent', 'email_sent', 'insight_stored'
    )),
    risk_type VARCHAR(50),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    description TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_copilot_actions_session ON copilot_actions(session_id);
CREATE INDEX idx_copilot_actions_company ON copilot_actions(company_id);
CREATE INDEX idx_copilot_actions_office ON copilot_actions(office_id);
CREATE INDEX idx_copilot_actions_type ON copilot_actions(action_type);
CREATE INDEX idx_copilot_actions_severity ON copilot_actions(severity) WHERE severity IN ('warning', 'critical');
CREATE INDEX idx_copilot_actions_created ON copilot_actions(created_at DESC);

-- ============================================================
-- RLS for copilot tables
-- ============================================================
ALTER TABLE copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_copilot_sessions ON copilot_sessions FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_copilot_actions ON copilot_actions FOR ALL
    USING (auth.role() = 'service_role');
