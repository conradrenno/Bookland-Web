# 00 — Visão geral & escopo

## O que é

Frontend **+ BFF** em Next.js (App Router) para a loja de livros **Bookland**.
O Next tem dois papéis:

- **BFF** (Backend-for-Frontend): camada server-side que fala com a API Spring
  (`http://localhost:8080`), é dona do JWT, agrega/traduz respostas e erros.
- **Renderização (SSR)**: páginas de catálogo e detalhe renderizadas no servidor
  (SEO), com ilhas interativas no cliente.

Projeto de **aprendizado** — clareza e rastreabilidade contra o contrato importam
mais que exaustividade de features.

## Escopo do MVP (fase 1)

Fluxo storefront de ponta a ponta:

```
registrar/login → catálogo + busca → detalhe do livro + reviews
      → carrinho → checkout → pedidos (histórico + detalhe + cancelar)
```

> **Landing:** a home (`/`) **é** o catálogo paginado (grid de cards +
> paginação), conforme o style brief — não há página `/catalog` separada. Busca,
> filtros e ordenação são query params em `/` (ver [01](01-architecture-bff.md)).
> Header/footer padrão em todas as páginas (specs [13](13-common_header.md) /
> [14](14-footer.md)).

### User stories no MVP

| Épico | Stories | Endpoints principais |
|---|---|---|
| Auth | US-01, US-02, US-03, US-04 | `POST /api/v1/auth/{register,login,refresh,logout}` |
| Catálogo | US-05, US-06, US-10 | `GET /books`, `GET /books/{id}`, `GET /categories`, `GET /categories/{id}/books` |
| Reviews | US-19, US-20 | `GET/POST /books/{id}/reviews` |
| Carrinho | US-13 | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/{bookId}` |
| Checkout | US-14 | `POST /cart/checkout` |
| Pedidos | US-15, US-16, US-18 | `GET /orders`, `GET /orders/{id}`, `DELETE /orders/{id}` |

## Fora do MVP → Fase 2

Detalhado em [08-phase-2.md](08-phase-2.md):

- **Wishlist** (US-22→25) — `/wishlist*`
- **Área de conta** — `GET/PUT/DELETE /users/{id}`, ver/editar perfil
- **Painel admin** — cadastro/edição/remoção de livros (US-07→09), estoque
  (US-11, US-12), status de pedidos (US-17), moderação de reviews (US-21),
  refund (admin-payments).

## Non-goals do MVP

- Sem pagamento real: o checkout apenas informa `paymentMethod`; o gateway é
  simulado pela API. O front reflete o `status` retornado.
- Sem SSR-caching agressivo/ISR nesta fase (avaliar depois).
- Sem testes E2E completos — apenas smoke onde fizer sentido.

## Métrica de "pronto" do MVP

Um visitante consegue: buscar um livro → abrir o detalhe → ler reviews →
registrar-se/logar → adicionar ao carrinho → finalizar → ver o pedido no
histórico e cancelá-lo enquanto permitido. Todos os erros do contrato
(401/403/404/409/422) têm tratamento visual em pt-BR.
