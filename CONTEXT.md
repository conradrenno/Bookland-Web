# Bookland Web — Contexto do Projeto

> Handoff gerado para dar contexto imediato à próxima sessão do Claude Code.
> Abra a sessão **nesta pasta** (`bookland-web`) para o contexto nascer isolado.

## O que é este projeto

Frontend **+ BFF** em **Next.js (App Router)** que serve de camada para a API de
e-commerce de livros **Bookland** (Java / Spring Boot). Projeto de **aprendizado**.

Papéis do Next aqui:
- **BFF**: camada server-side que fala com o Spring, dona do token JWT, agrega/traduz respostas e erros.
- **Renderização de HTML (SSR)**: páginas de catálogo/detalhe renderizadas no servidor (SEO), partes interativas no cliente.

## API Bookland — referência

- **Rodando em:** `http://localhost:8080`
- **Swagger UI:** `http://localhost:8080/swagger-ui/index.html`
- **OpenAPI JSON (caminho customizado!):** `http://localhost:8080/api-docs`
  - ⚠️ **Não** é o default `/v3/api-docs` — esse retorna **403**. O correto é `/api-docs`.
  - Spec é gerado em runtime (não existe arquivo no projeto Java).
- **Spec salvo localmente:** [`docs/bookland-openapi.json`](docs/bookland-openapi.json)
  - OpenAPI **3.1.0** · **39 endpoints** · **38 schemas** (salvo sem BOM, indentado)
  - Para atualizar: rebaixar o conteúdo de `http://localhost:8080/api-docs`.
  - **Atualização 2026-07-25:** `BookViewModel`/`Create`/`UpdateBookRequest` ganharam
    **`coverImageUrl`** (capa, opcional) + novo `POST /books/{bookId}/cover` (upload).
  - **Atualização 2026-07-27 (dono ajustou o backend):**
    - `ReviewViewModel` + **`customerName`** → resolve o gap do nome no review.
    - `coverImageUrl` em **`CartItemViewModel`** (+ `title` e `available`),
      `OrderItemViewModel`, `WishlistItemViewModel`, `LowStockBookViewModel`
      → **acaba a necessidade de agregação no BFF** para miniaturas.
    - Novo **`GET /admin/orders?status=&page=&size=`**
      (`PageResultAdminOrderSummaryViewModel`) → destrava o painel admin (fase 2).
    - `CreateBookRequest.isbn`: regex afrouxada para aceitar hífen/espaço.
  - **Atualização 2026-07-27 (tarde) — auth/erros no spec:**
    - `components.securitySchemes.bearerAuth` (JWT) + `security` global.
    - **`ProblemDetail`** (RFC 7807 + **`code`** estável) e
      **`ValidationProblemDetail`** (`errors: { campo: [msgs] }`) tipados;
      todo endpoint declara `default` (erro) e a maioria `400`.
    - Sucesso mudou em vários: register **201**, logout **204**, DELETEs **204**,
      `POST /books` e `POST reviews` **201** → `apiFetch` não pode parsear 204.
    - ⚠️ `security` global também marca os **públicos** (login/register/books/
      categories) como autenticados — inofensivo em runtime, ruim p/ codegen.

### Autenticação
JWT clássico: `POST /api/v1/auth/{login,register,refresh,logout}`.
Decidido: access + refresh em **cookies httpOnly**, refresh/rotação server-side.

✅ **Destravado (2026-07-27, tarde):** a API agora separa **401** (identidade) de
**403** (permissão), com `problem+json` + **`code`** estável (`TOKEN_MISSING`,
`TOKEN_INVALID`, `TOKEN_EXPIRED`, `INSUFFICIENT_ROLE`, `INVALID_CREDENTIALS`,
`INVALID_REFRESH_TOKEN`…). Verificado ao vivo. O `apiFetch` ramifica por `code`.

- Claims do access token: `{ sub, email, role, iat, exp }` (id em **`sub`**), HS384.
- TTL: access **24 h**, refresh **7 dias**.
- **Refresh rotaciona** — cada renovação invalida o refresh anterior; o BFF
  **precisa regravar os dois cookies**. Logout revoga de verdade.

