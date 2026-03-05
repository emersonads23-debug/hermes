# ContabilAI - Guia de Deploy na VPS

## Pre-requisitos

- VPS com Docker e Docker Compose v2 instalados
- Projeto Supabase criado (plano gratuito funciona)
- Chave da OpenAI API

## 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Anote as credenciais em **Settings > API**:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_ANON_KEY` (anon public)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role secret)
3. Em **Settings > Database > Connection string > URI**, copie a `DATABASE_URL`

## 2. Rodar as migrations

No **SQL Editor** do Supabase, execute os arquivos SQL **na ordem**:

```
database/migrations/001_initial_schema.sql
database/migrations/002_rls_policies.sql
database/migrations/003_advanced_ai_tables.sql
database/migrations/004_copilot_tables.sql
database/migrations/005_ai_memory_tables.sql
database/migrations/006_continuous_learning.sql
```

> Copie o conteudo de cada arquivo e execute no SQL Editor do Supabase, um por vez.

## 3. Clonar e configurar na VPS

```bash
# Clonar o repositorio
git clone <url-do-repo> contabil-ai
cd contabil-ai

# Copiar e editar as variaveis de ambiente
cp .env.example backend/.env
nano backend/.env
```

### Variaveis obrigatorias no `backend/.env`:

| Variavel | Onde encontrar |
|----------|---------------|
| `JWT_SECRET` | Gere com: `openssl rand -hex 64` |
| `ENCRYPTION_KEY` | Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API |
| `DATABASE_URL` | Supabase Dashboard > Settings > Database > URI |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |

### Variaveis importantes a ajustar:

```env
NODE_ENV=production
API_URL=http://SEU_IP:3000
FRONTEND_URL=http://SEU_IP
REDIS_HOST=redis
N8N_WEBHOOK_URL=http://n8n:5678/webhook
EVOLUTION_API_URL=http://evolution:8080
```

> **REDIS_HOST deve ser `redis`** (nome do container no Docker Compose).

## 4. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

O script vai:
- Validar que as variaveis estao configuradas
- Gerar senhas para Redis, n8n e Evolution API automaticamente
- Buildar e subir todos os containers

## 5. Criar superadmin

Apos os containers estarem rodando:

```bash
docker exec -it contabilai-backend node -e "
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createAdmin() {
  const hash = await bcrypt.hash('SUA_SENHA_AQUI', 12);
  const { data, error } = await supabase.from('offices').insert({
    name: 'Escritorio Principal',
    cnpj: '00000000000000',
    email: 'admin@contabilai.com'
  }).select().single();

  if (error) { console.error(error); return; }

  const { error: userErr } = await supabase.from('users').insert({
    office_id: data.id,
    name: 'Admin',
    email: 'admin@contabilai.com',
    password_hash: hash,
    role: 'superadmin'
  });

  if (userErr) console.error(userErr);
  else console.log('Superadmin criado! Email: admin@contabilai.com');
}
createAdmin();
"
```

> Troque `SUA_SENHA_AQUI` pela senha desejada.

## 6. Verificar

- **Frontend**: `http://SEU_IP` - Deve mostrar a tela de login
- **API Health**: `http://SEU_IP/api/health`
- **n8n**: `http://SEU_IP:5678` - Use as credenciais geradas no deploy
- **Evolution**: `http://SEU_IP:8080` - Configure a instancia WhatsApp

## Comandos uteis

```bash
# Ver logs de todos os containers
docker compose logs -f

# Ver logs de um container especifico
docker compose logs -f backend

# Reiniciar um servico
docker compose restart backend

# Parar tudo
docker compose down

# Atualizar (apos git pull)
docker compose build --no-cache && docker compose up -d

# Ver status
docker compose ps
```

## Seguranca na VPS

Configure o firewall para expor apenas as portas necessarias:

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # Frontend (HTTP)
sudo ufw allow 443/tcp   # Frontend (HTTPS - futuro)
sudo ufw allow 5678/tcp  # n8n (opcional, pode remover depois)
sudo ufw allow 8080/tcp  # Evolution API
sudo ufw enable
```

> **Nao exponha** a porta 6379 (Redis) publicamente.
