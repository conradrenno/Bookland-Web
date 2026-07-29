# 02 — Autenticação

Cobre US-01 (registro), US-02 (login), US-03 (refresh), US-04 (logout).

## Decisão: JWT em cookies httpOnly, refresh server-side

O browser **nunca** vê os tokens. O BFF guarda o par em cookies httpOnly e é o
único a renová-los.

### Cookies

| Cookie | Conteúdo | Flags |
|---|---|---|
| `bl_access` | access token (JWT curto) | `httpOnly, Secure(prod), SameSite=Lax, Path=/` |
| `bl_refresh` | refresh token | `httpOnly, Secure(prod), SameSite=Lax, Path=/` |

- `Max-Age` de cada cookie = expiração correspondente do token
  (`accessTokenExpiresAt` / `refreshTokenExpiresAt` do `TokenViewModel`).
- `SameSite=Lax` é suficiente (mesma origem; o front chama o próprio BFF).
- Nomes centralizados em `src/lib/config.ts` (`COOKIE.access`, `COOKIE.refresh`).

## Fluxos

### Registro (US-01) — `POST /api/auth/register`
1. Valida no cliente: nome, email, senha (**mín. 8 chars, ≥1 dígito**, **máx. 72**
   — o servidor responde `size must be between 8 and 72`).
2. BFF → `POST /api/v1/auth/register` → **201** + `TokenViewModel`.
3. BFF grava `bl_access` + `bl_refresh`; responde 200 (front redireciona).
4. Email duplicado → upstream **409 `EMAIL_ALREADY_EXISTS`** (✅ verificado
   2026-07-28) → BFF repassa; a UI mostra **erro inline no campo e-mail**, não
   banner global (o usuário precisa corrigir aquele campo).

### Login (US-02) — `POST /api/auth/login`
1. BFF → `POST /api/v1/auth/login` → `TokenViewModel`; grava cookies.
2. Credencial inválida → **401 `INVALID_CREDENTIALS`** (mensagem genérica, sem
   revelar qual campo). **Não** disparar refresh nesse caso.

### Refresh (US-03) — interno, `POST /api/auth/refresh`
1. Lê `bl_refresh`; BFF → `POST /api/v1/auth/refresh` (`{ refreshToken }`).
2. Sucesso → `TokenViewModel` novo; **regrava ambos os cookies** (rotação — o
   contrato devolve novo refresh, então o anterior é descartado).
3. Refresh expirado/inválido → **401** → limpa cookies → sessão encerrada.

### Logout (US-04) — `POST /api/auth/logout`
1. BFF → `POST /api/v1/auth/logout` (`{ refreshToken }`) para revogar no servidor.
2. **Sempre** limpa `bl_access` + `bl_refresh` localmente, mesmo se o upstream
   falhar (logout local nunca deixa o usuário preso).

## 🔴 Restrição do Next que definiu o desenho (descoberta 2026-07-28)

**Server Component não escreve cookie.** No Next 16 `cookies()` é assíncrono e,
durante um render, devolve um store **somente leitura** — `.set()` lança. Só
**Route Handler**, **Server Action** e **Middleware** podem escrever.

Combinado com a **rotação** do refresh token, isso inviabiliza o plano original
("refresh reativo no `apiFetch`"):

> Se uma página (RSC) renovasse ao tomar 401, receberia um refresh token novo e
> **não conseguiria gravá-lo**. O cookie continuaria com o token antigo — que a
> renovação acabou de invalidar. **A sessão morreria na requisição seguinte.**

Não é um detalhe de implementação: é a diferença entre a sessão funcionar e cair
sozinha. Daí o desenho abaixo.

| Contexto | Lê cookie | Escreve cookie | Papel na renovação |
|---|---|---|---|
| Middleware | ✅ | ✅ | **renova preventivamente** |
| Route Handler | ✅ | ✅ | renova sob demanda (`POST /api/auth/refresh`) |
| Server Component | ✅ | ❌ | só consome o token já renovado |

## Middleware (`src/middleware.ts`) — onde a renovação acontece

1. `bl_access` válido (com folga de **30 s**) → segue direto, sem custo.
2. Expirado/ausente **e sem** `bl_refresh` → rota protegida redireciona para
   `/login?next=<rota>`; rota pública renderiza deslogada.
3. Expirado/ausente **com** `bl_refresh` → renova e grava **os dois** cookies.
4. Renovação recusada → limpa cookies; protegida vai para `/login`.

A gravação é dupla, e isso importa:

```ts
request.cookies.set(...)   // o render ATUAL enxerga o token novo
response.cookies.set(...)  // o browser persiste
```

Só o segundo faria a requisição corrente renderizar com o token velho.

O `matcher` exclui `_next/*`, assets e **`/api/auth/*`** — as rotas de auth
gerenciam o próprio cookie e seriam renovadas por baixo.

## Refresh serializado (`src/lib/auth/refresh.ts`)

Uma **promise em voo** no módulo: o primeiro a renovar executa, os demais
aguardam o mesmo resultado. Sem isso, duas chamadas paralelas renovam em
paralelo e a segunda apresenta um token que a primeira já consumiu →
`INVALID_REFRESH_TOKEN` → sessão derrubada sem o usuário ter feito nada.

