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
- [x] **Etapa 5a, passo 4 (2026-07-30):** página `/cart` (lista, stepper,
      remoção, total, estado vazio) e o **contador no header** — fecha a 5a.
      **316 unit + 23 smoke verdes**; página exercitada contra o Spring no ar.
- [x] **Etapa 5b (2026-07-30):** `/checkout` (escolha de pagamento, campos
      decorativos que **não saem do navegador**), `POST /api/cart/checkout` e
      `/orders/[orderId]` — o pedido já nasce `CONFIRMED` e pago.
      → [`19-checkout.md`](docs/specs/19-checkout.md)
- [x] **Etapa 6 (2026-08-05):** `/orders` (histórico paginado) e o
      **cancelamento** com diálogo — fecha US-15 e US-16.
      **435 unit + 41 smoke verdes.** → [`20-orders-history.md`](docs/specs/20-orders-history.md)
- [ ] **Próxima:** **reviews na página do livro** ([04](docs/specs/04-reviews.md)) —
      é o que falta do MVP fora do caminho de compra
- [ ] **Backend (do dono):** item 21 (register 500 — H2/Hikari) e item 24
      (`stockQuantity` primitivo — e **item 26**, o mesmo defeito em
      `AddCartItemRequest.quantity`). Cosmético: itens 16 e 20.
      ✅ A ordenação de `GET /orders` (item 28) **já foi resolvida** — `932727f`

## 🚦 Onde paramos — leia isto primeiro (2026-08-05)

**O MVP de compra está fechado ponta a ponta: catálogo → detalhe → carrinho →
checkout → pedido → histórico → cancelamento.** Etapas 1 a 6 feitas, testadas e
verificadas contra o Spring no ar.

Comandos: `pnpm test:run` (**435** unit), `pnpm test:smoke` (**41** contra o
Spring **no ar**), `pnpm typecheck`, `pnpm lint`, `pnpm build` — todos limpos.

> ⚠️ Os números de teste citados nas etapas antigas acima estão **desatualizados**
> por construção — cada etapa registrou o seu. O valor corrente é o desta seção.

### Etapa 6 — fechada (a mais recente)

`/orders` (lista SSR paginada, estado na URL), `DELETE /api/orders/[orderId]`,
`CancelOrderButton` com `AlertDialog`, `OrderSummaryCard`, `EmptyOrders`, e
**"Meus pedidos" no menu de conta** — o link que a 5b não pôde criar.

**A peça que veio de fora:** o histórico vinha **crescente** e o `sort` era
ignorado, então o pedido mais recente caía na **última página**. Não havia
contorno honesto no BFF — inverter a página só reordena os antigos entre si — e
o dono **corrigiu no backend** (`932727f`): `createdAt DESC` com empate desfeito
por `id`. Reconferido ao vivo com 5 pedidos no mesmo segundo. Por isso
`listOrders` **não ordena nada** e **nunca manda `?sort=`**.

O `Pagination` **saiu de `components/catalog/` para `components/ui/`** e agora
recebe `hrefFor: (page) => string`. Era o que o casava com `buildCatalogHref` e
`BookSearchParams`; o catálogo só passou a fechar a closure.

**Cancelar mora só no detalhe**, nunca na lista: restaura estoque e estorna sem
desfazer, então pede que a pessoa esteja olhando para o que vai perder. O
diálogo **nomeia o valor** em vez de perguntar "tem certeza?".

### Etapa 5a — fechada

`lib/api/cart.ts` (4 chamadas + `cartItemCount`), 3 route handlers em
`app/api/cart/`, `lib/api/cart-client.ts` (browser → BFF, devolve copy pt-BR
pronta), `AddToCartButton`, o **card do catálogo redesenhado** com o CTA no
hover, a **página `/cart`** (linha com stepper, remoção, resumo, estado vazio) e
o **contador no header**.

