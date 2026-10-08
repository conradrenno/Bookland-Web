# 21 — Alinhamento com o backend em microsserviços

> Plano para trazer o BFF ao estado atual do Bookland (backend em `5 serviços`, outubro de 2026).
> Escrita em 2026-10-08 a partir de uma leitura do código dos dois lados. Substitui partes da
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

## Etapas

### Etapa 1 — backend: registrar o BFF no servidor de autorização

No repositório do backend (`bookland`), só configuração:

- [ ] Redirect URI `http://127.0.0.1:3000/api/auth/callback` (dev em `application.yml`, compose em
      `OAUTH2_CLIENT_REDIRECT_URIS`).
- [ ] Post-logout redirect URI `http://127.0.0.1:3000/`.
- [ ] Remover as URIs de `127.0.0.1:8080` que sobraram da época em que a 8080 era a API.
- [ ] Teste de integração no serviço de identidade provando que o client aceita o callback do BFF e
      recusa um redirect não registrado.

⚠️ O `ClientBootstrap` **só cria** o client se ele não existe. No dev (H2) a mudança vale na próxima
subida; no compose, exige `docker compose down -v` (ou atualizar a linha de `oauth2_registered_client`).

### Etapa 2 — contrato e configuração do BFF

- [ ] Baixar os três OpenAPI: `http://127.0.0.1:8083/api-docs` (API), `:8082/api-docs` (catálogo),
      `:9000/api-docs` (identidade). O gateway não roteia `/api-docs`.
- [ ] `types.ts`: `OrderStatus` + `PENDING`, `REJECTED`; `OrderViewModel` + `statusReason`;
      `PaymentStatus` + `REFUND_PENDING`, `REFUND_FAILED`; `UpdateOrderStatusRequest` sem `adminId`;
      `RegisteredUserViewModel` (`id`, `email`, `name`, `role`) no lugar do `TokenViewModel` no
      registro; tipo da resposta do `/oauth2/token`.
- [ ] `error-codes.ts`: saem `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`; entram `CART_EMPTY`,
      `CHECKOUT_IN_PROGRESS`, `CATALOG_UNAVAILABLE`, `ORDERS_UNAVAILABLE`, `UPSTREAM_TIMEOUT` (504 do
      gateway), `UPSTREAM_UNAVAILABLE` (502 do gateway). Conferir contra o `docs/error-contract.md` do
      backend.
- [ ] `config.ts` / `.env.example`: `BOOKLAND_API_URL` continua `http://localhost:8080` (agora o
      gateway); entram `BOOKLAND_IDENTITY_URL=http://127.0.0.1:9000`, `BOOKLAND_OAUTH_CLIENT_ID`,
      `BOOKLAND_OAUTH_CLIENT_SECRET` (só servidor) e `BOOKLAND_BFF_URL=http://127.0.0.1:3000`.

### Etapa 3 — autenticação OAuth2 (a maior)

```
GET  /api/auth/login?next=/x   → cria state + code_verifier (cookie curto, httpOnly)
                                 → 302 para {IDENTITY}/oauth2/authorize
                                   (response_type=code, client_id, redirect_uri, scope=openid profile,
                                    state, code_challenge, code_challenge_method=S256)
GET  /api/auth/callback        → confere state; POST {IDENTITY}/oauth2/token
                                   (Basic client:secret; grant_type=authorization_code, code,
                                    redirect_uri, code_verifier)
                                 → grava bl_access, bl_refresh, bl_id; apaga o cookie do state
                                 → 302 para next (sanitizado, como hoje)
POST /api/auth/logout          → apaga os cookies
                                 → 302 para {IDENTITY}/connect/logout?id_token_hint=…&post_logout_redirect_uri=…
POST /api/auth/register        → POST {IDENTITY}/api/v1/auth/register → 201
                                 → o front segue para /api/auth/login?next=…
```

- [ ] `lib/auth/oauth.ts`: PKCE (`crypto.subtle`, funciona no Edge e no Node), montagem das URLs,
      troca de código, refresh. Funções puras + `fetch`, testáveis com MSW.
- [ ] Refresh no middleware: `POST /oauth2/token` com `grant_type=refresh_token` e Basic. Continua de
      **uso único** → a serialização de `refresh.ts` continua. Falha vem como JSON OAuth2
      (`{"error":"invalid_grant"}`), **não** problem+json — tratar como "sessão encerrada".
- [ ] Cookies: `Max-Age` do access a partir de `expires_in`; do refresh, 7 dias (o token endpoint não
      informa a validade do refresh). `bl_id` só serve de `id_token_hint` no logout.
- [ ] `session.ts`: aceitar a claim `name` (o header pode cumprimentar pelo nome). Continua sem
      verificar assinatura — o upstream é a autoridade.
- [ ] Páginas: `/login` vira entrada para o fluxo; `/register` mantém o formulário (RHF + zod) e, no
      sucesso, manda para o login.
- [ ] Conta (`/users/{id}`), quando entrar, vai **direto no `:9000`** — não passa pelo gateway.
- [ ] Testes: unit do PKCE e das URLs; MSW do callback (state errado, código inválido, sucesso), do
      refresh (sucesso, `invalid_grant`) e do logout; smoke contra a stack rodando fazendo o fluxo por
      código (GET `/login` da identidade, POST com CSRF, `/oauth2/authorize`, callback).

### Etapa 4 — checkout assíncrono

- [ ] `POST /api/cart/checkout`: repassa o **202** com o pedido `PENDING`; o formulário navega para
      `/orders/{id}`.
- [ ] `/orders/[orderId]`: componente cliente que consulta `GET /api/orders/{id}` a cada ~1,5 s
      enquanto o status for `PENDING`/`AWAITING_PAYMENT`, com teto (ex.: 60 s) e mensagem de "seu
      pagamento está demorando, avisaremos por e-mail" — com o gateway de pagamento fora, o pedido
      fica em `AWAITING_PAYMENT` por bastante tempo.
- [ ] `REJECTED` e `PAYMENT_FAILED`: mostrar o `statusReason` e um "voltar ao carrinho" (o carrinho
      continua lá).
- [ ] Erros do checkout: `CART_EMPTY` (409), `CHECKOUT_IN_PROGRESS` (409 — já existe um pedido em
      andamento), `CATALOG_UNAVAILABLE` (503), `UPSTREAM_TIMEOUT`/`UPSTREAM_UNAVAILABLE`.
- [ ] `lib/orders/status.ts`: apresentação de `PENDING` e `REJECTED`; **cancelável só em
      `CONFIRMED`**.
- [ ] Contador do carrinho no header: o carrinho só zera no `CONFIRMED`.

### Etapa 5 — ajustes menores e documentação

- [ ] `GET /cart` com `id: null` para cliente novo (tratar como vazio, sem erro).
- [ ] Itens "Unavailable" no carrinho e na wishlist quando o catálogo está fora.
- [ ] Reviews: a lista já vem da mais nova para a mais antiga; `DUPLICATE_REVIEW` também em corrida.
- [ ] Remover qualquer menção à rota de estorno avulso.
- [ ] Atualizar `CONTEXT.md`, [02](02-auth.md), [09](09-contract-notes.md) e [19](19-checkout.md).
- [ ] Conferir se o Next 16 avisa a depreciação de `middleware.ts` em favor de `proxy.ts`.

## Fora desta spec

- Página de login com a identidade visual da loja (no serviço de identidade).
- Client OAuth próprio para o BFF.
- Notificações na interface (hoje o cliente recebe e-mail).
- As telas da fase 2 ([08](08-phase-2.md)).
