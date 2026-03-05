-- ContabilAI - Advanced AI Tables Migration
-- Financial insights, snapshots, patterns, tasks queue, alerts

-- ============================================================
-- Financial Insights (AI-generated analysis results)
-- ============================================================
CREATE TABLE financial_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN (
        'cash_flow_alert', 'revenue_trend', 'expense_trend',
        'receivable_aging', 'payable_forecast', 'recommendation',
        'financial_summary', 'anomaly', 'seasonality'
    )),
    severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_company ON financial_insights(company_id);
CREATE INDEX idx_insights_office ON financial_insights(office_id);
CREATE INDEX idx_insights_type ON financial_insights(insight_type);
CREATE INDEX idx_insights_severity ON financial_insights(severity) WHERE severity IN ('warning', 'critical');
CREATE INDEX idx_insights_created ON financial_insights(created_at DESC);

-- ============================================================
-- Financial Snapshots (daily ERP data capture for memory)
-- ============================================================
CREATE TABLE financial_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    data JSONB NOT NULL,
    -- Denormalized summary fields for fast queries
    total_revenue NUMERIC(15,2) DEFAULT 0,
    total_expenses NUMERIC(15,2) DEFAULT 0,
    cash_balance NUMERIC(15,2) DEFAULT 0,
    accounts_receivable NUMERIC(15,2) DEFAULT 0,
    accounts_payable NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, snapshot_date)
);

CREATE INDEX idx_snapshots_company_date ON financial_snapshots(company_id, snapshot_date DESC);
CREATE INDEX idx_snapshots_office ON financial_snapshots(office_id);

-- ============================================================
-- Financial Patterns (AI-detected patterns over time)
-- ============================================================
CREATE TABLE financial_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN (
        'seasonality', 'declining_revenue', 'increasing_expenses',
        'payment_delay', 'growth_trend', 'cash_flow_cycle',
        'expense_spike', 'revenue_concentration'
    )),
    description TEXT NOT NULL,
    confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    data JSONB DEFAULT '{}',
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patterns_company ON financial_patterns(company_id);
CREATE INDEX idx_patterns_type ON financial_patterns(pattern_type);
CREATE INDEX idx_patterns_active ON financial_patterns(active) WHERE active = true;

CREATE TRIGGER trg_patterns_updated_at BEFORE UPDATE ON financial_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Upgrade documents table with classification fields
-- ============================================================
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(500),
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS file_size INTEGER,
    ADD COLUMN IF NOT EXISTS classification VARCHAR(50) CHECK (classification IN (
        'invoice', 'receipt', 'bank_slip', 'contract',
        'tax_document', 'statement', 'report', 'other', 'unknown'
    )),
    ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS supplier VARCHAR(255),
    ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS document_date DATE,
    ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN (
        'pending', 'processing', 'completed', 'failed', 'needs_review'
    )),
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_documents_classification ON documents(classification);
CREATE INDEX idx_documents_processing ON documents(processing_status);

-- ============================================================
-- Tasks (human task queue)
-- ============================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN (
        'document_review', 'escalation', 'data_validation',
        'client_followup', 'alert_review', 'manual_entry', 'other'
    )),
    title VARCHAR(500) NOT NULL,
    message TEXT,
    attachment VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled'
    )),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to UUID REFERENCES users(id),
    source_type VARCHAR(30),
    source_id UUID,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_office ON tasks(office_id);
CREATE INDEX idx_tasks_company ON tasks(company_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_priority ON tasks(priority) WHERE status IN ('pending', 'in_progress');

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Alert Rules (configurable alert conditions)
-- ============================================================
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (
        'cash_flow_negative', 'invoice_overdue', 'expense_spike',
        'revenue_drop', 'payment_due', 'custom'
    )),
    name VARCHAR(255) NOT NULL,
    condition JSONB NOT NULL DEFAULT '{}',
    channels TEXT[] NOT NULL DEFAULT ARRAY['dashboard'],
    active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_office ON alert_rules(office_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(active) WHERE active = true;

CREATE TRIGGER trg_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Alert History (sent alerts log)
-- ============================================================
CREATE TABLE alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    channels TEXT[] NOT NULL DEFAULT ARRAY['dashboard'],
    delivered JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_history_office ON alert_history(office_id);
CREATE INDEX idx_alert_history_company ON alert_history(company_id);
CREATE INDEX idx_alert_history_unread ON alert_history(office_id) WHERE read = false;
CREATE INDEX idx_alert_history_created ON alert_history(created_at DESC);

-- ============================================================
-- RLS for new tables
-- ============================================================
ALTER TABLE financial_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY service_role_insights ON financial_insights FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_snapshots ON financial_snapshots FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_patterns ON financial_patterns FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_tasks ON tasks FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_alert_rules ON alert_rules FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY service_role_alert_history ON alert_history FOR ALL
    USING (auth.role() = 'service_role');