**`lib/cart/current-cart.ts` é a peça nova do passo 4:** `getCurrentCart()`
(cookie → `getCart`) embrulhado no `cache()` do React, porque em `/cart` a página
e o badge do header pedem o mesmo carrinho no mesmo render — sem ele são dois
`GET /cart` por pageview. Ao lado dele, `safeCartItemCount()` engole a falha,
como `safeCategories()`: o header mora no layout raiz e não pode derrubar o site.

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
              bff-mutate.ts (browser → nossas rotas, resultado normalizado)
              auth.ts / auth-client.ts · cart.ts / cart-client.ts
              orders.ts / orders-client.ts · checkout-client.ts · payments.ts
              books.ts · categories.ts · covers.ts
lib/auth/     session.ts · cookies.ts · refresh.ts · protected-routes.ts
              server.ts · next-path.ts
lib/catalog/  search-href.ts (href do catálogo) · use-catalog-params.ts
lib/cart/     current-cart.ts (cookie → carrinho, memoizado; contagem segura)
lib/checkout/ payment-schema.ts   lib/payments/ labels.ts
lib/orders/   status.ts (OrderStatus → rótulo, cor, cancelável)
lib/forms/    apply-api-error.ts
app/          layout.tsx (shell) · page.tsx (catálogo) · error · loading · not-found
app/api/      _shared.ts (helpers de route handler)
app/api/auth/{login,register,logout,refresh}/route.ts
app/api/cart/items/route.ts · items/[bookId]/route.ts · checkout/route.ts
app/api/orders/[orderId]/route.ts   (DELETE — cancelamento)
app/(auth)/   layout.tsx · login/page.tsx · register/page.tsx
app/(storefront)/ categories · books/[bookId] · cart · checkout
                  orders · orders/[orderId]
components/auth/    login-form · register-form · auth-card
components/form/    form-alert · text-field
components/cart/    add-to-cart-button · cart-line · quantity-stepper
                    cart-summary · empty-cart
components/catalog/ book-card · book-cover · rating-stars · search-bar
                    catalog-filters
components/checkout/ checkout-form · payment-method-picker · payment-fields
                     order-review
components/orders/  order-items · order-payment · order-status-badge
                    status-timeline · order-summary-card · empty-orders
                    cancel-order-button
components/layout/  site-header · site-footer · header-shell · categories-menu
                    account-menu · mobile-nav · payment-marks · cart-button