✅ **2026-07-28:** `POST /auth/register` consertado (**201**; duplicata → **409
`EMAIL_ALREADY_EXISTS`**) e `/error` liberado (**500 `INTERNAL_ERROR`** em
problem+json). Matriz de auth reconferida — **sem regressão**.
**Não há mais bloqueio de contrato para o BFF.**

**Credenciais de admin (perfil dev):** `admin@bookland.com` / **`admin1234`**
(vêm de `bookland.admin.*` no `application.yml` do backend). Com elas, tudo que
dependia de ADMIN foi verificado em 2026-07-28.

> ⚠️ **Único bug aberto no backend (item 21):** `POST /auth/register` devolve
> **500 intermitente**. Causa raiz achada no log: H2
> `The database has been closed` ao avaliar o **único CHECK do schema**
> (`users.role`) — rotatividade de conexão do pool, não modelagem.
> Fix sugerido: `spring.datasource.hikari.max-lifetime: 0` no perfil dev.
> Contorno: reiniciar a app. **Não bloqueia o BFF.**

### Grupos de endpoints

**🛍️ Loja (cliente)**
- `books` — GET/POST/GET{id}/PATCH{id}/DELETE{id} `/api/v1/books` · `POST /books/{id}/cover` (upload capa)
- `categories` — `GET /categories`, `GET /categories/{id}/books`
- `reviews` — `GET/POST /books/{id}/reviews`, `DELETE /books/{id}/reviews/{reviewId}`
- `cart` — `GET /cart`, `POST /cart/items`, `PATCH|DELETE /cart/items/{bookId}`, `POST /cart/checkout`
- `wishlist` — `GET /wishlist`, `POST /wishlist/items`, `DELETE /wishlist/items/{bookId}`, `POST /wishlist/items/{bookId}/move-to-cart`
- `orders` — `GET /orders`, `GET|DELETE /orders/{orderId}`
- `payments` — `GET /payments/order/{orderId}`
- `users` — `GET|PUT|DELETE /users/{id}`

**🔧 Admin**
- `admin-orders` — `GET /admin/orders/{orderId}`, `PATCH /admin/orders/{orderId}/status`, `GET /admin/orders/customer/{customerId}`
- `admin-payments` — `POST /admin/payments/order/{orderId}/refund`
- `inventory` — `GET /inventory/low-stock`
- `book-inventory` — `PATCH /books/{bookId}/inventory`, `GET /books/{bookId}/inventory/history`

## MVP sugerido (a confirmar nas specs)

Fluxo storefront: **catálogo (books + categories) → detalhe + reviews → carrinho → checkout → pedidos**.
Fase 2: wishlist, área de conta, painel admin.

## Fontes de verdade

| Fonte | Responde | Status |
|---|---|---|
| OpenAPI (`docs/bookland-openapi.json`) | contrato: endpoints, DTOs, tipos, erros | ✅ capturado |
| Linear (user stories) | escopo, regras de negócio, jornada, prioridade | ✅ lido (team REN, projeto Bookland, 27 stories) |
| Specs em `docs/specs/*.md` | decisões do dono (escopo, auth, SSR vs client, design) | ✅ geradas (ver `docs/specs/README.md`) |

## Estado / próximos passos

- [x] OpenAPI do Bookland capturado e salvo em `docs/`
- [x] Habilitar **Linear MCP** e ler as 27 user stories
- [x] Scaffold do **Next.js (App Router)**: Next 16, Tailwind v4, shadcn/ui
- [x] Gerar **specs** (`docs/specs/`) ancoradas em endpoints + stories
- [x] Definir papel do BFF (**agregador**) e auth (**cookie httpOnly + refresh server-side**)
- [x] **Reconferir specs contra a API atualizada (2026-07-27)** — itens 4, 5 e 11
      do `09-contract-notes.md` resolvidos; specs 02/03/04/08 atualizadas
