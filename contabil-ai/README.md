# ContabilAI

Assistente financeiro inteligente para escritorios de contabilidade via WhatsApp.

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  WhatsApp   │────▶│ Evolution API│────▶│   Backend   │
│  (Cliente)  │◀────│  (Baileys)   │     │  (Express)  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                    ┌──────────────┐     ┌──────┴──────┐
                    │     n8n      │◀────│   BullMQ    │
                    │ (Automacoes) │     │   (Redis)   │
                    └──────────────┘     └──────┬──────┘
                                                │
┌─────────────┐     ┌──────────────┐     ┌──────┴──────┐
│  Frontend   │────▶│   Supabase   │◀────│   OpenAI    │
│  (React)    │     │ (PostgreSQL) │     │  (GPT-4o)   │
└─────────────┘     └──────────────┘     └─────────────┘
```

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | React + Vite + Recharts |
| Database | Supabase (PostgreSQL) |
| Filas | Redis + BullMQ |
| AI | OpenAI GPT-4o, Whisper |
| WhatsApp | Evolution API (Baileys) |
| Automacoes | n8n |
| ERPs | Conta Azul (OAuth), Omie (API) |

## Modulos

### Financial Agent Engine (`backend/src/agents/`)
Motor de inteligencia financeira que analisa dados e gera insights:
- Analise de fluxo de caixa
- Tendencias de receita/despesa
- Envelhecimento de contas a receber
- Previsao de contas a pagar
- Gera alertas, recomendacoes e resumos

### Financial Memory (`backend/src/analysis/`)
Sistema de memoria que armazena historico financeiro:
- Snapshots diarios dos dados financeiros
- Deteccao de padroes (sazonalidade, tendencias)
- Contexto financeiro para cada empresa

### Document Intelligence (`backend/src/ocr/`)
Processamento inteligente de documentos:
- Classificacao automatica (NF, boleto, recibo, contrato)
- Extracao de campos (fornecedor, valor, data)
- Se confianca < 80%, cria tarefa para revisao humana

### Alert Engine (`backend/src/alerts/`)
Sistema de regras para alertas:
- Fluxo de caixa negativo
- Faturas vencidas
- Pico de despesas
- Queda de receita
- Entrega via WhatsApp, email e dashboard

### Autonomous Financial Copilot (`backend/src/copilot/`)
Copilot autonomo que analisa riscos e gera recomendacoes:
- Deteccao de fluxo de caixa negativo
- Deteccao de picos de despesas (>30% acima da media)
- Deteccao de queda de receita
- Envelhecimento alto de contas a receber
- Faturas grandes nao pagas
- Raciocinio via GPT-4o com recomendacoes acionaveis
- Execucao automatica apos analise diaria
- Consultas financeiras via WhatsApp
- Dashboard dedicado no frontend

### Queue System (`backend/src/queues/`)
Filas de processamento com Redis + BullMQ:
- `message_processing` - mensagens WhatsApp
- `document_processing` - classificacao de documentos
- `financial_analysis` - analises financeiras
- `copilot_analysis` - avaliacao autonoma do copilot
- `alerts` - entrega de alertas

### Human Task System
Fila de tarefas para revisao humana:
- Revisao de documentos com baixa confianca
- Escalacoes de clientes
- Validacao de dados
- Interface no dashboard admin

## Setup Local

### Pre-requisitos
- Node.js 18+
- Docker e Docker Compose

### Instalacao

```bash
# 1. Clone e setup
bash scripts/setup.sh

# 2. Edite .env com suas credenciais
cp .env.example .env
nano .env

# 3. Inicie com Docker
docker compose -f docker-compose.dev.yml up --build

# 4. Migrations e seed
cd backend
npm run migrate
npm run seed

