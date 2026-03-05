#!/bin/bash
set -e

# ContabilAI - Local Development Setup
# Usage: bash scripts/setup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "========================================="
echo " ContabilAI - Setup Local Environment"
echo "========================================="
echo ""

# 1. Create backend/.env from template if it doesn't exist
if [ ! -f backend/.env ]; then
  cp .env.example backend/.env
  echo "[OK] backend/.env created from .env.example"
  echo ""
  echo "  IMPORTANT: Edit backend/.env and fill in your credentials:"
  echo "  - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL"
  echo "  - JWT_SECRET (generate: openssl rand -hex 64)"
  echo "  - ENCRYPTION_KEY (generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
  echo "  - OPENAI_API_KEY"
  echo "  - EVOLUTION_API_KEY"
  echo "  - CONTA_AZUL_CLIENT_ID and CONTA_AZUL_CLIENT_SECRET (if using Conta Azul)"
  echo "  - OMIE_APP_KEY and OMIE_APP_SECRET (if using Omie)"
  echo ""
else
  echo "[OK] backend/.env already exists"
fi

# 2. Install backend dependencies
echo "Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install
echo "[OK] Backend dependencies installed"

# 3. Install frontend dependencies
echo "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install
echo "[OK] Frontend dependencies installed"

cd "$ROOT_DIR"

# 4. Create required directories
mkdir -p backend/logs backend/uploads
echo "[OK] Directories created (logs, uploads)"

echo ""
echo "========================================="
echo " Setup Complete!"
echo "========================================="
echo ""
echo " Next steps:"
echo ""
echo " 1. Edit backend/.env with your real credentials"
echo ""
echo " 2. Start with Docker (recommended):"
echo "    docker compose -f docker-compose.dev.yml up --build"
echo ""
echo "    OR start without Docker:"
echo "    cd backend && npm run dev"
echo "    cd frontend && npm run dev  (in another terminal)"
echo ""
echo " 3. Run database migrations:"
echo "    cd backend && npm run migrate"
echo ""
echo " 4. Seed the database (creates admin user):"
echo "    cd backend && npm run seed"
echo ""
echo " 5. Deploy n8n workflows (after n8n is running):"
echo "    cd backend && npm run deploy:workflows"
echo ""
echo " 6. Access the services:"
echo "    - Backend API:  http://localhost:3000"
echo "    - Frontend:     http://localhost:5173"
echo "    - n8n:          http://localhost:5678"
echo "    - Evolution:    http://localhost:8080"
echo "    - Health check: http://localhost:3000/api/health"
echo ""
echo " 7. Default admin login:"
echo "    Email: admin@contabilai.com"
echo "    Password: ContabilAI@2024"
echo ""