A promise é limpa no `finally` — **sucesso e falha**. Se sobrevivesse a uma
rejeição, toda renovação futura daquele processo repetiria o mesmo erro.

> ⚠️ **Alcance da garantia: um processo.** Middleware (Edge) e route handlers
> (Node) podem viver em runtimes distintos, e deploy multi-instância multiplica
> isso. Resolve a corrida em processo, não a distribuída — que exigiria trava
> compartilhada. Aceitável para BFF single-node; revisar se escalar.

### ✅ Desbloqueado em 2026-07-27 — a API separa 401 de 403

O backend passou a devolver **401** para problema de *identidade* e **403** para
problema de *permissão*, com corpo `application/problem+json` + um **`code`**
estável. Verificado ao vivo:

| Situação | Status | `code` | Ação do BFF |
|---|---|---|---|
| sem `Authorization` | 401 | `TOKEN_MISSING` | tem `bl_refresh`? refresh : login |
| token corrompido | 401 | `TOKEN_INVALID` | tenta refresh (1×) |
| token expirado | 401 | `TOKEN_EXPIRED` | tenta refresh (1×) |
| login errado | 401 | `INVALID_CREDENTIALS` | **não** faz refresh — erro de form |
| refresh inválido/rotacionado | 401 | `INVALID_REFRESH_TOKEN` | limpa cookies → login |
| CUSTOMER em `/admin/**` | 403 | `INSUFFICIENT_ROLE` | tela de 403, **sem** refresh |

**Regra do `apiFetch`:** ramificar por **`code`**, não pelo status sozinho — 401
de `INVALID_CREDENTIALS` (form de login) não pode disparar refresh. Tratar
`TOKEN_EXPIRED` **e** `TOKEN_INVALID` como "tenta refresh", para não depender de
qual dos dois o backend emite.

> ✅ **`/error` corrigido (2026-07-28):** exceções não tratadas agora devolvem
> **500 `INTERNAL_ERROR`** em `problem+json`, não mais o `401 TOKEN_MISSING`
> mascarado. Matriz de auth reconferida depois da mudança — sem regressão.
>
> **Ainda assim, manter a guarda:** só tratar 401 como problema de sessão quando
> `problem.instance !== "/error"`. Custa uma linha e evita que uma regressão
> futura volte a deslogar usuário por bug de servidor. Mapear também
> **`INTERNAL_ERROR` (500)** → banner genérico, sem mexer em cookies.

> `TOKEN_EXPIRED` está no schema mas **não foi verificado ao vivo** (access token
> dura 24 h). Daí cobrir os dois códigos.

### Rotação do refresh — ⚠️ o BFF precisa regravar o cookie

Verificado: `POST /auth/refresh` devolve um **novo `refreshToken` e invalida o
anterior** (reusar o antigo → 401 `INVALID_REFRESH_TOKEN`). O `POST /auth/logout`
também revoga.

Logo, ao renovar, o BFF **tem de reescrever `bl_access` e `bl_refresh`** com os
valores novos na mesma resposta. Se regravar só o access, a próxima renovação
falha e a sessão cai. Refresh concorrente (2 requests renovando juntos) faz um
dos dois perder a corrida → **serializar o refresh** (uma renovação por vez,
demais chamadas aguardam) ou aceitar um retry extra.

**TTLs observados:** access **24 h**, refresh **7 dias**.

### Claims do access token

`{ sub, email, role, iat, exp }` — o id do usuário vem em **`sub`** (não
`userId`), `role` ∈ `CUSTOMER | ADMIN`. Algoritmo **HS384**.
`getCurrentUser()` lê esses claims só para UI (a validação real é do Spring).

## Identidade nas páginas (`src/lib/auth/server.ts`)

- `getCurrentUser()` → `SessionUser | null` (`id`, `email`, `role`, `isAdmin`).
- `getAccessToken()` → token para repassar ao `apiFetch`.
- `isSignedIn()` → conveniência para layouts.

Decodifica o `bl_access` **sem validar assinatura**. Serve para decidir o que
**mostrar**, nunca o que **permitir** — a autoridade é o 401/403 do Spring.
Token corrompido degrada para "deslogado" em vez de quebrar o render.

## Arquivos implementados (2026-07-28)

| Arquivo | Papel |
|---|---|
| `lib/auth/session.ts` | claims, expiração com folga, `SessionUser` (puro) |
| `lib/auth/cookies.ts` | ler/gravar/limpar o par; `Max-Age` do próprio token |
| `lib/auth/refresh.ts` | renovação serializada |
| `lib/auth/protected-routes.ts` | quais rotas exigem sessão (puro) |
| `lib/auth/server.ts` | identidade para RSC (somente leitura) |
| `lib/api/auth.ts` | chamadas dos 4 endpoints |
| `app/api/auth/*/route.ts` | login, register, logout, refresh |
| `middleware.ts` | gate + renovação preventiva |

## Notas de contrato relevantes

- Contrato de `logout` responde **200** (sem corpo); a story cita 204. Tratamos
  qualquer 2xx como sucesso.
- `TokenViewModel` traz `accessTokenExpiresAt`/`refreshTokenExpiresAt` — usamos
  para o `Max-Age` dos cookies em vez de decodificar o JWT.
- Detalhes em [09-contract-notes.md](09-contract-notes.md).