# 5. Deploy workflows n8n
npm run deploy:workflows
```

### Servicos

| Servico | URL |
|---------|-----|
| Backend API | http://localhost:3000 |
| Frontend | http://localhost:5173 |
| n8n | http://localhost:5678 |
| Evolution API | http://localhost:8080 |
| Redis | localhost:6379 |
| Health Check | http://localhost:3000/api/health |

### Login padrao

```
Email: admin@contabilai.com
Senha: ContabilAI@2024
```

## API Endpoints

### Financeiro
```
GET  /api/financial/insights?company_id=&type=&severity=
GET  /api/financial/insights/unacknowledged
POST /api/financial/insights/:id/acknowledge
GET  /api/financial/snapshots?company_id=&days=90
GET  /api/financial/patterns?company_id=
GET  /api/financial/context/:companyId
POST /api/financial/analyze  { company_id, type }
GET  /api/financial/alerts?unread_only=true
POST /api/financial/alerts/:id/read
GET  /api/financial/alert-rules
POST /api/financial/alert-rules
PUT  /api/financial/alert-rules/:id
```

### Tarefas
```
GET  /api/tasks?status=&task_type=&assigned_to=
GET  /api/tasks/stats
GET  /api/tasks/:id
POST /api/tasks
PUT  /api/tasks/:id
POST /api/tasks/:id/assign  { user_id }
```

### Copilot
```
GET  /api/copilot/sessions?company_id=&limit=10
GET  /api/copilot/sessions/:id/actions
GET  /api/copilot/actions?limit=20&severity=
POST /api/copilot/evaluate  { company_id }
POST /api/copilot/ask       { company_id, question }
```

### Sistema
```
GET  /api/health             # Health check de todos os servicos
GET  /api/queues/stats       # Estatisticas das filas BullMQ
```

### Integracoes
```
GET  /api/integrations
GET  /api/integrations/health
GET  /api/integrations/contaazul/auth
GET  /api/integrations/contaazul/callback
POST /api/integrations/omie/credentials
```

## Scripts

```bash
npm run dev              # Desenvolvimento com hot reload
npm run migrate          # Rodar migrations
npm run migrate:status   # Status das migrations
npm run seed             # Seed do banco
npm run deploy:workflows # Deploy workflows n8n
npm run cron:daily       # Analise financeira diaria
```

## Cron Jobs

Configurar no crontab do servidor:
```cron
# Analise financeira diaria as 6h
0 6 * * * cd /app && node src/scripts/daily-cron.js >> logs/cron.log 2>&1
```

## Estrutura de Diretorios

```
contabil-ai/
├── backend/
│   └── src/
│       ├── agents/          # Financial Agent Engine
│       ├── alerts/          # Alert Engine
│       ├── analysis/        # Financial Memory + Daily Analysis
│       ├── config/          # Database, Supabase, Logger, OpenAI
│       ├── controllers/     # Route handlers
│       ├── middleware/       # Auth, Rate Limiting, Validation
│       ├── ocr/             # Document Intelligence
│       ├── queues/          # Redis + BullMQ workers
│       ├── copilot/         # Autonomous Financial Copilot
│       ├── tasks/           # Human Task Engine (taskManager)
│       ├── routes/          # Express routes
│       ├── scripts/         # CLI tools (migrate, seed, cron)
│       ├── services/        # Business logic
│       └── utils/           # Crypto, helpers
├── frontend/
│   └── src/
│       ├── components/      # Layout, Modal
│       ├── context/         # AuthContext
│       ├── pages/           # Dashboard, Financial, Tasks, etc.
│       └── services/        # API client
├── database/
│   ├── migrations/          # SQL migrations
│   └── seeds/               # Seed data
├── automations/
│   └── workflows/           # n8n workflow JSON files
├── scripts/                 # Setup scripts
├── docker-compose.yml       # Production
├── docker-compose.dev.yml   # Development
└── .env.example             # Environment template
```

## Escalabilidade

- **Filas BullMQ**: processamento assincrono com retry automatico
- **Connection Pooling**: pool PostgreSQL com 20 conexoes
- **Rate Limiting**: por rota, por tenant (office_id)
- **Batch Processing**: analise diaria processa empresas em lotes de 10
- **Graceful Shutdown**: fecha conexoes e workers ao encerrar
- **Logs estruturados**: request tracing com Winston

Projetado para suportar:
- 1000+ escritorios de contabilidade
- 10000+ empresas clientes
- 100000+ usuarios

### Escalabilidade Horizontal
- Backend stateless (JWT auth, sem sessoes em memoria)
- Redis como broker de filas (pode ser Redis Cluster)
- Supabase PostgreSQL com connection pooling
- Workers BullMQ podem rodar em processos separados
- Docker Compose pronto para orquestracao (Kubernetes-ready)
