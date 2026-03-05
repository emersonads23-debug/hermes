# ContabilAI - Guia Completo de Setup

Guia passo a passo para rodar a plataforma ContabilAI localmente e em producao.

---

## Indice

1. [Pre-requisitos](#1-pre-requisitos)
2. [Componentes do Sistema](#2-componentes-do-sistema)
3. [Setup Local (Desenvolvimento)](#3-setup-local-desenvolvimento)
4. [Configuracao do Supabase](#4-configuracao-do-supabase)
5. [Variaveis de Ambiente](#5-variaveis-de-ambiente)
6. [Iniciar com Docker](#6-iniciar-com-docker)
7. [Workers e Filas](#7-workers-e-filas)
8. [Setup do n8n](#8-setup-do-n8n)
9. [Setup do Evolution API (WhatsApp)](#9-setup-do-evolution-api-whatsapp)
10. [Testes e Validacao](#10-testes-e-validacao)
11. [Deploy em Producao (VPS)](#11-deploy-em-producao-vps)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Pre-requisitos

### Software necessario

| Software | Versao minima | Para que serve |
|----------|--------------|----------------|
| Node.js | 18+ | Backend e frontend |
| Docker | 24+ | Containers dos servicos |
| Docker Compose | v2+ | Orquestracao |
| Git | 2.30+ | Versionamento |

### Contas externas necessarias

| Servico | URL | Obrigatorio |
|---------|-----|-------------|
| Supabase | https://supabase.com | Sim |
| OpenAI | https://platform.openai.com | Sim |
| Conta Azul | https://developers.contaazul.com | Opcional |
| Omie | https://developer.omie.com.br | Opcional |
| Provedor SMTP | (Gmail, SendGrid, etc.) | Opcional |

---

## 2. Componentes do Sistema

```
┌────────────┐   ┌───────────────┐   ┌────────────┐
│  Frontend  │──▶│  Nginx Proxy  │──▶│  Backend   │
│  (React)   │   │  (port 80)    │   │  (port 3000│
└────────────┘   └───────────────┘   └─────┬──────┘
                                           │
         ┌─────────────────────────────────┼──────────────────┐
         │                                 │                  │
   ┌─────┴──────┐   ┌─────────────┐  ┌────┴─────┐   ┌───────┴──────┐
   │   Worker   │   │   Redis     │  │ Supabase │   │   OpenAI     │
   │  (BullMQ)  │◀─▶│  (port 6379)│  │ (cloud)  │   │   (GPT-4o)   │
   └────────────┘   └─────────────┘  └──────────┘   └──────────────┘
         │
   ┌─────┴──────┐   ┌─────────────┐
   │    n8n     │   │  Evolution  │
   │ (port 5678)│   │ (port 8080) │
   └────────────┘   └─────────────┘
```

| Servico | Porta | Descricao |
|---------|-------|-----------|
| Backend API | 3000 | Express.js, endpoints REST |
| Worker | — | Processa filas BullMQ (separado) |
| Frontend | 80/443 | React SPA via Nginx |
| Redis | 6379 | Broker de filas e cache |
| n8n | 5678 | Automacoes e workflows |
| Evolution API | 8080 | Gateway WhatsApp |
| Supabase | cloud | PostgreSQL + Auth + Storage |

---

## 3. Setup Local (Desenvolvimento)

### 3.1 Clonar e instalar

```bash
# Clonar repositorio
git clone <repo-url> contabil-ai
cd contabil-ai

# Executar setup automatico
bash scripts/setup.sh
```

O script `setup.sh` faz:
- Cria `backend/.env` a partir de `.env.example`
- Instala dependencias do backend (`npm install`)
- Instala dependencias do frontend (`npm install`)
- Cria diretorios `uploads/` e `logs/`

### 3.2 Configurar variaveis de ambiente

O arquivo `.env` fica em `backend/.env`. Docker Compose e os scripts ja apontam para esse caminho.

```bash
# Editar backend/.env com suas credenciais
nano backend/.env
```

Veja a secao [5. Variaveis de Ambiente](#5-variaveis-de-ambiente) para detalhes de cada variavel.

### 3.3 Iniciar servicos

```bash
# Iniciar tudo com Docker (recomendado)
docker compose -f docker-compose.dev.yml up --build

# OU rodar sem Docker:
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### 3.4 Rodar migrations e seed

```bash
cd backend

# Aplicar migrations do banco
npm run migrate

# Verificar status das migrations
npm run migrate:status

# Criar dados iniciais (usuario admin)
npm run seed
```

### 3.5 Acessar servicos

| Servico | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |
| n8n | http://localhost:5678 |
| Evolution API | http://localhost:8080 |

### 3.6 Login padrao

```
Email:  admin@contabilai.com
Senha:  ContabilAI@2024
```

---

## 4. Configuracao do Supabase

### 4.1 Criar projeto

1. Acesse https://supabase.com/dashboard
2. Clique em **New Project**
3. Escolha uma organizacao (ou crie uma)
4. Preencha:
   - **Name**: `contabil-ai`
   - **Database Password**: anote a senha (usada no `DATABASE_URL`)
   - **Region**: escolha a mais proxima (ex: `South America (Sao Paulo)`)
5. Clique em **Create new project**
6. Aguarde o projeto ser provisionado (~2 min)

### 4.2 Obter credenciais

Acesse **Settings > API** no dashboard do Supabase:

| Campo | Variavel no .env |
|-------|-----------------|
| Project URL | `SUPABASE_URL` |
| anon public key | `SUPABASE_ANON_KEY` |
| service_role secret key | `SUPABASE_SERVICE_ROLE_KEY` |

Para o `DATABASE_URL`, acesse **Settings > Database > Connection string > URI** e use o formato Transaction pooler (porta 6543).

### 4.3 Aplicar migrations

As migrations criam todas as tabelas necessarias:

```bash
cd backend
npm run migrate
```

Migrations incluidas:

| Arquivo | Conteudo |
|---------|---------|
| `001_initial_schema.sql` | Tabelas base: offices, companies, users, conversations, messages, escalations |
| `002_rls_policies.sql` | Row Level Security para isolamento multi-tenant |
| `003_advanced_ai_tables.sql` | financial_snapshots, financial_insights, financial_patterns, documents, tasks, alert_rules, alert_history |

### 4.4 Row Level Security (RLS)

A migration `002_rls_policies.sql` habilita RLS automaticamente em todas as tabelas. As policies garantem:

- Cada escritorio so ve seus proprios dados
- Empresas so sao visiveis para o escritorio proprietario
- Usuarios so acessam dados do seu escritorio
- Snapshots, insights e alertas respeitam o tenant

Para verificar no Supabase Dashboard:
1. Acesse **Table Editor**
2. Selecione qualquer tabela
3. Clique em **RLS policies** — deve ter policies ativas

### 4.5 Seed (dados iniciais)

```bash
cd backend
npm run seed
```

Cria:
- Escritorio de demonstracao
- Usuario admin (`admin@contabilai.com`)
- Empresa de exemplo
- Regras de alerta padrao

---

## 5. Variaveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example backend/.env
```

### Servidor

| Variavel | Descricao | Obrigatorio | Exemplo |
|----------|-----------|-------------|---------|
| `NODE_ENV` | Ambiente | Sim | `development` ou `production` |
| `PORT` | Porta do backend | Sim | `3000` |
| `API_URL` | URL publica do backend | Sim | `http://localhost:3000` |
| `FRONTEND_URL` | URL publica do frontend | Sim | `http://localhost:5173` |

### Seguranca

| Variavel | Descricao | Obrigatorio | Como gerar |
|----------|-----------|-------------|-----------|
| `JWT_SECRET` | Segredo JWT (min 64 chars) | Sim | `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | Tempo de expiracao do token | Nao | `7d` |
| `ENCRYPTION_KEY` | Chave AES-256-GCM (32 bytes hex) | Sim | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Supabase

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `SUPABASE_URL` | URL do projeto | Sim |
| `SUPABASE_ANON_KEY` | Chave publica | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servico | Sim |
| `DATABASE_URL` | Connection string PostgreSQL (usar porta 6543 do pooler) | Sim (para migrations) |

**Importante sobre Supabase keys:**
- `SUPABASE_ANON_KEY`: chave publica, usada no frontend e para operacoes do lado do cliente
- `SUPABASE_SERVICE_ROLE_KEY`: chave privada com acesso total, **nunca exponha no frontend**
- `DATABASE_URL`: use o **Transaction Pooler** (porta `6543`), nao a conexao direta (porta `5432`), para melhor gerenciamento de conexoes

Obtenha as keys em: **Supabase Dashboard > Settings > API**
Obtenha o DATABASE_URL em: **Settings > Database > Connection string > URI > Transaction pooler**

### Redis

| Variavel | Descricao | Obrigatorio | Padrao |
|----------|-----------|-------------|--------|
| `REDIS_HOST` | Host do Redis | Sim | `redis` (Docker) ou `localhost` |
| `REDIS_PORT` | Porta | Nao | `6379` |
| `REDIS_PASSWORD` | Senha | Nao | vazio |

### OpenAI

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `OPENAI_API_KEY` | API key da OpenAI | Sim |

### WhatsApp (Evolution API)

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `EVOLUTION_API_URL` | URL da Evolution API | Sim |
| `EVOLUTION_API_KEY` | Chave de autenticacao | Sim |
| `EVOLUTION_INSTANCE_NAME` | Nome da instancia | Nao (`contabil-ai`) |
| `EVOLUTION_WEBHOOK_SECRET` | HMAC secret | Nao |

### Email (SMTP)

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `SMTP_HOST` | Host SMTP | Nao |
| `SMTP_PORT` | Porta SMTP | Nao (`587`) |
| `SMTP_USER` | Usuario SMTP | Nao |
| `SMTP_PASS` | Senha SMTP | Nao |
| `EMAIL_FROM` | Remetente padrao | Nao |
| `ALERT_EMAIL_FROM` | Remetente de alertas | Nao |
| `ESCALATION_EMAIL` | Email para escalacoes | Nao |

### ERP Integracoes

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `CONTA_AZUL_CLIENT_ID` | OAuth client ID | Nao |
| `CONTA_AZUL_CLIENT_SECRET` | OAuth client secret | Nao |
| `CONTA_AZUL_REDIRECT_URI` | Callback URL | Nao |
| `OMIE_APP_KEY` | Chave do app Omie | Nao |
| `OMIE_APP_SECRET` | Secret do app Omie | Nao |

### n8n

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `N8N_WEBHOOK_URL` | URL base dos webhooks | Nao |
| `N8N_USER` | Usuario admin do n8n | Nao (`admin`) |
| `N8N_PASSWORD` | Senha admin do n8n | Nao |

---

## 6. Iniciar com Docker

### 6.1 Desenvolvimento

```bash
docker compose -f docker-compose.dev.yml up --build
```

Servicos iniciados:
- **backend** — com hot reload via nodemon, volume montado no src/
- **redis** — sem senha, porta exposta
- **n8n** — com interface web
- **evolution** — gateway WhatsApp

### 6.2 Producao

**Importante:** O Docker Compose usa duas fontes de variaveis:
- `env_file: ./backend/.env` — injeta variaveis dentro dos containers
- `.env` na raiz do projeto — usada para interpolacao no YAML (`${VAR:-default}`)

Para producao com senha no Redis, exporte a variavel antes de subir:

```bash
# Opcao A: exportar na shell
export REDIS_PASSWORD=sua-senha-forte
docker compose up --build -d

# Opcao B: criar .env na raiz so com variaveis do Compose
echo "REDIS_PASSWORD=sua-senha-forte" > .env
docker compose up --build -d
```

Servicos adicionais em producao:
- **worker** — processo separado para filas BullMQ
- **frontend** — SPA servida via Nginx com proxy reverso

### 6.3 Verificar status

```bash
# Status dos containers
docker compose ps

# Logs de todos os servicos
docker compose logs -f

# Logs de um servico especifico
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f redis
```

### 6.4 Volumes persistentes

| Volume | Servico | Conteudo |
|--------|---------|----------|
| `redis_data` | Redis | Dados das filas (AOF) |
| `n8n_data` | n8n | Workflows e credenciais |
| `evolution_data` | Evolution | Sessoes WhatsApp |
| `uploads` | Backend | Documentos enviados |
| `logs` | Backend/Worker | Logs da aplicacao |

### 6.5 Escalar workers

Para maior throughput, escale o worker:

```bash
docker compose up --scale worker=3 -d
```

Cada worker processa as 4 filas (message_processing, document_processing, financial_analysis, alerts) com concorrencia configurada.

---

## 7. Workers e Filas

### 7.1 Filas BullMQ

| Fila | Processamento | Concorrencia |
|------|---------------|-------------|
| `message_processing` | Mensagens WhatsApp (classificacao de intent, resposta AI) | 5 |
| `document_processing` | OCR + classificacao de documentos (NF, boleto, recibo, contrato) | 3 |
| `financial_analysis` | Analise diaria, cash flow, tendencias, padroes | 2 |
| `alerts` | Entrega de alertas (WhatsApp, email, dashboard) | 5 |

### 7.2 Retry e error handling

Todas as filas tem:
- **3 tentativas** com backoff exponencial (2s, 4s, 8s)
- **Rate limit**: 10 jobs/segundo por fila
- **Auto-cleanup**: mantem 1000 jobs completos e 5000 falhados
- **Logs estruturados**: cada job logado com ID, fila e resultado

### 7.3 Worker standalone

Em producao, o worker roda como processo separado usando `Dockerfile.worker`:

```bash
# Build e rodar worker separadamente
docker build -f backend/Dockerfile.worker -t contabilai-worker ./backend
docker run --env-file .env -e REDIS_HOST=redis --network contabilai contabilai-worker
```

### 7.4 Monitorar filas

```bash
# Via API
curl http://localhost:3000/api/queues/stats | jq

# Resposta esperada:
# {
#   "configured": true,
#   "queues": {
#     "MESSAGE_PROCESSING": { "waiting": 0, "active": 0, "completed": 15, "failed": 0, "delayed": 0 },
#     "DOCUMENT_PROCESSING": { "waiting": 2, "active": 1, "completed": 8, "failed": 0, "delayed": 0 },
#     "FINANCIAL_ANALYSIS": { "waiting": 0, "active": 0, "completed": 5, "failed": 0, "delayed": 0 },
#     "ALERTS": { "waiting": 0, "active": 0, "completed": 3, "failed": 1, "delayed": 0 }
#   }
# }
```

---

## 8. Setup do n8n

### 8.1 Acessar interface

1. Abra http://localhost:5678
2. Login com as credenciais definidas em `N8N_USER` / `N8N_PASSWORD`

### 8.2 Importar workflows

**Opcao A — Via script automatico:**

```bash
cd backend
npm run deploy:workflows
```

**Opcao B — Via interface manual:**

1. No n8n, clique em **Workflows > Import from file**
2. Importe cada arquivo de `automations/workflows/`:
   - `message-flow.json` — Fluxo de processamento de mensagens
   - `document-flow.json` — Processamento de documentos
   - `daily-report.json` — Relatorio diario + analise financeira
3. Ative cada workflow clicando no toggle

### 8.3 Workflows disponiveis

| Workflow | Trigger | Funcao |
|----------|---------|--------|
| Message Flow | Webhook | Recebe mensagem WhatsApp > classifica intent > responde |
| Document Flow | Webhook | Recebe documento > OCR > classifica > extrai dados |
| Daily Report | Cron 6h | Health check > analise financeira > relatorio email |

### 8.4 Configurar webhooks

Os workflows usam variaveis de ambiente que ja estao configuradas no Docker:

- `BACKEND_API_URL` = `http://backend:3000` (rede interna Docker)
- `SMTP_FROM` = valor de `EMAIL_FROM`
- `ESCALATION_EMAIL` = email para relatorios

O backend envia eventos para o n8n via `N8N_WEBHOOK_URL`.

### 8.5 Conectar com backend

O n8n se comunica com o backend pela rede Docker interna. Para testar:

```bash
# De dentro do container n8n
docker exec contabilai-n8n wget -qO- http://backend:3000/api/health
```

---

## 9. Setup do Evolution API (WhatsApp)

### 9.1 Iniciar container

O Evolution API sobe automaticamente com o Docker Compose. Verifique:

```bash
curl http://localhost:8080/
```

### 9.2 Criar instancia WhatsApp

O backend cria a instancia automaticamente na inicializacao. Para criar manualmente:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -d '{
    "instanceName": "contabil-ai",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

### 9.3 Escanear QR Code

1. Acesse o endpoint de conexao:

```bash
curl http://localhost:8080/instance/connect/contabil-ai \
  -H "apikey: ${EVOLUTION_API_KEY}"
```

2. O QR code sera retornado em base64. Decodifique e escaneie com o WhatsApp.

3. Ou acesse pelo dashboard Evolution (se habilitado) em http://localhost:8080/manager

### 9.4 Verificar conexao

```bash
curl http://localhost:8080/instance/connectionState/contabil-ai \
  -H "apikey: ${EVOLUTION_API_KEY}"

# Resposta esperada:
# { "instance": { "state": "open" } }
```

### 9.5 Webhook

O webhook ja esta configurado automaticamente via variaveis de ambiente:

- **URL**: `http://backend:3000/api/webhook/evolution`
- **Eventos**: messages.upsert, connection.update, qrcode.updated

Quando uma mensagem chega:
1. Evolution envia webhook para o backend
2. Backend enfileira no `message_processing`
3. Worker processa com AI e responde

---

## 10. Testes e Validacao

### 10.1 Health check

```bash
curl -s http://localhost:3000/api/health | jq

# Resposta:
# {
#   "status": "healthy",
#   "timestamp": "2026-03-05T...",
#   "services": {
#     "database": { "healthy": true },
#     "whatsapp": { "healthy": true, "state": "open" },
#     "n8n": { "healthy": true },
#     "queues": { "healthy": true }
#   }
# }
```

### 10.2 Queue stats

```bash
curl -s http://localhost:3000/api/queues/stats | jq
```

### 10.3 Autenticacao

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contabilai.com","password":"ContabilAI@2024"}' \
  | jq -r '.token')

echo $TOKEN
```

### 10.4 Upload de documento

```bash
curl -X POST http://localhost:3000/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "contabil-ai",
    "data": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
      "message": { "conversation": "Preciso de ajuda com meu fluxo de caixa" },
      "messageTimestamp": 1709654400
    }
  }'
```

### 10.5 Teste de analise financeira

```bash
# Disparar analise manual (requer token)
curl -X POST http://localhost:3000/api/financial/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"company_id":"<company-uuid>","type":"cash-flow"}'
```

### 10.6 Listar tarefas

```bash
curl -s http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 10.7 Listar alertas

```bash
curl -s "http://localhost:3000/api/financial/alerts?unread_only=true" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 10.8 Teste de integridade completo

```bash
# Script de teste rapido
echo "=== ContabilAI Health Check ==="
echo ""

echo -n "Backend API: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
echo ""

echo -n "Queue Stats: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/queues/stats
echo ""

echo -n "n8n: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:5678/
echo ""

echo -n "Evolution: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
echo ""

echo -n "Redis: "
docker exec contabilai-redis redis-cli ping
echo ""
```

---

## 11. Deploy em Producao (VPS)

### 11.1 Requisitos do servidor

| Recurso | Minimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04+ | Ubuntu 24.04 |

### 11.2 Setup inicial do servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Instalar Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Instalar Certbot (SSL)
sudo apt install certbot -y

# Criar usuario da aplicacao
sudo useradd -m -s /bin/bash contabilai
sudo usermod -aG docker contabilai
su - contabilai
```

### 11.3 Clonar e configurar

```bash
# Como usuario contabilai
git clone <repo-url> ~/contabil-ai
cd ~/contabil-ai

# Copiar e editar .env
cp .env.example .env
nano .env
```

Altere no `.env`:
```bash
NODE_ENV=production
API_URL=https://seu-dominio.com
FRONTEND_URL=https://seu-dominio.com
JWT_SECRET=<gerar com openssl rand -hex 64>
ENCRYPTION_KEY=<gerar com node crypto>
REDIS_PASSWORD=<senha-forte-para-redis>
EVOLUTION_API_KEY=<gerar chave segura>
N8N_PASSWORD=<senha-forte-para-n8n>
```

### 11.4 Configurar dominio

1. Aponte seu dominio (DNS A record) para o IP do servidor
2. Gere certificado SSL:

```bash
sudo certbot certonly --standalone -d seu-dominio.com
```

3. Use a configuracao Nginx de producao:

```bash
cp docker/nginx/production.conf docker/nginx/default.conf

# Substituir dominio
sed -i 's/YOUR_DOMAIN.com/seu-dominio.com/g' docker/nginx/default.conf
```

4. Monte o certificado no docker-compose.yml (adicione ao servico frontend):

```yaml
frontend:
  volumes:
    - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
  ports:
    - "80:80"
    - "443:443"
```

### 11.5 Build e deploy

```bash
cd ~/contabil-ai

# Build e iniciar
docker compose up --build -d

# Rodar migrations
docker exec contabilai-backend node src/scripts/migrate.js

# Seed (primeira vez)
docker exec contabilai-backend node src/scripts/seed.js

# Deploy workflows n8n
docker exec contabilai-backend node src/scripts/deploy-workflows.js

# Verificar
docker compose ps
curl -s https://seu-dominio.com/api/health | jq
```

### 11.6 Cron job para analise diaria

```bash
# Adicionar ao crontab do servidor
crontab -e

# Analise financeira diaria as 6h (horario Sao Paulo)
0 6 * * * cd /home/contabilai/contabil-ai && docker exec contabilai-backend node src/scripts/daily-cron.js >> /home/contabilai/contabil-ai/cron.log 2>&1

# Renovar certificado SSL (a cada 2 meses)
0 3 1 */2 * certbot renew --quiet && docker compose -f /home/contabilai/contabil-ai/docker-compose.yml restart frontend
```

### 11.7 Renovacao automatica de SSL

```bash
# Testar renovacao
sudo certbot renew --dry-run
```

### 11.8 Seguranca do servidor

```bash
# Firewall (UFW)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# NAO exponha Redis (6379) ou n8n (5678) externamente
# Eles se comunicam pela rede Docker interna
```

### 11.9 Monitoramento

```bash
# Logs em tempo real
docker compose logs -f --tail=100

# Uso de recursos
docker stats

# Espaco em disco dos volumes
docker system df -v
```

### 11.10 Backup

```bash
# Backup dos volumes Docker
docker run --rm -v contabil-ai_redis_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/redis-$(date +%Y%m%d).tar.gz /data
docker run --rm -v contabil-ai_n8n_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/n8n-$(date +%Y%m%d).tar.gz /data

# O banco Supabase tem backup automatico no plano Pro
```

---

## 12. Troubleshooting

### Backend nao inicia

```bash
# Verificar logs
docker compose logs backend

# Problemas comuns:
# - SUPABASE_URL nao configurado -> editar .env
# - JWT_SECRET = dev-secret em producao -> gerar novo
# - Redis nao acessivel -> verificar container redis
```

### Worker nao processa jobs

```bash
# Verificar se Redis esta rodando
docker exec contabilai-redis redis-cli ping
# Resposta: PONG

# Verificar logs do worker
docker compose logs worker

# Verificar filas
curl -s http://localhost:3000/api/queues/stats | jq
```

### WhatsApp nao conecta

```bash
# Verificar status da instancia
curl http://localhost:8080/instance/connectionState/contabil-ai \
  -H "apikey: $EVOLUTION_API_KEY"

# Se state != "open", reconectar:
curl http://localhost:8080/instance/connect/contabil-ai \
  -H "apikey: $EVOLUTION_API_KEY"
# Escanear QR code novamente
```

### Migrations falham

```bash
# Verificar conexao com banco
docker exec contabilai-backend node -e "
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT NOW()').then(r => { console.log('OK:', r.rows[0]); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"

# Verificar status das migrations
docker exec contabilai-backend node src/scripts/migrate.js --status
```

### n8n nao recebe webhooks

```bash
# Testar conectividade interna
docker exec contabilai-n8n wget -qO- http://backend:3000/api/health

# Verificar que BACKEND_API_URL esta correto
docker exec contabilai-n8n env | grep BACKEND
```

### Redis sem memoria

```bash
# Verificar uso de memoria
docker exec contabilai-redis redis-cli info memory | grep used_memory_human

# Limpar jobs antigos
docker exec contabilai-redis redis-cli FLUSHDB
# CUIDADO: remove todos os dados do Redis
```