- [x] **2ª rodada (2026-07-27, tarde):** auth 401/403 + `code` + `errors`
      verificados ao vivo → itens 6, 12 e 13 resolvidos; `02-auth.md` reescrito
- [x] **3ª rodada (2026-07-28):** registro e `/error` corrigidos; fluxo autenticado
      ponta-a-ponta exercitado (registro → carrinho → checkout → pedido →
      pagamento → wishlist). **Contrato pronto — nada bloqueia o BFF.**
- [x] **4ª rodada (2026-07-28, com ADMIN):** verificação **fechada** —
      `customerName` real, `available` × estoque, painel admin, transições de
      status, reviews (duplicata/média/distribuição), limite de capa
- [x] **Etapa 1 do BFF (2026-07-28):** `apiFetch` + modelo de erro + Vitest + MSW
- [x] **Etapa 2 do BFF (2026-07-28):** auth completa — cookies httpOnly, refresh
      serializado, middleware, 4 route handlers. **86 testes verdes.**
- [x] **Etapa 3 (2026-07-28):** páginas `/login` e `/register` — RHF + zod,
      `?next=` sanitizado, erro do BFF mapeado por `code`. **123 testes verdes**
      (105 node + 18 jsdom). → [`16-auth-pages.md`](docs/specs/16-auth-pages.md)
- [x] **Etapa 4a (2026-07-29):** camada de dados do catálogo — `books.ts`
      (+ `parseBookSearchParams`), `categories.ts`, `covers.ts`, `uuid.ts`,
      `format.ts`, `remotePatterns` corrigido. **201 unit + 14 smoke verdes.**
- [x] **Etapa 4b (2026-07-29):** UI do catálogo — `/` (listagem, busca, filtros,
      paginação), `/categories`, `/books/[bookId]`, `SiteHeader`/`SiteFooter`,
      `error.tsx`/`loading.tsx`/`not-found.tsx`. **241 testes verdes**; app
      exercitada contra o Spring no ar (dev e build de produção).
- [x] **Etapa 5a, passos 1–3 (2026-07-29):** carrinho até o botão de comprar —
      `lib/api/cart.ts`, 3 route handlers, `cart-client.ts`, `AddToCartButton`,
      card do catálogo redesenhado. **295 unit + 23 smoke verdes.**
      → [`18-cart.md`](docs/specs/18-cart.md)
- [ ] **Etapa 5a, passo 4 — próxima:** página `/cart` (lista, stepper, remoção,
      total, estado vazio) e o **contador no header**
- [ ] **Backend (do dono):** item 21 (register 500 — H2/Hikari) e item 24
      (`stockQuantity` primitivo — e agora **item 26**, o mesmo defeito em
      `AddCartItemRequest.quantity`). Cosmético: itens 16 e 20

## 🚦 Onde paramos — leia isto primeiro (2026-07-29, noite)

**Etapas 1 a 4 e os passos 1–3 da 5a estão feitos, testados e verificados.**
Comandos: `pnpm test:run` (**295** unit — 237 node + 58 jsdom),
`pnpm test:smoke` (**23** contra o Spring **no ar**), `pnpm typecheck`,
`pnpm lint` — todos limpos.

> ⚠️ O número de testes citado nas etapas antigas acima está **desatualizado**
> (o 241 da etapa 4b já era 248 na prática). O valor corrente é o desta seção.

### Etapa 5a — o que já está de pé

`lib/api/cart.ts` (4 chamadas + `cartItemCount`), 3 route handlers em
`app/api/cart/`, `lib/api/cart-client.ts` (browser → BFF, devolve copy pt-BR
pronta), `AddToCartButton` e o **card do catálogo redesenhado** com o CTA no
hover. Falta só o **passo 4**: a página `/cart` e o contador no header.

