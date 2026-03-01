# Contrato: Seleção de Ações por Bloco — POST /full/cycle/select-actions

## Regra de contagem

| Condição | `remaining_count` | Ações aceitas | Erro se violar |
|---|---|---|---|
| Bloco intermediário | > 3 | exatamente 3 | `400 ACTION_COUNT_INVALID` |
| Último bloco | ≤ 3 | 1, 2 ou 3 | `400 ACTION_COUNT_INVALID` |

**`remaining_count`**: número de sugestões elegíveis ainda não usadas (excluídas as do plano atual e histórico de ciclos anteriores). Calculado por `computeRemainingAndRequired`.

## Implementação

```js
const isLastBlock = remaining_count <= 3;
if (isLastBlock) {
  if (arr.length < 1) → 400 ACTION_COUNT_INVALID
} else {
  if (arr.length !== 3) → 400 ACTION_COUNT_INVALID
}
```

Localização: `apps/api/src/routes/full.js`, handler `POST /full/cycle/select-actions`.

## Formato de erro

```json
{
  "code": "ACTION_COUNT_INVALID",
  "message_user": "Selecione exatamente 3 ações.",
  "error": "Selecione exatamente 3 ações.",
  "required_count": 3,
  "remaining_count": 5
}
```

## Racional

O total de sugestões elegíveis pode não ser múltiplo de 3. O último bloco absorve o restante (1, 2 ou 3 ações). Blocos intermediários sempre exigem exatamente 3 para manter a estrutura de ciclo.

## Testes

`apps/api/test/fullActions.route.test.js` — describe `POST /full/cycle/select-actions — validação de bloco`:
- Happy path: último bloco com 2 ações (`remaining=2`) → 200
- Erro: bloco intermediário com 2 ações (`remaining=4`) → 400 `ACTION_COUNT_INVALID`
