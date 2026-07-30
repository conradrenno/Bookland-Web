# 06 — Pedidos

Cobre US-15 (histórico), US-18 (detalhe), US-16 (cancelar). Autenticadas.

## US-15 — Histórico de pedidos

**Página:** `/orders` (SSR).
**Upstream:** `GET /api/v1/orders?page=&size=` →
`PageResult<OrderSummaryViewModel>` (`id`, `status`, `totalAmount`, `itemCount`,
`createdAt`).

Regras (story):
- Só pedidos do cliente autenticado (isolamento por `customerId`, feito no
  backend via token).
- Paginado, ordenado por data decrescente.
  > ❌ **Não confere (2026-07-30):** o histórico veio em ordem **crescente** —
  > `content[0]` é o pedido mais antigo. Ordenar no BFF se persistir. Item 27 de
  > [09-contract-notes.md](09-contract-notes.md).

UI: lista de cards — nº do pedido (id curto), data (pt-BR), `StatusBadge`,
total (`R$`), qtd. de itens. Vazio: "você ainda não fez pedidos".

## US-18 — Detalhe do pedido

**Página:** `/orders/[orderId]` (SSR).
**Upstream:** `GET /api/v1/orders/{orderId}` → `OrderViewModel`
(`items[] {bookId, title, quantity, unitPrice, subtotal}`, `status`,
`totalAmount`, `statusHistory[]`, timestamps).

Regras (story):
- Preço unitário congelado no checkout (vem em `unitPrice`).
- Total, status atual e **histórico de status** com timestamps
  (`statusHistory` = `StatusTransitionViewModel[]`).
- Só dono ou admin; caso contrário **403** → UI "você não tem acesso a este
  pedido". Inexistente → **404** → `notFound()`.

UI: itens, totais, `StatusBadge` atual, timeline do `statusHistory`, e botão
**Cancelar** quando permitido (ver abaixo).

## US-16 — Cancelar pedido

**Rota:** `DELETE /api/orders/{orderId}` (BFF, autenticada).
**Upstream:** `DELETE /api/v1/orders/{orderId}` → `OrderViewModel` (atualizado).

⚠️ **Divergência de contrato:** a story cita `PATCH /orders/{orderId}/cancel`,
mas esse endpoint **não existe**; o contrato cancela via `DELETE
/api/v1/orders/{orderId}` (operationId `cancel`, retorna o `OrderViewModel`).
Usamos o `DELETE`. Ver [09-contract-notes.md](09-contract-notes.md).

Regras (confirmadas pelo README do backend + `DELETE` ao vivo, 2026-07-30):
- Cancelável a partir de **`AWAITING_PAYMENT` ou `CONFIRMED`** — deixou de ser
  palpite. Cancelar um `CONFIRMED` dispara **restauração de estoque e estorno
  automático**, então o pagamento do pedido passa a `REFUNDED`.
- Como o checkout já entrega `CONFIRMED`, na prática **todo pedido novo nasce
  cancelável**; `AWAITING_PAYMENT` nunca é observado pelo cliente.
- Ao cancelar, o estoque é restaurado (backend); `status` vira `CANCELLED`.
- Cancelar pedido de outro cliente → **403**.

UI:
- Botão "Cancelar pedido" visível só quando o status é cancelável.
- Confirmação (dialog) antes de disparar.
- Sucesso → atualiza a página com o `OrderViewModel` (status `CANCELLED`).
- **409/422** (não cancelável) → mensagem explicando o motivo.

## Mapa status → UI (`StatusBadge`)

| `OrderStatus` | Rótulo pt-BR | Cor | Cancelável? |
|---|---|---|---|
| `AWAITING_PAYMENT` | Aguardando pagamento | amber | sim (nunca observado: o checkout já entrega `CONFIRMED`) |
| `CONFIRMED` | Confirmado | blue | **sim — README + verificado ao vivo (2026-07-30)** |
| `SHIPPED` | Enviado | indigo | não |
| `DELIVERED` | Entregue | green | não |
| `CANCELLED` | Cancelado | zinc | — |
| `PAYMENT_FAILED` | Pagamento falhou | red | — |

> A coluna "cancelável" **deixou de ser palpite** (README do backend + `DELETE`
> ao vivo em 2026-07-30). A fonte de verdade continua sendo a resposta do
> `DELETE` — o front habilita o botão pelo mapa e reflete o erro se vier um.
