# 21 — Alinhamento com o backend em microsserviços

> Plano para trazer o BFF ao estado atual do Bookland (backend em `5 serviços`, outubro de 2026).
> Escrita em 2026-10-08 a partir de uma leitura do código dos dois lados; etapas 2–5 detalhadas por
> arquivo em 2026-10-09 (seção "Revisão"). Substitui partes da
> [02-auth.md](02-auth.md), da [19-checkout.md](19-checkout.md) e da
> [09-contract-notes.md](09-contract-notes.md) — essas specs descrevem o backend de julho.
>
> **Regra de sempre: a API vence.** A fonte do contrato agora são **três** documentos OpenAPI (ver
> etapa 2), não mais um.

## O que mudou no backend desde a última spec

| Antes (julho/agosto) | Agora |
|---|---|
| Um processo Spring em `:8080` | **Gateway** em `:8080` encaminhando para a API (`:8083`) e o catálogo (`:8082`); **identidade** em `:9000`, fora do gateway; notificação sem HTTP |
| Login JWT caseiro: `POST /auth/login`, `/refresh`, `/logout` devolvendo `TokenViewModel`, HS384 | **Spring Authorization Server**: OAuth2 *authorization code* + PKCE em `/oauth2/authorize` e `/oauth2/token`, RS256, OIDC (`id_token`, `/connect/logout`). As rotas antigas **não existem** |
| `POST /auth/register` devolvia tokens | Devolve **201 com a conta** (`id`, `email`, `name`, `role`) e **nenhum token** |
| Access 24 h | Access **15 min**, refresh **7 dias**, de **uso único** |
| Claims `sub, email, role` | `sub` (UUID), `email`, `role`, **`name`**, `aud = bookland-api` |
| Checkout síncrono: pedido já `CONFIRMED` e pago | **Saga assíncrona**: **202** com o pedido `PENDING`; o desfecho (`CONFIRMED`, `REJECTED`, `PAYMENT_FAILED`) chega segundos depois |
| Carrinho esvaziado no checkout | Carrinho mantido até `CONFIRMED`; em `REJECTED`/`PAYMENT_FAILED` continua lá |
| Checkout de carrinho vazio: 404 `CART_NOT_FOUND` | **409 `CART_EMPTY`**; novos 409 `CHECKOUT_IN_PROGRESS` e 503 `CATALOG_UNAVAILABLE` |
| Cancelar de `AWAITING_PAYMENT` ou `CONFIRMED` | **Só de `CONFIRMED`** |
| `POST /admin/payments/order/{id}/refund` | **Removido** — estornar é cancelar o pedido |
| `GET /cart` de cliente novo criava o carrinho | Devolve carrinho vazio com `id`/`updatedAt` **null**, sem criar |
| Livros lidos em memória | Lidos por gRPC: com o catálogo fora, carrinho e wishlist mostram itens "Unavailable" em vez de falhar |
| — | E-mail ao cliente a cada desfecho do pedido (Mailpit em `:8025` no dev) |

## Decisões

1. **O BFF vira um cliente OAuth2 confidencial.** Ele faz o fluxo *authorization code* + PKCE, troca
   o código por tokens no servidor e guarda os três tokens (access, refresh, id) em cookies httpOnly.
   O navegador continua **nunca** vendo um token — a decisão 2 do [README](README.md) se mantém;
   muda só **quem** emite.
2. **A senha é digitada na página do serviço de identidade**, não no Next. É o ponto do fluxo:
   o BFF nunca toca na senha. A página `/login` do Next vira uma porta de entrada (um botão, ou um
   redirect direto). Uma página de login com a cara da loja **no serviço de identidade** fica para
   depois (fora desta spec).
3. **O cadastro continua no Next.** O BFF chama `POST /api/v1/auth/register` **direto no `:9000`** e
   depois inicia o login. Efeito colateral aceito: o usuário digita a senha mais uma vez logo após se
   cadastrar (a sessão que o registro cria fica no servidor do BFF, não no navegador).
