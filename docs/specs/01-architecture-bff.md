# 01 — Arquitetura & BFF

## Papel do BFF: **agregador**

O BFF não é passthrough puro. Ele:

1. **Detém o JWT** — lê os cookies httpOnly e injeta `Authorization: Bearer` nas
   chamadas ao Spring. O browser nunca vê o token. (Ver [02-auth.md](02-auth.md).)
2. **Agrega** — compõe múltiplas chamadas upstream numa resposta única quando a
   página precisa (ex.: detalhe do livro + primeira página de reviews).
3. **Traduz** — normaliza erros do Spring num modelo único (`ApiError`) e molda
   DTOs (ex.: esconder `stockQuantity` exato, expor só disponibilidade).

### Diretriz de agregação

- **Leituras de página (SSR):** Server Components chamam **diretamente** os
  módulos de serviço (`src/lib/api/*`) — sem passar por um route handler HTTP
  interno. Menos hops, mais rápido.
- **Mutações disparadas pelo cliente** (login, carrinho, checkout): passam por
  **route handlers** do BFF (`src/app/api/**/route.ts`), porque envolvem
  cookies/redirect e vêm de eventos do browser.

## Estrutura de pastas (alvo)

```
src/
  lib/
    config.ts              # env, nomes de cookie, base URL           [feito]
    utils.ts               # cn() do shadcn                            [feito]
    format.ts              # preço/data/nota em pt-BR                  [feito]
    api/
      types.ts             # DTOs espelhando o OpenAPI                 [feito]
      problem.ts           # RFC 7807: tipos + type guards             [feito]
      error-codes.ts       # catálogo de `code` + predicados           [feito]
      errors.ts            # ApiError (erro único do BFF)              [feito]
      url.ts               # buildUrl/query (puro)                     [feito]
      client.ts            # apiFetch (query, erro, 204, timeout)      [feito]
      auth.ts              # endpoints de auth sobre apiFetch          [feito]
      books.ts             # catálogo: search, byId, parse de query     [feito]
      categories.ts        # categorias                                [feito]
      covers.ts            # normaliza coverImageUrl (rel. × abs.)     [feito]
      uuid.ts              # isUuid — valida id vindo da URL           [feito]
      reviews.ts           # ler/criar reviews                         [pend.]
      cart.ts              # carrinho                                  [pend.]
      orders.ts            # pedidos                                   [pend.]
  test/
    msw.ts                 # servidor MSW compartilhado                [feito]
  app/
    layout.tsx             # shell + header/footer + Toaster
    page.tsx               # LANDING = catálogo paginado (US-05); ?q,?category,?sort,?page
    (storefront)/
      categories/page.tsx        # US-10 (todas as categorias)
      books/[bookId]/page.tsx    # US-06 + US-20
      cart/page.tsx              # US-13
      checkout/page.tsx          # US-14
      orders/page.tsx            # US-15
      orders/[orderId]/page.tsx  # US-18 + US-16
    (auth)/
      login/page.tsx             # US-02
      register/page.tsx          # US-01
    api/                    # BFF route handlers (mutações)
      auth/{login,register,logout,refresh}/route.ts
      cart/route.ts
      cart/items/route.ts
      cart/items/[bookId]/route.ts
      cart/checkout/route.ts
      books/[bookId]/reviews/route.ts
  components/
    ui/                     # shadcn (button, card, input, ...)        [feito]
    layout/                 # site-header, site-footer
    catalog/                # book-card, rating-stars, search-bar
  middleware.ts             # gate de rotas + refresh preventivo       [pend.]
```

## Mapeamento rota Next → endpoint Spring