**Sincronização é `router.refresh()`** — sem estado global. O header mora no
layout raiz, então o refresh re-renderiza a árvore inteira e o badge acompanha
de graça. É por isso que `AddToCartButton` não guarda carrinho nenhum.
O fluxo de auth está **fechado ponta a ponta**: middleware → `/login` → cookies.
O **storefront de leitura está de pé**: catálogo com busca/filtros/paginação,
categorias, detalhe do livro, header e footer em todas as páginas.

### O que existe em código

```
lib/          config.ts · utils.ts · format.ts (preço/data/nota pt-BR)
lib/api/      client.ts (apiFetch) · url.ts · errors.ts · problem.ts
              error-codes.ts · error-messages.ts · types.ts · uuid.ts
              auth.ts (server→Spring) · auth-client.ts (browser→BFF)
              books.ts · categories.ts · covers.ts
lib/auth/     session.ts · cookies.ts · refresh.ts · protected-routes.ts
              server.ts · next-path.ts
lib/catalog/  search-href.ts (href do catálogo) · use-catalog-params.ts
lib/forms/    apply-api-error.ts
app/          layout.tsx (shell) · page.tsx (catálogo) · error · loading · not-found
app/api/auth/{login,register,logout,refresh}/route.ts
app/(auth)/   layout.tsx · login/page.tsx · register/page.tsx
app/(storefront)/ categories/page.tsx · books/[bookId]/page.tsx
components/auth/    login-form · register-form · auth-card · form-alert · text-field
components/catalog/ book-card · book-cover · rating-stars · search-bar
                    catalog-filters · pagination
components/layout/  site-header · site-footer · header-shell · categories-menu
                    account-menu · mobile-nav · payment-marks
middleware.ts
test/msw.ts · test/dom.ts
```

### 🟡 Pendências conhecidas do 4b (não bloqueiam)

1. **Soft 404:** `notFound()` mostra a página certa mas responde **200**.
   Reproduzido no build de produção; rota inexistente devolve 404 normalmente.
   Detalhe e o que já foi descartado em [`03-catalog.md`](docs/specs/03-catalog.md).
2. **Contador do carrinho** no header: adiado para a etapa 5 junto com `cart.ts`.
3. **"Minha conta" / "Meus pedidos" / "Admin"** no menu de perfil (spec 13):
   entram quando as páginas existirem — hoje só "Sair", para não gerar link morto.

O Vitest agora tem **dois projetos**: `node` (`*.test.ts`, `src/lib/**`) e
`jsdom` (`*.test.tsx`, componentes). `pnpm test:run` roda os dois; para um só,
`pnpm vitest run --project jsdom`.

### Decisões que NÃO devem ser revertidas sem motivo forte

1. **Sem ports/adapters, sem composition root.** Foi construído assim e
   **revertido pelo dono** em 2026-07-28: aprender hexagonal não justifica
   desviar do padrão de mercado do frontend, e o foco dele no backend é
   **Clean Architecture**, não hexagonal. Detalhe e motivo em
   [`15-code-conventions.md`](docs/specs/15-code-conventions.md).
2. **HTTP se testa com MSW**, não com dublê injetado nem `globalThis.fetch`
   mockado. Foi o que permitiu deletar a camada de transporte.
3. **Renovação de token mora no middleware**, não no `apiFetch`. Motivo técnico:
   Server Component **não escreve cookie** (`cookies()` é read-only no render) e
   o refresh **rotaciona** — renovar sem persistir mataria a sessão na
   requisição seguinte. Ver [`02-auth.md`](docs/specs/02-auth.md).
4. **`?next=` nunca é usado cru.** `resolveAfterAuthPath()` sanitiza antes de
   qualquer `redirect`/`router.replace` — `?next=//evil.tld` é open redirect, e
   um parâmetro repetido chega como **array** (recusado inteiro). Ver
   [`16-auth-pages.md`](docs/specs/16-auth-pages.md).

5. **Parâmetro de URL inválido some, não vira erro.** `parseBookSearchParams`
   descarta `?category=lixo` / `?minPrice=abc` (que o upstream responde com 400)
   e limita `?size` a `MAX_PAGE_SIZE` (o upstream obedece `?size=1000`). Um typo
   na barra de endereço tem que mostrar o catálogo, não uma tela de erro.
   Ver [`09-contract-notes.md`](docs/specs/09-contract-notes.md) item 25.