4. **Reaproveitar o client `bookland-web`** já registrado (é o mesmo dos Swaggers). Um client próprio
   para o BFF seria mais limpo, mas o `ClientBootstrap` do backend registra um só; fica como melhoria.
5. **O Next roda em `http://127.0.0.1:3000`**, não `localhost`: o servidor de autorização recusa
   `localhost` como redirect URI (RFC 8252), e o cookie de `state` precisa voltar no mesmo host.

## Revisão de 2026-10-09 — o que a leitura dos dois códigos acrescentou

O backend não teve commit depois do `3f34b2d`, então a tabela acima continua valendo. Cruzando com
o código (`ClientBootstrap`, `application.yml` da identidade e do gateway, `BooklandTokenCustomizer`,
`docs/error-contract.md`, DTOs de pedidos e pagamentos) apareceram pontos que as etapas não cobriam:

| # | Achado | Efeito no BFF |
|---|---|---|
| R1 | **`TOKEN_INVALID` não é mais renovável** — o contrato manda encerrar a sessão; só `TOKEN_EXPIRED` vale um refresh | `isRefreshableCode` fica só com `TOKEN_EXPIRED` |
| R2 | **Token vencido derruba até rota pública** (`GET /books` com token ruim → 401) | Invariante: chamadas de catálogo **nunca** mandam `Authorization` (hoje já não mandam — fixar em teste) |
| R3 | **O logout via `fetch` não funciona**: o `signOut()` faz `fetch` POST, e um 302 para `:9000` dentro de um `fetch` é cross-origin (a identidade só libera CORS para 8082/8083) | Logout vira **navegação** (`<form method="post">`), e a rota responde **303** |
| R4 | `/connect/logout` encerra a sessão da identidade, mas **nada indica que revogue o refresh token** | Antes do redirect, `POST /oauth2/revoke` (Basic, `token_type_hint=refresh_token`), em melhor esforço. **Conferir em teste** se é necessário |
| R5 | **O middleware não serializa o refresh** — chama `refresh()` direto, sem o `renewTokens`. Com access de 24 h isso quase nunca doía; com **15 min** e refresh de **uso único**, toda página cujo access venceu dispara várias renovações paralelas (página + prefetch + chamadas ao BFF) e a segunda leva `invalid_grant` → logout espúrio | O middleware usa o mesmo `renewTokens`, que ganha um **memo curto** (≈30 s) "refresh já trocado → resultado" |
| R6 | Transições da saga vêm com **`changedBy: null`**; o histórico de um pedido novo é `PENDING → AWAITING_PAYMENT → CONFIRMED` (ou `PENDING → REJECTED`, `AWAITING_PAYMENT → PAYMENT_FAILED`) | `changedBy: UUID \| null`; `status-timeline` revisto |
| R7 | Pedido `PENDING`/`REJECTED` **não tem pagamento** → `GET /payments/order/{id}` dá 404 `PAYMENT_NOT_FOUND` | A página já degrada (o painel some); o polling precisa reler o pagamento quando o status muda |
| R8 | `ORDER_CANCELLATION_NOT_ALLOWED` também vale para `PENDING`/`AWAITING_PAYMENT` | Coerente com "cancelável só em `CONFIRMED`" |
| R9 | `/api/orders/[orderId]` no BFF só tem `DELETE` | O polling da etapa 4 precisa de um `GET` |
| R10 | `/media/**` é roteado pelo gateway para o catálogo | `MEDIA_BASE_URL` **não muda** (`:8080`) |
| R11 | Códigos que o BFF ainda não cataloga: `PAYMENT_NOT_FOUND`, `PAYMENT_ACCESS_DENIED`, `INVALID_ORDER_STATUS_TRANSITION`, `NOT_FOUND`, `INVALID_ARGUMENT`, `REVIEW_*`, `WISHLIST_*`, `USER_*`. `PAYMENT_DECLINED` (402) foi aposentado (o BFF não o usava) | Entram no `error-codes.ts` |
| R12 | O client tem os escopos `openid profile email`; a identidade chama o cookie de sessão de `IDENTITY_SESSION` (cookie não distingue porta) | `scope=openid profile email`; sem colisão com `bl_*` |
| R13 | O app roda em **Next 16.2** — `middleware.ts` virou `proxy.ts` (runtime Node) | A renomeação entra na etapa 3, que reescreve o arquivo de qualquer jeito |
| R14 | Com a sessão da identidade viva, refazer o login é **só redirect, sem senha** | Quando o refresh falha numa rota protegida, mandar direto para `/api/auth/login?next=…` em vez de `/login` |

