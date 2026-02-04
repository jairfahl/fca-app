#!/bin/bash
# Script para gerar evidências dos cenários DB_SSL_RELAXED
# Uso: ./scripts/test-db-ssl-evidence.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
API_DIR="$REPO_ROOT/apps/api"

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "DB_SSL_RELAXED - Evidence Generation"
echo "=========================================="
echo ""

# Verificar se .env existe
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}ERRO: Arquivo .env não encontrado em $ENV_FILE${NC}"
    exit 1
fi

# Backup do .env original
ENV_BACKUP="$ENV_FILE.backup.$(date +%s)"
cp "$ENV_FILE" "$ENV_BACKUP"
echo -e "${YELLOW}Backup do .env criado: $ENV_BACKUP${NC}"
echo ""

# Função para restaurar .env
restore_env() {
    if [ -f "$ENV_BACKUP" ]; then
        cp "$ENV_BACKUP" "$ENV_FILE"
        echo -e "${GREEN}.env restaurado${NC}"
    fi
}

# Trap para restaurar .env em caso de erro
trap restore_env EXIT

# Função para testar cenário
test_scenario() {
    local scenario_name="$1"
    local node_env="$2"
    local db_ssl_relaxed="$3"
    local expected_result="$4"
    
    echo "=========================================="
    echo "Cenário: $scenario_name"
    echo "=========================================="
    echo "NODE_ENV=$node_env"
    echo "DB_SSL_RELAXED=$db_ssl_relaxed"
    echo "Esperado: $expected_result"
    echo ""
    
    # Atualizar .env temporariamente
    # Remover linhas existentes
    sed -i.bak '/^NODE_ENV=/d' "$ENV_FILE"
    sed -i.bak '/^DB_SSL_RELAXED=/d' "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    
    # Adicionar novas linhas
    echo "NODE_ENV=$node_env" >> "$ENV_FILE"
    if [ "$db_ssl_relaxed" != "unset" ]; then
        echo "DB_SSL_RELAXED=$db_ssl_relaxed" >> "$ENV_FILE"
    fi
    
    echo -e "${YELLOW}Executando teste...${NC}"
    echo ""
    
    # Executar server.js e capturar output (timeout de 10s)
    cd "$API_DIR"
    timeout 10s node src/server.js 2>&1 | tee /tmp/db-ssl-test-output.txt || true
    
    echo ""
    echo "--- Output capturado ---"
    grep -E "\[DB\]|DB CHECK|FATAL|SSL_MODE" /tmp/db-ssl-test-output.txt || echo "(nenhum log relevante encontrado)"
    echo ""
    
    # Verificar resultado esperado
    if grep -q "$expected_result" /tmp/db-ssl-test-output.txt; then
        echo -e "${GREEN}✅ Resultado esperado encontrado${NC}"
    else
        echo -e "${RED}❌ Resultado esperado NÃO encontrado${NC}"
    fi
    
    echo ""
    echo "Pressione Enter para continuar para o próximo cenário..."
    read -r
    echo ""
}

# Cenário A: Development + RELAXED
test_scenario \
    "A: Development + RELAXED" \
    "development" \
    "true" \
    "SSL_MODE=RELAXED"

# Cenário B: Development + STRICT
test_scenario \
    "B: Development + STRICT" \
    "development" \
    "false" \
    "SSL_MODE=STRICT"

# Cenário C: Production + RELAXED (deve falhar)
test_scenario \
    "C: Production + RELAXED (fail-closed)" \
    "production" \
    "true" \
    "DB_SSL_RELAXED=true não é permitido em produção"

echo "=========================================="
echo "Testes concluídos"
echo "=========================================="
echo ""
echo "Evidências salvas em:"
echo "  - /tmp/db-ssl-test-output.txt (último output)"
echo "  - $ENV_BACKUP (backup do .env original)"
echo ""
echo "Para gerar evidências completas, execute cada cenário individualmente"
echo "e capture os logs completos."
echo ""

# Restaurar .env
restore_env
trap - EXIT