| Ação (cliente/página) | Rota Next | Upstream Spring |
|---|---|---|
| Landing/catálogo + busca (SSR) | `/` (`?q,?category,?sort,?page`) | `GET /api/v1/books` |
| "Mais bem avaliados" (header) | `/?sort=rating` | `GET /api/v1/books?sort=rating` |
| Detalhe (SSR, agregado) | `/books/{id}` | `GET /books/{id}` + `GET /books/{id}/reviews` |
| Listar categorias | `/categories` (+ dropdown do header) | `GET /api/v1/categories` |
| Livros de uma categoria | `/?category={id}` | `GET /api/v1/categories/{id}/books` |
| Contador do carrinho (header) | (SSR no header, se logado) | `GET /api/v1/cart` |
| Registrar | `POST /api/auth/register` | `POST /api/v1/auth/register` |
| Login | `POST /api/auth/login` | `POST /api/v1/auth/login` |
| Logout | `POST /api/auth/logout` | `POST /api/v1/auth/logout` |
| Refresh (interno) | `POST /api/auth/refresh` | `POST /api/v1/auth/refresh` |
| Ver carrinho (SSR) | `/cart` | `GET /api/v1/cart` |
| Add item | `POST /api/cart/items` | `POST /api/v1/cart/items` |
| Alterar/remover item | `PATCH/DELETE /api/cart/items/{bookId}` | `PATCH/DELETE /api/v1/cart/items/{bookId}` |
| Checkout | `POST /api/cart/checkout` | `POST /api/v1/cart/checkout` |
| Histórico | `/orders` | `GET /api/v1/orders` |
| Detalhe pedido (SSR) | `/orders/{id}` | `GET /api/v1/orders/{id}` |
| Cancelar pedido | `DELETE /api/orders/{id}` | `DELETE /api/v1/orders/{id}` ⚠️ ver nota |
| Criar review | `POST /api/books/{id}/reviews` | `POST /api/v1/books/{id}/reviews` |

⚠️ Cancelamento e outras divergências: [09-contract-notes.md](09-contract-notes.md).

## Cliente HTTP (`lib/api/client.ts`) — implementado 2026-07-28

Uma função, sem camada de port/adapter — ver a nota de reversão na
[15-code-conventions.md](15-code-conventions.md).

- `apiFetch<T>(path, { method, query, body, headers, accessToken, signal, timeoutMs })`.
- Prefixa `API_BASE_URL`; monta query descartando `undefined`/`null` e repetindo
  a chave em arrays (`?tag=a&tag=b`, que é o que o Spring liga a `List`).
- Timeout via `AbortController` + `AbortSignal.any` — **abort do chamador
  propaga intacto**, só o nosso estouro vira `TIMEOUT`.
- `2xx` → JSON tipado; **204/205/304 e corpo vazio → `undefined`** (item 15 do
  [09](09-contract-notes.md)); `!ok` → `parseUpstreamError` → `ApiError`.
- **Não lê cookie.** O token entra por `accessToken`, para o módulo não importar
  `next/headers` e continuar testável fora de um request. A camada de auth
  (fase seguinte) é quem resolve o cookie.
- **Não** decide UI: quem chama trata `ApiError` (página → `notFound()`/mensagem;
  route handler → `NextResponse.json(err.toResponseBody(), { status })`).

- Chama `fetch` direto. Nos testes, quem intercepta é o **MSW**
  ([10-testing.md](10-testing.md)) — sem transporte injetado.

## Convenções

- Módulos de `lib/api/*` que fazem I/O são de uso **server-side**. Os de dados
  puros (`types.ts`, `problem.ts`, `error-codes.ts`, `errors.ts`) podem ser
  importados por Client Components para renderizar mensagem de erro.
- Paginação sempre via `PageResult<T>` (`content/page/size/totalElements/totalPages`).
- Datas: strings ISO do contrato; formatação só na borda de UI (pt-BR).
- Erros: um único `ApiError` com `status`, `code`, `fieldErrors?`, `instance?`.
  **Ramificar por `code`**, nunca por mensagem. Predicados derivados:
  `isSessionProblem`, `shouldAttemptRefresh`, `isServerFault`, `isForbidden`,
  `isConflict`, `isNotFound`, `isTransport`, `isFieldScoped`.