## Etapas

Ordem: **2 → 3 → 4 → 5**, cada uma num branch próprio, com `pnpm test:run`, `pnpm lint` e
`pnpm build` verdes no fim. A etapa 2 **acrescenta** tipos sem remover os velhos, para o build não
quebrar antes da 3.

### Etapa 1 — backend: registrar o BFF no servidor de autorização ✅

**Feita em 2026-10-08** (backend `3f34b2d`).

- [x] Redirect URI `http://127.0.0.1:3000/api/auth/callback` (dev em `application.yml`, compose em
      `OAUTH2_CLIENT_REDIRECT_URIS`).
- [x] Post-logout redirect URI `http://127.0.0.1:3000/` (compose: `OAUTH2_CLIENT_POST_LOGOUT_REDIRECT_URIS`,
      que antes nem era repassada ao contêiner).
- [x] Removidas as URIs de `127.0.0.1:8080`.
- [x] `AuthorizationCodeFlowIntegrationTest` agora faz o fluxo com o callback do BFF, e ganhou: redirect
      não registrado → **400 sem redirecionar**; `/connect/logout` com `id_token_hint` → **302 para
      `http://127.0.0.1:3000/`**.

**Achado: o logout OIDC nunca tinha funcionado.** Para um usuário logado, `/connect/logout` exige que
o `id_token` traga um `sid` igual ao da sessão — e os tokens saíam **sem `sid`**: o servidor procura a
sessão de login pelo objeto principal (`SessionRegistry`), e o principal do Bookland não tinha
`equals`/`hashCode`. Corrigido no backend (igualdade pelo id do usuário; o cadastro passou a registrar
o fator senha, de onde sai o `auth_time`). **Consequência para a etapa 3:** o logout do BFF pode usar
`/connect/logout` com `id_token_hint` como planejado — conferido em teste. Atenção a um detalhe do
servidor: num `GET`, ele lê os parâmetros **só da query string**.

⚠️ O `ClientBootstrap` **só cria** o client se ele não existe. No dev (H2) a mudança vale na próxima
subida; no compose, exige `docker compose down -v` (ou atualizar a linha de `oauth2_registered_client`).

### Etapa 2 — contrato e configuração do BFF ✅

**Feita em 2026-10-09**, contra a stack do compose. Os schemas dos três documentos batem com o
`types.ts` fora o que já estava previsto. Duas coisas foram adiantadas da etapa 4 porque o
`Record<OrderStatus, …>`/`Record<PaymentStatus, …>` não compila sem elas: `lib/orders/status.ts`
(`PENDING`, `REJECTED`, cancelável só em `CONFIRMED`) e `lib/payments/labels.ts` (estornos).
No compose, o segredo do client é o `OAUTH2_CLIENT_SECRET` do `.env` do backend, não o
`bookland-web-secret` do perfil dev — vai no `.env.local` do BFF.

- [x] **OpenAPI:** baixar `:8083/api-docs`, `:8082/api-docs` e `:9000/api-docs` (o gateway não roteia
      `/api-docs`) para `docs/openapi/{api,catalog,identity}.json`; apagar `docs/bookland-openapi.json`.
      ⚠️ Exige os serviços no ar — **avisar o dono antes**.
