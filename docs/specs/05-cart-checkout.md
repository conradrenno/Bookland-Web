# 05 — Carrinho & Checkout

Cobre US-13 (carrinho) e US-14 (checkout). Rotas autenticadas.

## US-13 — Carrinho

**Página:** `/cart` (SSR lê o estado; mutações via BFF a partir do cliente).

| Ação | Rota BFF | Upstream | Retorno |
|---|---|---|---|
| Ver carrinho | (SSR direto) | `GET /api/v1/cart` | `CartViewModel` |
| Adicionar item | `POST /api/cart/items` | `POST /api/v1/cart/items` (`AddCartItemRequest`) | `CartViewModel` |
| Alterar quantidade | `PATCH /api/cart/items/{bookId}` | `PATCH .../cart/items/{bookId}` (`UpdateCartItemRequest`) | `CartViewModel` |
| Remover item | `DELETE /api/cart/items/{bookId}` | `DELETE .../cart/items/{bookId}` | `CartViewModel` |

`CartViewModel`: `id`, `customerId`, `items[] {bookId, quantity, unitPrice,
subtotal}`, `total`, `updatedAt`.

Regras (story):
- Um carrinho ativo por cliente.
- Adicionar livro já presente **incrementa** a quantidade (comportamento do
  backend; `AddCartItemRequest.quantity` default 1).
- Não é possível exceder o estoque → upstream **409**; UI mostra "estoque
  insuficiente".
- `UpdateCartItemRequest.quantity = 0` remove a linha (contrato: `minimum 0`).
- Preço unitário é o do momento da adição (`unitPrice` na linha).

UI:
- Toda mutação retorna o `CartViewModel` atualizado → re-render da lista + total.
- Badge de contagem no header (soma de `quantity`).
- Estado vazio: "seu carrinho está vazio" + CTA para o catálogo.
- Não autenticado → middleware manda para `/login?next=/cart`.

## US-14 — Checkout

**Rota:** `POST /api/cart/checkout` (BFF, autenticada).
**Upstream:** `POST /api/v1/cart/checkout` com `CheckoutRequest`
(`paymentMethod`: `CREDIT_CARD | DEBIT_CARD | PAYPAL | PIX`).
**Retorno:** `OrderViewModel`.

Regras (story):
- Backend revalida estoque item a item no momento da confirmação.
- Item indisponível → **409** com os itens problemáticos; UI lista e aponta o
  que remover/ajustar.
- Ao confirmar, estoque é decrementado atomicamente e um `Order` é criado com
  preços congelados.

⚠️ **Status inicial do pedido:** a story diz "status PENDING", mas o enum do
contrato **não tem PENDING**. O checkout devolve um `OrderViewModel` cujo
`status` provavelmente é `AWAITING_PAYMENT` (há fluxo de pagamento: enum de
`PaymentStatus` = PENDING/APPROVED/DECLINED/REFUNDED). O front **exibe o `status`
que vier** — não assume PENDING. Ver [09-contract-notes.md](09-contract-notes.md).

Fluxo de UI:
1. `/checkout` mostra resumo do carrinho + seletor de `paymentMethod`.
2. Sucesso → redireciona para `/orders/{id}` com o pedido criado.
3. **409** (estoque) → volta ao carrinho destacando itens problemáticos.
4. Pagamento pode resultar em `CONFIRMED` ou `PAYMENT_FAILED` — a página do
   pedido reflete o status e oferece a ação apropriada.
