#!/bin/bash
# Script para limpar worktrees órfãos do Cursor

echo "🔍 Verificando worktrees do Git..."
cd ~/Downloads/fca-mtr
git worktree list

echo ""
echo "🧹 Removendo worktrees do Git..."
for wt in /Users/jairfahl/.cursor/worktrees/fca-mtr/*; do
  if [ -d "$wt" ] && [ -f "$wt/.git" ]; then
    echo "Removendo worktree Git: $wt"
    git worktree remove --force "$wt" 2>/dev/null || true
  fi
done

echo ""
echo "🧹 Limpando metadados órfãos..."
git worktree prune

echo ""
echo "🗑️  Removendo diretórios residuais..."
# Tenta remover, mas pode falhar se Cursor estiver usando
rm -rf ~/.cursor/worktrees/fca-mtr/blh 2>/dev/null || echo "⚠️  Não foi possível remover blh (pode estar em uso)"
rm -rf ~/.cursor/worktrees/fca-mtr/bmm 2>/dev/null || echo "⚠️  Não foi possível remover bmm (pode estar em uso)"
rm -rf ~/.cursor/worktrees/fca-mtr/pcv 2>/dev/null || echo "⚠️  Não foi possível remover pcv (pode estar em uso)"

echo ""
echo "✅ Verificação final:"
git worktree list

echo ""
echo "📋 Próximos passos:"
echo "1. Feche o Cursor COMPLETAMENTE (Cmd+Q)"
echo "2. Execute novamente este script se necessário"
echo "3. Reabra o Cursor"
echo "4. Abra APENAS: ~/Downloads/fca-mtr"