- [x] `lib/api/types.ts`
  - `OrderStatus` + `PENDING`, `REJECTED`; `OrderViewModel` + `statusReason: string | null`.
  - `StatusTransitionViewModel.changedBy: UUID | null` (R6).
  - `PaymentStatus` + `REFUND_PENDING`, `REFUND_FAILED`.
  - `CartViewModel.id` e `updatedAt`: `| null`.
  - `UpdateOrderStatusRequest` sem `adminId`.
  - Novos: `RegisteredUserViewModel` (`id`, `email`, `name`, `role`) e `OAuthTokenResponse`
    (`access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `scope`).
  - `TokenViewModel`, `LoginRequest`, `RefreshTokenRequest` e `LogoutRequest` **ficam até a etapa 3**.
- [x] `lib/api/error-codes.ts`: entram `CART_EMPTY`, `CHECKOUT_IN_PROGRESS`, `CATALOG_UNAVAILABLE`,
      `ORDERS_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE` e os de R11; `REFRESHABLE_CODES`
      só com `TOKEN_EXPIRED` (R1). `INVALID_CREDENTIALS`/`INVALID_REFRESH_TOKEN` saem na etapa 3.
- [x] `lib/api/error-messages.ts`: mensagens em português para os novos códigos.
- [x] `lib/config.ts` + `.env.example`: `IDENTITY_BASE_URL` (`BOOKLAND_IDENTITY_URL`, default
      `http://127.0.0.1:9000`), `OAUTH_CLIENT_ID` (`BOOKLAND_OAUTH_CLIENT_ID`, default `bookland-web`),
      `OAUTH_CLIENT_SECRET` (`BOOKLAND_OAUTH_CLIENT_SECRET`, só servidor, sem default fora do dev),
      `BFF_BASE_URL` (`BOOKLAND_BFF_URL`, default `http://127.0.0.1:3000`); `COOKIE` ganha `id`
      (`bl_id`) e `oauth` (`bl_oauth`). `BOOKLAND_API_URL` e `NEXT_PUBLIC_BOOKLAND_MEDIA_URL` continuam
      no `:8080` (R10).
- [x] `package.json`: `"dev": "next dev -H 127.0.0.1"` (decisão 5).
- [x] `lib/api/client.ts`: opção `baseUrl` no `apiFetch` (o registro vai à identidade, não ao gateway),
      em vez de um segundo cliente.

### Etapa 3 — autenticação OAuth2 (a maior)

```
GET  /api/auth/login?next=/x   → se o host não for o de BFF_BASE_URL, 307 para o mesmo caminho lá
                                 (senão o cookie bl_oauth nasce em localhost e o callback não o vê)
                                 → gera state + code_verifier; grava bl_oauth = {state, verifier, next}
                                   (httpOnly, SameSite=Lax, Path=/api/auth/callback, Max-Age=600)
                                 → 302 para {IDENTITY}/oauth2/authorize
                                   (response_type=code, client_id, redirect_uri,
                                    scope=openid profile email, state,
                                    code_challenge, code_challenge_method=S256)
GET  /api/auth/callback        → ?error=… ou state ≠ cookie → 302 para /login?error=…
                                 → POST {IDENTITY}/oauth2/token (Basic; grant_type=authorization_code,
                                   code, redirect_uri, code_verifier)
                                 → grava bl_access, bl_refresh, bl_id; apaga bl_oauth
                                 → 302 para next (sanitizado por next-path.ts)
POST /api/auth/logout          → POST {IDENTITY}/oauth2/revoke (refresh, melhor esforço — R4)
                                 → apaga os cookies
                                 → 303 para {IDENTITY}/connect/logout?id_token_hint=…
                                   &post_logout_redirect_uri={BFF}/   (na query string: num GET o
                                   servidor só lê dela); sem bl_id, 303 direto para /
POST /api/auth/register        → POST {IDENTITY}/api/v1/auth/register → 201 RegisteredUserViewModel
                                 → o formulário faz window.location.assign(/api/auth/login?next=…)
```

Por arquivo:

- [ ] **Novo `lib/auth/oauth.ts`** — funções puras + `fetch` direto (o token endpoint recebe
      `application/x-www-form-urlencoded`, não JSON, então não passa pelo `apiFetch`):
      `createPkcePair()` (`crypto.getRandomValues` + `crypto.subtle.digest`, base64url),
      `buildAuthorizeUrl()`, `exchangeCode()`, `refreshTokens()`, `revokeRefreshToken()`,
      `buildEndSessionUrl()`. Um erro OAuth (`{"error":"invalid_grant"}`) vira `ApiError` 401 com o
      código `SESSION_ENDED` (só do BFF, na seção "client-side only" do `error-codes.ts`).
- [ ] `lib/auth/cookies.ts` — `writeTokens(OAuthTokenResponse)`: access com `Max-Age = expires_in`,
      refresh e id com 7 dias (o endpoint não informa a validade do refresh); `clearTokens` apaga os
      três. Funções para ler, gravar e apagar `bl_oauth`. As opções de cookie viram uma função só,
      usada também pelo proxy (hoje estão duplicadas em `middleware.ts`).
- [ ] `lib/auth/refresh.ts` — passa a chamar `oauth.refreshTokens` e ganha o memo de R5
      (`Map<refresh usado, { resultado, expiraEm }>`, ≈30 s). Continua sem tocar em cookies.
- [ ] `middleware.ts` → **`proxy.ts`** (export `proxy`, R13) — usa `renewTokens` (R5); grava os três
      cookies; quando não há sessão recuperável numa rota protegida, redireciona para
      `/api/auth/login?next=…` (R14). O matcher continua pulando `api/auth`.
- [ ] `lib/auth/session.ts` — claim `name?: string` → `SessionUser.name`; `aud` ignorado. Continua
      sem verificar assinatura.
- [ ] Rotas: **novas** `api/auth/callback/route.ts` e `api/auth/login/route.ts` (agora `GET`);
      **reescritas** `logout` e `register`; **apagada** `api/auth/refresh/route.ts` (nenhum código do
      cliente a chama, e a renovação vive no proxy — confirmar com grep antes de apagar).
- [ ] `lib/api/auth.ts` — fica só `register()` (contra `IDENTITY_BASE_URL`, devolvendo
      `RegisteredUserViewModel`). Saem `login`, `refresh` e `logout`.
- [ ] `lib/api/auth-client.ts` — saem `signIn` e `signOut` (R3); `signUp` fica; ganha
      `loginHref(next)`.
- [ ] Páginas e componentes
  - `(auth)/login/page.tsx`: sem `?error`, `redirect()` imediato para `/api/auth/login?next=…`;
    com `?error`, mostra o motivo e um botão "Tentar de novo". `login-form.tsx` (e o teste) é apagado.
  - `register-form.tsx`: no 201, `window.location.assign(loginHref(next))` — navegação completa, não
    `router.push` (o destino final é outra origem). `EMAIL_ALREADY_EXISTS` e `VALIDATION_ERROR`
    seguem como hoje.
  - `account-menu.tsx`: "Sair" vira `<form method="post" action="/api/auth/logout">`; saudação pelo
    `name`, com o e-mail de fallback. Os links "Entrar" do header apontam para `loginHref`.
- [ ] `types.ts`/`error-codes.ts`/`error-messages.ts`: remover o que ficou para trás (`TokenViewModel`,
      `LoginRequest`, `RefreshTokenRequest`, `LogoutRequest`, `INVALID_CREDENTIALS`,
      `INVALID_REFRESH_TOKEN`).
- [ ] Conta (`/users/{id}`), quando entrar, vai **direto no `:9000`** — não passa pelo gateway.
- [ ] Testes
  - unit: PKCE (vetor do RFC 7636, apêndice B), URLs de authorize e end-session, sanitização do
    `next` no callback, opções de cookie, memo do `renewTokens` (duas chamadas concorrentes = uma ao
    upstream; uma chamada tardia com o refresh velho recebe o mesmo par).
  - MSW: callback (state errado, `error=access_denied`, código inválido, sucesso), refresh (sucesso,
    `invalid_grant`), logout (com e sem `bl_id`; revoke falhando não impede o logout), register
    (201, 409).
  - smoke (`live-contract.smoke.test.ts`): o fluxo por código — GET `/login` da identidade, POST com
    CSRF e cookie `IDENTITY_SESSION`, `/oauth2/authorize`, callback do BFF. **Avisar o dono antes.**

### Etapa 4 — checkout assíncrono

- [ ] `lib/api/orders.ts` + `api/cart/checkout/route.ts`: repassar o **202** com o pedido `PENDING`;
      as docstrings deixam de falar em "já `CONFIRMED` e pago".
- [ ] **`GET` em `api/orders/[orderId]/route.ts`** (R9) — devolve `{ order, payment | null }`, a mesma
      forma que a página monta; 403 vira 404, como na página.
- [ ] **Novo `components/orders/order-progress.tsx`** (cliente): montado só quando o status é
      `PENDING`/`AWAITING_PAYMENT`; consulta o `GET` acima a cada 1,5 s, com teto de 60 s; quando o
      status muda, `router.refresh()` (re-renderiza a página inteira — pagamento e badge do carrinho
      junto, R7). Passado o teto: "seu pagamento está demorando, avisaremos por e-mail". Para ao
      desmontar e enquanto a aba está oculta (`visibilitychange`).
- [ ] `orders/[orderId]/page.tsx`: banner de desfecho — `REJECTED`/`PAYMENT_FAILED` mostram o
      `statusReason` e "Voltar ao carrinho" (o carrinho continua lá); `CONFIRMED` agradece.
- [ ] `checkout-form.tsx`: `CART_NOT_FOUND` → **`CART_EMPTY`**; `CHECKOUT_IN_PROGRESS` → alerta com
      link para `/orders` (o erro não traz o id do pedido); `CATALOG_UNAVAILABLE`, `UPSTREAM_TIMEOUT`
      e `UPSTREAM_UNAVAILABLE` → alerta "tente de novo". No sucesso, o `router.refresh()` deixa de ser
      para "zerar o badge" — o carrinho só esvazia no `CONFIRMED`, e quem atualiza é o `order-progress`.
- [x] (adiantado para a etapa 2) `lib/orders/status.ts`: `PENDING` "Processando", `REJECTED` "Recusado"; **cancelável só em
      `CONFIRMED`** (`AWAITING_PAYMENT` deixa de ser). Atualizar os comentários.
- [ ] `status-timeline.tsx`: o histórico novo (R6) e `changedBy` nulo.
- [x] (adiantado para a etapa 2) `lib/payments/labels.ts`: `REFUND_PENDING` "Estorno em andamento", `REFUND_FAILED`
      "Estorno com problema".
- [ ] `cancel-order-button.tsx`: o diálogo continua certo (cancelar `CONFIRMED` estorna), mas o
      estorno agora é assíncrono — dizer "o estorno será processado".
- [ ] Testes: `status.test.ts`, `status-timeline.test.tsx`, `checkout-form.test.tsx` (códigos novos),
      `order-progress` com timers falsos (para no desfecho, para no teto), a rota `GET` com MSW.

### Etapa 5 — ajustes menores e documentação

- [ ] `GET /cart` com `id: null`: conferir `cart.ts`, `current-cart.ts` e a página — tratar como vazio.
- [ ] Itens "Unavailable" (catálogo fora): `cart-line.tsx` já trata `available: false`; conferir o
      título que chega como placeholder e o checkout bloqueando "Pagar" com item indisponível.
- [ ] Reviews: a lista já vem da mais nova para a mais antiga (tirar qualquer ordenação no BFF);
      `DUPLICATE_REVIEW` também em corrida.
- [ ] Remover as menções à rota de estorno avulso (`client.ts`, `payments.ts`).
- [ ] Teste do invariante R2 (catálogo sem `Authorization`).
- [ ] Atualizar o `CONTEXT.md` (a seção "API Bookland — referência" inteira), [02](02-auth.md),
      [09](09-contract-notes.md), [19](19-checkout.md) e [20](20-orders-history.md).

## Fora desta spec

- Página de login com a identidade visual da loja (no serviço de identidade).
- Client OAuth próprio para o BFF.
- Notificações na interface (hoje o cliente recebe e-mail).
- As telas da fase 2 ([08](08-phase-2.md)).
