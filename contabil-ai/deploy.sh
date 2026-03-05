#!/bin/bash
set -e

# ============================================================
# ContabilAI - Deploy Script for VPS
# ============================================================
# Usage:
#   1. Clone the repo on your VPS
#   2. cp .env.example backend/.env  (and fill in values)
#   3. chmod +x deploy.sh && ./deploy.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ContabilAI - Deploy${NC}"
echo -e "${GREEN}========================================${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Install Docker first.${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose not found. Install Docker Compose v2.${NC}"
    exit 1
fi

# Check .env file
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}backend/.env not found. Creating from .env.example...${NC}"
    cp .env.example backend/.env
    echo -e "${RED}IMPORTANT: Edit backend/.env with your actual values before continuing.${NC}"
    echo -e "${RED}Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, OPENAI_API_KEY${NC}"
    echo ""
    echo -e "Run: ${YELLOW}nano backend/.env${NC}"
    echo -e "Then run: ${YELLOW}./deploy.sh${NC} again"
    exit 1
fi

# Validate critical env vars
source <(grep -v '^#' backend/.env | grep -v '^$' | sed 's/^/export /')

MISSING=""
for var in JWT_SECRET SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
    val=$(eval echo "\$$var")
    if [ -z "$val" ] || [ "$val" = "CHANGE_ME_use_openssl_rand_hex_64" ] || [ "$val" = "CHANGE_ME_use_crypto_random_bytes_32_hex" ]; then
        MISSING="$MISSING $var"
    fi
done

if [ -n "$MISSING" ]; then
    echo -e "${RED}Missing or default values for:${MISSING}${NC}"
    echo -e "Edit ${YELLOW}backend/.env${NC} and set real values."
    exit 1
fi

# Generate secrets if still default
if [ "$JWT_SECRET" = "CHANGE_ME_use_openssl_rand_hex_64" ]; then
    NEW_JWT=$(openssl rand -hex 64)
    sed -i "s|JWT_SECRET=CHANGE_ME_use_openssl_rand_hex_64|JWT_SECRET=$NEW_JWT|" backend/.env
    echo -e "${GREEN}Generated new JWT_SECRET${NC}"
fi

# Create .env for docker-compose (root level)
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating root .env for Docker Compose...${NC}"
    REDIS_PW=$(openssl rand -hex 16)
    N8N_PW=$(openssl rand -hex 16)
    EVOL_KEY=$(openssl rand -hex 32)
    cat > .env <<EOL
REDIS_PASSWORD=${REDIS_PW}
N8N_USER=admin
N8N_PASSWORD=${N8N_PW}
EVOLUTION_API_KEY=${EVOL_KEY}
EOL
    echo -e "${GREEN}Generated root .env with random passwords${NC}"
    echo -e "${YELLOW}N8N credentials: admin / ${N8N_PW}${NC}"
    echo -e "${YELLOW}Evolution API Key: ${EVOL_KEY}${NC}"
    echo ""
    echo -e "${YELLOW}Save these credentials somewhere safe!${NC}"
fi

echo ""
echo -e "${GREEN}Building and starting containers...${NC}"
echo ""

# Build and start
docker compose build --no-cache
docker compose up -d

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Frontend:    http://$(hostname -I | awk '{print $1}')"
echo -e "Backend API: http://$(hostname -I | awk '{print $1}')/api/health"
echo -e "n8n:         http://$(hostname -I | awk '{print $1}'):5678"
echo -e "Evolution:   http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Run the Supabase migrations (see DEPLOY.md)"
echo -e "2. Create the first superadmin user"
echo -e "3. Configure WhatsApp instance in Evolution API"
echo ""
echo -e "Logs: ${YELLOW}docker compose logs -f${NC}"
echo -e "Stop: ${YELLOW}docker compose down${NC}"
