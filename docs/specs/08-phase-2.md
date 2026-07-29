# 08 — Fase 2 (backlog)

Fora do MVP. Endpoints já existem no contrato; specs detalhadas quando puxarmos.

## Wishlist (US-22 → US-25)

| Story | Ação | Endpoint |
|---|---|---|
| US-22 | Adicionar à wishlist | `POST /api/v1/wishlist/items` (`AddWishlistItemRequest`) |
| US-23 | Ver wishlist | `GET /api/v1/wishlist` → `WishlistViewModel` |
| US-24 | Remover da wishlist | `DELETE /api/v1/wishlist/items/{bookId}` |
| US-25 | Mover p/ carrinho | `POST /api/v1/wishlist/items/{bookId}/move-to-cart` |

Regras-chave: uma wishlist por cliente; duplicata → 409; livro inexistente →
404; item indisponível no move-to-cart → 409 sem alterar nada; ordenar por data
de adição desc; itens soft-deleted marcados como "indisponível".

> ⚠️ REN-27 está rotulada "US-23" mas com o texto de "adicionar" (US-22); o item
> real de "ver wishlist" é REN-28. Tratar REN-28 como fonte de US-23.

## Área de conta

| Ação | Endpoint |
|---|---|
| Ver perfil | `GET /api/v1/users/{id}` → `UserViewModel` |
| Editar nome | `PUT /api/v1/users/{id}` (`UpdateUserRequest`) |
| Excluir conta | `DELETE /api/v1/users/{id}` |

Página `/account`; requer auth; usa `getCurrentUser()` para o `id`.

## Painel admin

Gate por `role === "ADMIN"` (do token) + 403 do backend como rede de segurança.

| Área | Stories | Endpoints |
|---|---|---|
| Livros | US-07, US-08, US-09 | `POST /books`, `PATCH /books/{id}`, `DELETE /books/{id}` |
| Estoque | US-11, US-12 | `PATCH /books/{bookId}/inventory`, `GET /books/{bookId}/inventory/history`, `GET /inventory/low-stock` |
| Pedidos | US-17 | `GET /admin/orders?status=&page=&size=`, `PATCH /admin/orders/{orderId}/status`, `GET /admin/orders/{orderId}`, `GET /admin/orders/customer/{customerId}` |
| Reviews | US-21 | `DELETE /books/{bookId}/reviews/{reviewId}` |
| Pagamentos | — | `GET /payments/order/{orderId}`, `POST /admin/payments/order/{orderId}/refund` |

✅ **Listagem de pedidos do admin (resolvido 2026-07-27):** `GET /admin/orders`
existe, com filtro `status` (enum `OrderStatus`, opcional) + `page`/`size`,
devolvendo `PageResultAdminOrderSummaryViewModel`. O item de lista
(`AdminOrderSummaryViewModel`) = `id`, `customerId`, `status`, `totalAmount`,
`itemCount`, `createdAt`. **US-17 está destravada.**

⚠️ **Lacunas de contrato para o admin** (ver [09](09-contract-notes.md)):
- A lista admin traz **`customerId` (UUID), não o nome** do cliente — exibir
  pedido/UUID curto, ou 1 `GET /users/{id}` por linha (custoso). Decidir na fase 2.
- `PATCH /admin/orders/{orderId}/status` usa `UpdateOrderStatusRequest` com
  `adminId` no corpo — preferir derivar do token; enviar só se o backend exigir.
- **Gate de admin (item 12 do 09):** o backend devolve **403 sem corpo** também
  para token ausente/expirado, não só para falta de role — o BFF não distingue
  "expirou" de "não é admin". Ver [02-auth.md](02-auth.md).