6. **Estado do catálogo mora na URL.** Todo controle (busca, filtro, ordenação,
   pager) só reescreve a query string; a página re-renderiza no servidor.
   `buildCatalogHref` é o inverso do `parseBookSearchParams` e centraliza duas
   regras que se perdem quando cada componente monta href na mão: mudar filtro
   **volta para a primeira página**, e valor default **some da URL**.

### Próximo passo natural
**Passo 4 da etapa 5a:** a página `/cart` (lista, stepper de quantidade,
remoção, total, estado vazio) e o **contador no header**. Plano em
[18-cart.md](docs/specs/18-cart.md).

Para o contador: o header passa a chamar `getCart()` junto de `listCategories()`
e `getCurrentUser()`. Envolver `getCart` em **`cache()` do React** — em `/cart` o
header e a página pedem o mesmo carrinho no mesmo render, e sem isso são dois
`GET`. Falha do `GET /cart` esconde o badge, não derruba o header (mesmo
precedente do `safeCategories()`).

Depois: **5b** (checkout) e pedidos ([06](docs/specs/06-orders.md)).
Fora do caminho principal, faltam **reviews na página do livro**
([04-reviews.md](docs/specs/04-reviews.md)).

### 🟡 Achados abertos desta etapa (não bloqueiam)

1. **`nativeButton` do Base UI:** existem **8** usos de
   `<Button render={<Link/>}>` em `not-found.tsx`, `page.tsx`,
   `catalog-filters.tsx`, `categories-menu.tsx` e `site-header.tsx` que emitem
   aviso no console. O `AddToCartButton` resolveu o caso dele usando
   `<Link className={buttonVariants(...)}>` — mesma aparência, semântica de
   link. Vale replicar, mas é limpeza à parte.
2. **H2 é em memória:** reiniciar o backend **regenera todos os ids**. Nenhum
   teste pode fixar UUID; os smoke descobrem o livro via `GET /books`.

⚠️ **Aviso do build (não urgente):** o Next 16 marca `middleware.ts` como
convenção **deprecada** em favor de `proxy.ts`. Só um rename + ajuste de
assinatura, mas mexe no núcleo da renovação de token — fazer isoladamente, não
no meio da etapa do catálogo.

## Decisões fixadas (2026-07-24)

1. **MVP:** storefront completo (catálogo/busca → detalhe+reviews → carrinho → checkout → pedidos + auth). Wishlist/conta/admin → fase 2.
2. **Auth:** access + refresh em cookies httpOnly; refresh/rotação server-side no BFF.
3. **Styling:** Tailwind + shadcn/ui.
4. **BFF:** agregador (compõe/molda quando útil).

> ⚠️ Divergências contrato × stories catalogadas em `docs/specs/09-contract-notes.md`
> (cancelamento via DELETE, ausência de `PENDING`, status via rota admin, etc.).

## Decisões fixadas (2026-07-28) — durante a implementação do BFF

5. **Padrão de código = o que o mercado frontend faz**, não o que o backend faz.
   Sem ports/adapters, sem composition root, sem DI cerimonial. Abstração só
   onde há costura real. → [15-code-conventions.md](docs/specs/15-code-conventions.md)
6. **Testes:** Vitest + **MSW** para HTTP; co-locados (`foo.ts` + `foo.test.ts`);
   suíte de contrato separada (`pnpm test:smoke`) que exige o Spring no ar.
   → [10-testing.md](docs/specs/10-testing.md)
7. **Organização:** por recurso, arquivos planos em `lib/api/`; vira pasta só se
   um recurso crescer.
8. **Erro:** `ApiError` único; **ramificar por `code`**, nunca por mensagem.

## Decisões que ficam com o dono

- Quais páginas são SSR de verdade vs. client-side.
- i18n (pt-BR?), design system / estilo, tratamento visual de erros.