components/ui/      pagination (genérica, `hrefFor`) · alert-dialog · …
middleware.ts
test/msw.ts · test/dom.ts
```

### 🟡 Pendências conhecidas do 4b (não bloqueiam)

1. **Soft 404 — e agora soft *redirect*:** `notFound()` mostra a página certa mas
   responde **200**. Reproduzido no build de produção; rota inexistente devolve
   404 normalmente. Detalhe e o que já foi descartado em
   [`03-catalog.md`](docs/specs/03-catalog.md).
   **Medido em 2026-07-30 (etapa 5b), inclusive no build de produção:**

   | O que decide | Resposta |
   |---|---|
   | `redirect()` de Server Component | **200** + `<meta http-equiv="refresh" content="1;url=…">` — ~1 s de tela vazia |
   | `notFound()` de Server Component | **200** com a página 404 |
   | Rota que não existe (o Next resolve) | **404** de verdade |
   | `NextResponse.redirect` do **middleware** | **307** correto |

   Ou seja: o que o **middleware** decide sai certo; o que a **página** decide
   sai mole. Testei a hipótese de ser o `redirect()` dentro de `try/catch` (o
   Next pede que fique fora): **não é** — o sintoma é idêntico das duas formas.
   As páginas ficaram com `redirect()`/`notFound()` no topo do componente mesmo
   assim, porque é a orientação oficial e junta os becos sem saída num lugar só.

   **Contorno onde doía:** `/checkout` com carrinho vazio **não redireciona
   mais** — renderiza o `EmptyCart` ali mesmo. Instantâneo, e some o único caso
   dessa família num caminho que o usuário alcança. Onde o middleware já cuida
   (visitante anônimo), o 307 continua correto.
2. ~~**Contador do carrinho** no header~~ — **resolvido no passo 4 da 5a**
   (`CartButton` + `safeCartItemCount`).
3. ~~**"Meus pedidos"** no menu de perfil~~ — **resolvido na etapa 6**.
   **"Minha conta"** e **"Admin"** (spec 13) entram quando suas páginas
   existirem — hoje linkariam para 404.

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
   Vale igual para `/orders`, com `parseOrderSearchParams`.

7. **Ordem de listagem é do backend.** `listOrders` não ordena e **não manda
   `?sort=`**. A rota nunca leu o parâmetro, e o contrato do backend é ordem
   fixa (mais recente primeiro), no modelo Stripe/Shopify/GitHub. Quando o
   histórico vinha errado, o fix foi lá — porque inverter no BFF só reordena a
   página que chegou, e o pedido mais novo continua na última. Item 28 de
   [09-contract-notes.md](docs/specs/09-contract-notes.md).

8. **Ação destrutiva pede diálogo e contexto.** Cancelar pedido mora **só no
   detalhe**, nunca na lista, e o `AlertDialog` **nomeia o valor estornado** em
   vez de perguntar "tem certeza?". Uma lista com ação destrutiva por linha
   convida ao clique errado — as linhas só se distinguem pelo id curto.

### Próximo passo natural

**Reviews na página do livro** ([04-reviews.md](docs/specs/04-reviews.md)) — é o
que falta do MVP, e o único pedaço fora do caminho de compra. Duas coisas já
conhecidas antes de começar:

- `GET /books/{id}/reviews` devolve `ReviewListViewModel` com **média e
  distribuição** prontas, e `customerName` já vem no review (item da 2ª rodada);
- criar review exige um pedido **`DELIVERED`** (`PURCHASE_REQUIRED`, verificado).
  Como o checkout entrega `CONFIRMED` e só o ADMIN promove status, **o cliente
  comum não consegue avaliar nada** pelo storefront. Decidir com o dono o que a
  UI faz: esconder o formulário, ou mostrá-lo desabilitado com o motivo.

Depois disso, o MVP acaba e começa a **fase 2** ([08](docs/specs/08-phase-2.md)):
wishlist, área de conta, painel admin.

**Limpezas que continuam pendentes** (nenhuma bloqueia): os
`<Button render={<Link/>}>` que avisam no console, e o rename
`middleware.ts` → `proxy.ts` que o Next 16 pede.

### 🟡 Achados abertos desta etapa (não bloqueiam)

1. **`nativeButton` do Base UI:** sobram **7** usos de
   `<Button render={<Link/>}>` em `not-found.tsx`, `page.tsx`,
   `catalog-filters.tsx`, `categories-menu.tsx` e `site-header.tsx` (os botões
   "Entrar"/"Criar conta") que emitem aviso no console.
   `AddToCartButton`, `CartButton`, `EmptyCart` e `CartSummary` já usam
   `<Link className={buttonVariants(...)}>` — mesma aparência, semântica de
   link. Falta replicar nos que restaram; é limpeza à parte.
2. **H2 é em memória:** reiniciar o backend **regenera todos os ids**. Nenhum
   teste pode fixar UUID; os smoke descobrem o livro via `GET /books` e **criam
   os pedidos que vão usar** — supor que o histórico já tem algo faz o teste
   passar calado num banco novo, que é pior que falhar.
3. **`DropdownMenuItem` é a exceção ao ponto 1.** "Meus pedidos" usa
   `render={<Link/>}` **de propósito**: um item de menu precisa manter o papel
   `menuitem` e o teclado do menu, e é isso que o `render` preserva. A troca por
   âncora estilizada vale para CTA, não aqui.

⚠️ **Aviso do build (não urgente):** o Next 16 marca `middleware.ts` como
convenção **deprecada** em favor de `proxy.ts`. Só um rename + ajuste de
assinatura, mas mexe no núcleo da renovação de token — fazer isoladamente, numa
etapa só dele.

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
