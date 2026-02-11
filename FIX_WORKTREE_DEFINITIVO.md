# 🔧 Solução Definitiva: "Worktree not found"

## Problema
O Cursor continua criando worktrees automáticos que causam conflitos e erros "Worktree not found".

## Solução Aplicada

### 1. Worktrees Removidos do Git
✅ Todos os worktrees foram removidos do Git
✅ Apenas o repo principal está ativo: `~/Downloads/fca-mtr`

### 2. Configurações Criadas
- `.cursorrules` - Regras para o Cursor
- `.vscode/settings.json` - Configurações do Git no editor

## ⚠️ AÇÃO NECESSÁRIA

### Passo 1: Feche o Cursor COMPLETAMENTE
```bash
# No Terminal, force o fechamento se necessário:
killall Cursor 2>/dev/null || true
```

### Passo 2: Remova TODOS os worktrees residuais
```bash
cd ~/Downloads/fca-mtr

# Remover worktrees do Git
git worktree list | grep "\.cursor" | awk '{print $1}' | xargs -I {} git worktree remove --force {} 2>/dev/null || true

# Limpar metadados
git worktree prune

# Remover diretórios físicos (pode precisar fechar Cursor primeiro)
rm -rf ~/.cursor/worktrees/fca-mtr/*

# Verificar
git worktree list
```

**Deve mostrar APENAS:**
```
/Users/jairfahl/Downloads/fca-mtr  2d009db [main]
```

### Passo 3: Reabra o Cursor
1. Abra o Cursor
2. **File → Open Folder...** (não use "Recent")
3. Selecione: `~/Downloads/fca-mtr`
4. **NÃO** abra worktrees ou pastas dentro de `.cursor/worktrees/`

### Passo 4: Verificar
- Abra Source Control no Cursor
- Deve mostrar o Git normalmente, sem erros
- Se ainda aparecer "Worktree not found", veja abaixo

## 🔍 Se o Problema Persistir

### Opção A: Limpar Cache do Cursor
```bash
# Fechar Cursor primeiro!
killall Cursor

# Limpar cache
rm -rf ~/Library/Application\ Support/Cursor/Cache/*
rm -rf ~/Library/Application\ Support/Cursor/CachedData/*
rm -rf ~/Library/Application\ Support/Cursor/User/workspaceStorage/*

# Reabrir Cursor
```

### Opção B: Desabilitar Worktrees no Git Globalmente
```bash
git config --global worktree.autoDetect false
```

### Opção C: Trabalhar SEM Worktrees
Sempre abra o Cursor diretamente em `~/Downloads/fca-mtr`, nunca em worktrees.

## ✅ Validação Final

Execute e confirme:
```bash
cd ~/Downloads/fca-mtr
git worktree list
pwd
git rev-parse --show-toplevel
```

Todos devem apontar para: `/Users/jairfahl/Downloads/fca-mtr`

---

**Última atualização:** 2026-02-05
