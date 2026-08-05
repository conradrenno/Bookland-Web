# 09 — Notas de contrato (⚠️ divergências)

Colisões entre as **stories do Linear** e a **API Bookland** (`docs/bookland-openapi.json`
+ Spring rodando).

> **Regra (dono, 2026-07-24): a API sempre vence** — em shapes *e* em regras de
> negócio. Onde uma story divergir da API já construída, a **story está
> desatualizada**; seguimos a API. As stories valem só como intenção/contexto.

Cada item abaixo já reflete essa regra (a coluna "Assumimos" = o que a API dita).

> **Revisão 1 — 2026-07-27 (manhã).** Resolvidos itens 4, 5 e 11. Novos: 12, 13, 14.
>
> **Revisão 2 — 2026-07-27 (tarde).** O dono corrigiu auth e erros:
> **resolvidos 12, 13 e 6** (+ `securitySchemes` e respostas de erro tipadas no
> spec). Verificado ao vivo, não só no spec — o desenho de auth do BFF está
> destravado.
>
> ⚠️ **Mas surgiram 2 problemas novos na instância atual:** o **item 18**
> (`POST /auth/register` quebrado) e o **item 17** (`/error` protegido faz todo
> 5xx virar `401 TOKEN_MISSING`). O 17 muda o `apiFetch` (regra defensiva) e o 18
> bloqueia cadastro e testes autenticados. Demais itens: higiene
> (1, 2, 3, 7, 9, 10, 14, 15, 16).
>
> **Revisão 3 — 2026-07-28: ✅ 17 e 18 resolvidos.** Registro volta a funcionar
> (201) e `/error` devolve **500 `INTERNAL_ERROR`** em `problem+json`. Matriz de
> auth reconferida — **sem regressão**. Fluxo autenticado ponta-a-ponta
> (carrinho → checkout → pedido → pagamento → wishlist) exercitado com sucesso
> pela primeira vez. Novos itens **19** (`@Size(255)` global; `coverImageUrl`
> encolheu) e **20** (`/error` aparece no Swagger). **Nada bloqueia o BFF.**
>
> **Revisão 4 — 2026-07-28 (com acesso ADMIN). ✅ Verificação fechada.**
> A senha do admin era **`admin1234`** (do `application.yml` dev), não a que foi
> passada — item **22**. Com o token ADMIN, **todas as pendências antigas foram
> confirmadas com dados reais**: `customerName` (item 5), `available` × estoque
> (item 7 → item **23**), painel admin, transições de status e reviews.
> Item **19 corrigido**: o limite de 255 em `coverImageUrl` é **deliberado**
> (a coluna é `varchar(255)`) — eu tinha classificado errado como acidente.
> Novos: item **24** (`stockQuantity` primitivo quebra o contrato) e a
> **causa raiz do item 21** (bug de H2, não de modelagem).
> **Nada bloqueia o BFF; o único item aberto é o 21, do lado do backend.**

## 1. Cancelamento de pedido — endpoint diferente
- **Story US-16:** `PATCH /api/v1/orders/{orderId}/cancel`
- **Contrato:** `DELETE /api/v1/orders/{orderId}` (operationId `cancel`, retorna
  `OrderViewModel`).
- **Assumimos:** usar o `DELETE`. O endpoint `/cancel` não existe.

## 2. Status de pedido — enum sem `PENDING`
- **Stories (US-14, US-16, US-17):** citam `PENDING` como status inicial/cancelável
  e fluxo `PENDING → CONFIRMED → SHIPPED → DELIVERED`.
- **Contrato (`OrderStatus`):** `AWAITING_PAYMENT, CONFIRMED, SHIPPED, DELIVERED,
  CANCELLED, PAYMENT_FAILED` — **não há `PENDING`**.
- **Assumimos:** `PENDING` (story) ↦ `AWAITING_PAYMENT` (contrato). O fluxo real
  parte de `AWAITING_PAYMENT` (há etapa de pagamento). O front **nunca** hard-coda
  PENDING; exibe o `status` retornado e trata "cancelável" como pré-envio.

## 3. Atualização de status é rota **admin**
- **Story US-17:** `PATCH /api/v1/orders/{orderId}/status`.
- **Contrato:** `PATCH /api/v1/admin/orders/{orderId}/status`.
- **Assumimos:** a rota admin. `UpdateOrderStatusRequest.adminId` (corpo) deve vir
  do token; enviar só se o backend exigir.

## 4. ~~Sem listagem geral de pedidos para admin~~ ✅ RESOLVIDO (2026-07-27)
- **Story US-17:** `GET /api/v1/admin/orders?status=&page=&size=`.
- **Contrato atual:** o endpoint **existe** — `GET /api/v1/admin/orders` com
  `status` (enum `OrderStatus`, opcional), `page` (0), `size` (20), retornando
  `PageResultAdminOrderSummaryViewModel`.
- **`AdminOrderSummaryViewModel`** = `OrderSummaryViewModel` + **`customerId`**
  (`id`, `customerId`, `status`, `totalAmount`, `itemCount`, `createdAt`).
- **Impacto:** o painel admin de pedidos (fase 2) está destravado. Atualizar
  [08-phase-2.md](08-phase-2.md).
- ⚠️ O summary traz só `customerId` (UUID), **não** o nome do cliente — a lista
  admin precisaria de `GET /users/{id}` por linha para exibir nome. Aceitável
  na fase 2 exibir o UUID curto/pedido; avaliar depois.

## 5. ~~Review não traz nome do avaliador~~ ✅ RESOLVIDO (2026-07-27)
- **Story US-20:** exibir nome anonimizado (`Jo** S***`).
- **Contrato atual:** `ReviewViewModel` agora tem **`customerName`** (string),
  além de `customerId`.
- **Assumimos:** exibir `customerName`; a **anonimização é do front** (a API
  devolve o nome completo). Fallback para "Cliente" quando vier vazio/nulo.
  Atualizar [04-reviews.md](04-reviews.md).

## 6. ~~Logout: 200 vs 204~~ ✅ RESOLVIDO (2026-07-27)
- **Story US-04:** 204 No Content. **Contrato atual:** `POST /auth/logout` → **204**.
  Story e API agora concordam. Ver item 15 para as demais mudanças de 2xx.
- Verificado: logout **revoga** o refresh token (reusá-lo depois → 401
  `INVALID_REFRESH_TOKEN`), então o logout é de verdade, não só limpeza de cookie.

## 7. ~~`available` vs `stockQuantity`~~ ✅ RESOLVIDO (2026-07-28) — ver item 23
- **Contrato (`BookViewModel`):** expõe **ambos** `available: boolean` e
  `stockQuantity: number`.
- **Confirmado ao vivo:** `available` **reflete** `stockQuantity > 0` (estoque 0
  → `available: false`). A UI usa `available` para o rótulo e oculta
  `stockQuantity`. Detalhes e códigos de erro relacionados no **item 23**.

## 8. Duplicação/rótulo de stories na wishlist
- **REN-27** está titulada "US-23" mas descreve US-22 (adicionar); **REN-28** é a
  US-23 real (ver wishlist). Fase 2 usa REN-28 como fonte de US-23.

## 9. Content-Type das respostas
- Respostas de **sucesso** seguem declarando `*/*` no OpenAPI (na prática vem
  JSON). **Erros** agora são explicitamente `application/problem+json` ✅.
- O `apiFetch` assume JSON em 2xx **com** corpo; **204 = `void`, sem parsear**
  (ver item 15). Em erro, desserializa como `ProblemDetail`/`ValidationProblemDetail`.

## 10. Menu do header/footer sem lastro na API — "Opção B" (pedido ao backend)
O header/footer (specs 13/14) originalmente previa **Best Sellers, Deals,
Authors, Publishers**. O MVP adotou a **Opção A** (menu enxuto: Categorias +
Mais bem avaliados + busca), porque a API atual **não suporta** esses itens.
Para reintroduzi-los na fase 2, o backend precisaria de:

| Item de menu | Falta na API | Necessário no Spring |
|---|---|---|
| **Best Sellers** | sem métrica de vendas; `sort` só cobre title/price/rating | contador de vendas + `sort=sales` (ou endpoint de mais vendidos) |
| **Deals** | `BookViewModel` só tem `price` (sem desconto/preço-cheio) | campos de promoção (`originalPrice`/`discount`) + filtro/flag de oferta |
| **Authors** | autores são `string[]`; sem listagem/página de autor | endpoint `GET /authors` (+ livros por autor) ou faceta de autores |
| **Publishers** | `/books` não filtra por editora | param `publisher` em `/books` (ou `GET /publishers` + livros por editora) |
| **Novidades** (opcional) | sem `createdAt` no `BookViewModel` nem `sort` por data | expor data de cadastro + `sort=newest` |

Enquanto não houver suporte, esses itens **não entram** no header/footer.

## 11. ~~Capa do livro (`coverImageUrl`) — cobertura parcial~~ ✅ RESOLVIDO (2026-07-27)
O backend já inclui **`coverImageUrl`** (string, opcional) em **todos** os DTOs
de item, além de `BookViewModel`/`Create`/`UpdateBookRequest` e do upload
`POST /api/v1/books/{bookId}/cover`:

| DTO | Ganhou |
|---|---|
| `CartItemViewModel` | **`title`**, `coverImageUrl`, `available` |
| `OrderItemViewModel` | `coverImageUrl` |
| `WishlistItemViewModel` | `coverImageUrl` |
| `LowStockBookViewModel` | `coverImageUrl` |

**Impacto:** cai a necessidade de **agregação no BFF** para miniaturas —
carrinho, pedidos e wishlist renderizam a capa direto da resposta, em 1 chamada.
Atualizar [03-catalog.md](03-catalog.md) (nota de que itens não trazem capa) e as
telas de carrinho/pedido para exibir a miniatura.

> Nota: `CartItemViewModel` **não tinha `title`** antes (a nota original dizia
> que tinha) — o carrinho era impossível de renderizar sem agregar. Agora tem.

## 12. ~~Falha de autenticação devolve 403 sem corpo~~ ✅ RESOLVIDO (2026-07-27)
O backend agora separa **401** (quem é você?) de **403** (você não pode), com
corpo `problem+json` e um **`code`** estável. **Verificado ao vivo:**

| Requisição | Status | `code` |
|---|---|---|
| `GET /cart` sem token | **401** | `TOKEN_MISSING` |
| `GET /cart` token inválido | **401** | `TOKEN_INVALID` |
| `GET /admin/orders` sem token | **401** | `TOKEN_MISSING` |
| `GET /admin/orders` com token **CUSTOMER** | **403** | `INSUFFICIENT_ROLE` |
| `GET /cart` com token válido | **200** | — |
| login errado | **401** | `INVALID_CREDENTIALS` |
| refresh reusado/revogado/inexistente | **401** | `INVALID_REFRESH_TOKEN` |

O desenho de [02-auth.md](02-auth.md) volta a valer **sem contorno**: refresh no
401. Melhor ainda — dá para ramificar por `code` em vez de só pelo status.

> ⚠️ **`TOKEN_EXPIRED` não foi verificado empiricamente**: o access token dura
> **24 h**, então não deu para esperar expirar. O `code` está documentado no
> schema `ProblemDetail`; o BFF deve tratar `TOKEN_EXPIRED` **e** `TOKEN_INVALID`
> como "tenta refresh" (assim funciona mesmo se o backend só emitir um deles).
> Um token com assinatura quebrada devolve `TOKEN_INVALID` (esperado — a
> assinatura é checada antes da expiração).

## 13. ~~Validação em string única~~ ✅ RESOLVIDO (2026-07-27)
Agora vem **`errors: { campo: [mensagens] }`**, idioma **único (inglês)**, e o
`detail` virou resumo legível:

```json
{ "status":400, "title":"Bad Request", "code":"VALIDATION_ERROR",
  "instance":"/api/v1/auth/register",
  "detail":"Validation failed for 3 fields: name, password, email",
  "errors":{ "name":["must not be blank"],
             "password":["must contain at least one number",
                         "size must be between 8 and 72"],
             "email":["must be a well-formed email address"] } }
```

**Habilita erro inline nos formulários** — mapear `errors[campo]` direto no campo.
Notar: **valores são sempre array** (um campo pode quebrar N constraints, como
`password` acima). Erros do payload inteiro usam a chave **`_`**.

Também tipado no OpenAPI: `ProblemDetail` e `ValidationProblemDetail` (via
`allOf`), com `status`/`title`/`code` **required**.

⚠️ **Mensagens em inglês.** A UI é pt-BR — traduzir no BFF por `code` + campo, ou
(mais simples) usar as mensagens do **Zod em pt-BR** no client e reservar
`errors` do servidor para o que só o backend sabe (ex.: e-mail já cadastrado).

### Catálogo de `code` observado ao vivo
| `code` | Status | Quando |
|---|---|---|
| `TOKEN_MISSING` | 401 | sem header `Authorization` |
| `TOKEN_INVALID` | 401 | token corrompido/assinatura inválida |
| `TOKEN_EXPIRED` | 401 | documentado no schema; **não verificado** (TTL 24 h) |
| `INVALID_CREDENTIALS` | 401 | login com e-mail/senha errados |
| `INVALID_REFRESH_TOKEN` | 401 | refresh inexistente, já rotacionado ou revogado |
| `INSUFFICIENT_ROLE` | 403 | autenticado, sem a role exigida |
| `VALIDATION_ERROR` | 400 | corpo reprovado no Bean Validation (**tem `errors`**) |
| `INVALID_PARAMETER` | 400 | path/query com tipo errado (**tem `errors`**) |
| `MALFORMED_REQUEST` | 400 | corpo ausente ou JSON inválido |
| `BOOK_NOT_FOUND` | 404 | recurso inexistente (padrão `<ENTIDADE>_NOT_FOUND`) |
| `CATEGORY_NOT_FOUND` | 404 | `GET /categories/{id}/books` com id inexistente (ver item 25) |
| `EMAIL_ALREADY_EXISTS` | 409 | cadastro com e-mail já usado → **erro inline no campo** |
| `PURCHASE_REQUIRED` | 403 | avaliar livro sem pedido **DELIVERED** (ver [04-reviews.md](04-reviews.md)) |
| `DUPLICATE_REVIEW` | 409 | segunda review do mesmo cliente no mesmo livro |
| `CART_ITEM_UNAVAILABLE` | 409 | adicionar ao carrinho livro com estoque 0 |
| `INSUFFICIENT_STOCK` | **422** | ajuste de inventário abaixo de zero (único 422 visto) |
| `INTERNAL_ERROR` | 500 | falha não tratada no servidor → banner genérico |

> Todos os acima foram **observados ao vivo**. O backend tem um
> `docs/error-contract.md` com a lista canônica — vale conferir se há mais.

> Regra do próprio backend: **ramificar por `code`**; `detail` é prosa e pode ser
> reescrito a qualquer momento — **nunca parsear**. O backend tem um
> `docs/error-contract.md` (citado na descrição do schema) — vale ler para pegar
> a lista completa de `code`, já que só estes apareceram nos testes.

## 14. ISBN: regex afrouxado (aceita hífen/espaço) — NOVO
`CreateBookRequest.isbn` mudou de `\d{13}` para **`\s*(?:\d[\s-]*){13}`** —
agora aceita `978-0-13-235088-4` e não só 13 dígitos puros.
⚠️ Ao espelhar em Zod: o Bean Validation do Java usa *full match*, mas a mesma
regex em JS (`RegExp.test`) faz *partial match* — **ancorar** (`^…$`), senão o
front aceita entradas que a API rejeita. Só afeta o CRUD admin (fase 2).

## 15. Códigos de sucesso mudaram (2xx) — NOVO
Vários endpoints deixaram de devolver 200:

| Endpoint | Antes | Agora |
|---|---|---|
| `POST /auth/register` | 200 | **201** |
| `POST /auth/logout` | 200 | **204** (resolve o item 6) |
| `POST /books` | 200 | **201** |
| `POST /books/{id}/reviews` | 200 | **201** |
| `DELETE /books/{bookId}` | 200 | **204** |
| `DELETE /books/{bookId}/reviews/{reviewId}` | 200 | **204** |
| `DELETE /users/{id}` | 200 | **204** |
| `POST /admin/payments/order/{orderId}/refund` | 200 | **204** |

**Impacto no `apiFetch`:** tratar **204 como `void` sem tentar parsear JSON**
(`res.json()` em corpo vazio lança). Aceitar qualquer 2xx como sucesso e só
desserializar quando houver corpo. Coberto nos testes de
[10-testing.md](10-testing.md).

## 16. `security` global marca endpoints públicos como autenticados — NOVO (menor)
O spec declara `security: [{ bearerAuth: [] }]` no **topo** e **nenhum endpoint
sobrescreve** com `security: []`. Então `POST /auth/login`, `POST /auth/register`,
`GET /books` e `GET /categories` aparecem como se exigissem token — mas
funcionam sem (verificado: `GET /books` sem token → 200).

**Impacto:** nenhum em runtime; afeta só leitura do Swagger e geração de client
(marcaria login como autenticado). **Sugestão ao backend:** `security: []` nos
públicos. Não bloqueia nada.

## 17. ~~`/error` protegido → todo 5xx vira `401 TOKEN_MISSING`~~ ✅ RESOLVIDO (2026-07-28)
Descoberto ao testar registro (2026-07-27, tarde). Quando um handler lança uma
exceção **não tratada**, o Spring encaminha para `/error`; como `/error` **exige
autenticação** na config de segurança, o filtro responde **401 `TOKEN_MISSING`**
e o erro real (500) **nunca aparece**. Sinal claro: **`instance` vem `/error`**
em vez do path da requisição.

```
POST /api/v1/auth/register   (payload válido, sem token — rota pública)
→ 401 {"code":"TOKEN_MISSING","instance":"/error", ...}
GET  /error                  → 401 (mesma coisa)
```

**Por que era grave para o BFF:** um bug de servidor chegava disfarçado de "seu
token sumiu" — o `apiFetch` veria 401 → refresh → falha → **deslogaria o usuário**,
escondendo o 500.

**✅ Corrigido (2026-07-28):** `/error` agora é público e devolve o erro real:

```
GET /error → 500 application/problem+json
{"status":500,"title":"Internal Server Error","code":"INTERNAL_ERROR",
 "detail":"The server failed to process the request","instance":"/error"}
```

Reconferida a matriz de auth depois da mudança — **sem regressão**: 401
`TOKEN_MISSING`/`TOKEN_INVALID`, 403 `INSUFFICIENT_ROLE`, 200 autenticado, e
`instance` sempre com o path real da requisição.

> **Manter a guarda defensiva no `apiFetch` mesmo assim:** só tratar 401 como
> problema de sessão quando `instance !== "/error"`. Custa uma linha e protege
> de qualquer regressão futura desse tipo. Ver [02-auth.md](02-auth.md).
> Novo `code` a mapear: **`INTERNAL_ERROR` (500)** → banner genérico, sem
> mexer em cookies.

## 18. ~~`POST /auth/register` quebrado~~ ✅ RESOLVIDO (2026-07-28)
Registro voltou a funcionar: payload válido → **201** + `TokenViewModel` completo.

**Bônus — e-mail duplicado confirmado** (era premissa não verificada em
[02-auth.md](02-auth.md)):

```
POST /auth/register (e-mail já cadastrado)
→ 409 {"code":"EMAIL_ALREADY_EXISTS","title":"Conflict",
       "detail":"Email already registered: …","instance":"/api/v1/auth/register"}
```

Mapear `EMAIL_ALREADY_EXISTS` como erro **inline no campo e-mail** do formulário
de cadastro (não é banner global — o usuário precisa corrigir aquele campo).

## 19. `@Size(max=255)` aplicado em massa — `coverImageUrl` encolheu — NOVO (2026-07-28)
A rodada de correções adicionou `@Size(max=255)` a praticamente todo campo texto
(`RegisterRequest.name/email`, `UpdateUserRequest.name`, `AdjustInventoryRequest.reason`,
`CreateBookRequest.title/isbn/publisher/edition/authors[]`, idem `UpdateBookRequest`).

~~⚠️ Efeito colateral não intencional: `coverImageUrl` caiu de 2048 → 255.~~
❌ **Correção (2026-07-28): a redução é deliberada e está certa.** O código do
backend diz explicitamente:

```java
// 255, not 2048: books.cover_image_url and order_items.cover_image_url are both
// varchar(255), so anything longer was accepted here only to fail at the database.
@Size(max = 255) String coverImageUrl
```

Confere com a migration: `cover_image_url varchar(255)`. O **2048 é que era o
bug** — aceitava na validação para estourar no INSERT. Comportamento atual
verificado: URL de 291 chars → **400 `VALIDATION_ERROR`** com
`{"coverImageUrl": ["size must be between 0 and 255"]}` — erro limpo e por campo.

**Consequência para o front:** o Zod do CRUD admin usa **`max(255)`** em
`coverImageUrl`.

**255 é suficiente a longo prazo?** Sim — medido com casos reais: upload atual
**54** chars, OpenLibrary 57, S3 canônica 91, Google Books 111, Cloudinary com
transformações 141. O **único** caso que estoura é **URL assinada/presigned
(~358)** — que não deve ser persistida de qualquer forma, porque expira.
A regra que sustenta isso: **a coluna guarda identificador estável, não URL
renderizada**; assinatura/CDN entram na leitura. O backend já faz assim
(`ImageStoragePort.store()` devolve `/media/covers/{uuid}.ext`).
Análise completa, incluindo a saída por **proxy** caso a coluna não possa
crescer, em [03-catalog.md](03-catalog.md) › "Limite de 255 chars".

> **Falso alarme no spec:** os campos passaram a exibir `minLength: 0` no lugar de
> `minLength: 1`, o que dá a impressão de que o `@NotBlank` sumiu. **Não sumiu** —
> verificado: `{"name":"   ","email":""}` → `400 VALIDATION_ERROR` com
> `["must not be blank"]` nos dois campos. É só como o springdoc renderiza
> `@NotBlank` + `@Size` juntos. **Manter `min(1)` no Zod.**

## 20. `/error` agora aparece como endpoint no Swagger — NOVO (menor, 2026-07-28)
Ao liberar `/error`, o springdoc passou a documentá-lo: **5 operações**
(`GET/POST/PUT/PATCH/DELETE /error`, tag `problem-detail-error-controller`) —
por isso a contagem foi de 39 → **44 endpoints**. Não é rota de negócio; é ruído
de documentação. Opcional no backend: excluir via
`@Hidden` no controller ou `springdoc.paths-to-exclude=/error`.
**O front ignora `/error` na leitura do contrato.**

## 21. 🔴 `POST /auth/register` volta a quebrar (500) durante a execução — NOVO (2026-07-28)
O item 18 foi dado como resolvido e **de fato funcionou** — depois voltou a
falhar **na mesma instância, sem redeploy**. Não é regressão de código: é um
estado que a aplicação **entra em runtime**.

**Isolado — só o registro quebra.** Tudo o mais responde certo no mesmo momento:

| Chamada | Esperado | Real |
|---|---|---|
| `GET /books`, `/categories`, `/books/{id}/reviews` | 200 | **200** ✔ |
| `POST /auth/login` (inexistente) | 401 | **401 `INVALID_CREDENTIALS`** ✔ |
| `POST /auth/refresh` (inválido) | 401 | **401 `INVALID_REFRESH_TOKEN`** ✔ |
| `POST /auth/register` payload **inválido** | 400 | **400 `VALIDATION_ERROR`** ✔ |
| **`POST /auth/register` payload válido** | 201 | **500 `INTERNAL_ERROR`** ❌ |

Como o payload inválido devolve 400, a requisição **chega ao controller** e
falha **dentro do handler** — no caminho feliz.

### ✅ Causa raiz identificada (log do dono, 2026-07-28)
O `detail` do Hibernate engana — ele reporta violação de *check constraint*, mas
a **exceção raiz** é de conexão:

```
HHH000247: ErrorCode: 23514 — Check constraint invalid: "CONSTRAINT_6A: "
  SQL: insert into users (active,created_at,email,name,password_hash,role,updated_at,id)
DataIntegrityViolationException
  root cause → org.h2.jdbc.JdbcSQLNonTransientConnectionException:
               The database has been closed [90098-240]
```

Caminho no stack: `ConstraintCheck.checkRow` → `ConditionInConstantSet.getValue`
→ `SessionLocal.compare` → `getDatabase()` → **"database has been closed"**.
Ou seja: o H2 tentou avaliar o CHECK e a sessão por trás daquela conexão aponta
para um banco já fechado.

**Por que só o registro quebra:** `CONSTRAINT_6A` é o **único CHECK do schema
inteiro** — `users.role check (role in ('CUSTOMER','ADMIN'))`
(`V20260726164500__init_schema.sql`). Nenhuma outra tabela tem CHECK, então todo
o resto (leituras, `refresh_tokens`, `orders`, `cart_items`, `reviews`,
`inventory_entries`) passa longe do código quebrado. Confere com o observado:
leituras 200, login 200 (grava refresh token), checkout 200 — **só
`insert into users` falha**, de forma consistente.

> ❌ **Minha hipótese anterior (`DELETE /users/{id}` envenenava o registro) estava
> errada** — era coincidência. O gatilho real é **rotatividade de conexão do
> pool**, não a exclusão de usuário.

**Gatilho provável:** `DB_CLOSE_DELAY=-1` já está no `application.yml`, então o
banco não morre por "última conexão fechada". Sobra o **`maxLifetime` do
HikariCP (padrão 30 min)**, que aposenta conexões periodicamente: a sessão H2 que
compilou a expressão do CHECK é encerrada e a expressão em cache passa a
desreferenciar um banco fechado. Bate com o padrão observado — funciona no
primeiro teste, quebra depois de ~30 min parado, volta ao normal após restart.

**Correções sugeridas (dev; prod em PostgreSQL não é afetado):**
1. Fixar o pool no perfil dev: `spring.datasource.hikari.max-lifetime: 0`
   (nunca aposenta) — 1 linha, sem divergir schema entre dev e prod.
2. Avaliar upgrade/downgrade do H2 (hoje **2.4.240**) — o comportamento tem cara
   de bug de cache de constraint do H2, não de erro de modelagem.
3. Alternativa mais pesada: H2 em arquivo (`jdbc:h2:file:...`) em vez de `mem`.

**Impacto enquanto não corrigido:** bloqueia US-01 e a criação de qualquer
usuário de teste. **Contorno:** reiniciar a aplicação.

## 22. ~~Credenciais de admin não funcionam~~ ✅ RESOLVIDO — senha era outra (2026-07-28)
As credenciais passadas (`Bookland@Admin2024`) davam **401**. A senha real do
perfil **dev** está no `application.yml` do backend:

```yaml
bookland:
  admin:
    email: admin@bookland.com
    password: admin1234      # <- não Bookland@Admin2024
```

`admin@bookland.com` / **`admin1234`** → **200**, claims
`{sub, email, role: "ADMIN", iat, exp}`. (Em prod vem de `${ADMIN_PASSWORD}`,
por isso a divergência.) O seed **estava** ativo o tempo todo — o restart não era
necessário para isso.

### ✅ Verificações que estavam pendentes — todas fechadas
Com o token ADMIN, o que dependia de admin foi confirmado **com dados reais**:

| O que | Resultado |
|---|---|
| `GET /admin/orders` | 200, `AdminOrderSummaryViewModel` com `customerId` ✔ |
| `GET /inventory/low-stock` | 200, itens com `coverImageUrl` ✔ |
| `PATCH /admin/orders/{id}/status` | `CONFIRMED → SHIPPED → DELIVERED` ✔ (sem `adminId` no corpo) |
| **`customerName` em review** | **`"Admin"` em payload real** ✔ (item 5 fechado) |
| `ratingDistribution` | `{"5": 1}` — **chave é string** do rating |
| `averageRating` / `avgRating` | recalculados na hora (5.0) ✔ |
| Review duplicada | **409 `DUPLICATE_REVIEW`** ✔ (confirma [04-reviews.md](04-reviews.md)) |

**Pedido antigo — pode remover da lista de pendências:** não precisa mais de um
ADMIN semeado; ele já existe.

## 23. `available` reflete o estoque ✅ — item 7 fechado (2026-07-28)
Verificado zerando o estoque de um livro via `PATCH /books/{id}/inventory`:

| Estoque | `available` | Adicionar ao carrinho |
|---|---|---|
| 17 | `true` | 200 |
| **0** | **`false`** | **409 `CART_ITEM_UNAVAILABLE`** |

Então a UI pode usar **`available`** como rótulo de disponibilidade sem precisar
olhar `stockQuantity` — é exatamente o que [03-catalog.md](03-catalog.md) assumia.
*(Não testado: se `available` também vira `false` no soft-delete do livro.)*

**Novo código:** decrementar além do estoque → **422 `INSUFFICIENT_STOCK`**
(`{"delta":-999}` com estoque 17). Primeiro **422** visto na API.

## 24. 🔴 `stockQuantity` é `int` primitivo — omitir o campo dá `MALFORMED_REQUEST` — NOVO (2026-07-28)
`CreateBookRequest` declara `int stockQuantity` (primitivo, não `Integer`), e o
OpenAPI **não** o lista em `required`
(`required: [authors, categoryId, isbn, price, title]`). Mas omiti-lo quebra a
desserialização do record:

| Corpo | Resultado |
|---|---|
| sem `stockQuantity` | **400 `MALFORMED_REQUEST`** ❌ |
| `"stockQuantity": null` | **400 `MALFORMED_REQUEST`** ❌ |
| `"stockQuantity": 5` | **201** ✔ |

**O contrato mente:** o spec diz opcional, a API exige. E o erro devolvido é
`MALFORMED_REQUEST` genérico — **sem `errors` por campo**, então o formulário
admin não consegue apontar o culpado.

**Pedido ao backend:** trocar para `Integer stockQuantity` com `@NotNull`
(vira `VALIDATION_ERROR` com campo) ou default explícito. **Enquanto isso:** o
BFF **sempre envia `stockQuantity`** (0 quando não informado) no CRUD de livros —
fase 2, não afeta o MVP.

**A instância não reiniciou desde os testes anteriores:** os UUIDs dos livros
seguem idênticos (`78735f23…` = Clean Code, de horas antes). Como o backend roda
em **modo dev** (banco efêmero, re-semeado a cada subida — comprovado: os UUIDs
*mudaram* entre os testes de 27 e 28, quando a app reiniciou), um seed novo só
entra em vigor **na próxima subida**. Se o seed do admin foi adicionado agora,
**ainda não rodou**.

**Ação:** reiniciar/recompilar a aplicação. Isso deve, de uma vez só, (a) ativar
o seed do admin e (b) destravar o registro (item 21).

> **Nota de modo dev:** o banco é descartável, então dados de teste criados
> durante a verificação **não precisam de limpeza** — somem no próximo restart.
> Isso libera testes mais agressivos (criar livros, promover pedidos, etc.).

## 25. Parâmetros de `GET /books`: o que o upstream aceita calado — NOVO (2026-07-29)

Levantado ao vivo antes de escrever `lib/api/books.ts`. Nada aqui é bug do
backend — é o comportamento que a **camada de dados do BFF precisa absorver**,
porque a origem dos parâmetros é a **URL do navegador**, editável à mão.

| Entrada | Resposta do upstream | O que o BFF faz |
|---|---|---|
| `?sort=bogus` | **200**, ordem default (título) | descarta e usa `title` — não há erro a reportar |
| `?category=not-a-uuid` | **400 `INVALID_PARAMETER`** + `errors.category` | **descarta o filtro** — senão um typo na URL vira página de erro |
| `?minPrice=abc` | **400 `INVALID_PARAMETER`** + `errors.minPrice` | descarta |
| `?size=1000` | **200**, devolve tudo | **limita a `MAX_PAGE_SIZE`** — não há teto upstream |
| `?page=99` (fora do range) | **200**, `content: []` | passa direto: lista vazia é resposta correta |

> Assimetria a lembrar: **tipo errado → 400; valor desconhecido → ignorado.**
> Só o primeiro grupo derruba a página, e é o que `parseBookSearchParams` filtra.

**Outros achados da mesma rodada:**

1. **`CATEGORY_NOT_FOUND`** (404) — código novo, visto em
   `GET /categories/{id}/books` com id inexistente. Adicionado ao `ErrorCodes`.
2. **UUIDs semeados não são RFC-4122.** Ex.: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
   (nibble de versão `7`, variante `a`) e `c3d4e5f6-a7b8-9012-cdef-123456789012`
   (versão `9`). Uma regex estrita de versão/variante **rejeitaria o catálogo
   real** — por isso `isUuid` valida só a forma 8-4-4-4-12 hex.
3. **`avgRating` vem `0.0`, não ausente**, para livro sem review. Como review é
   1..5, `0` significa "sem avaliação" — nunca "zero estrelas". `formatRating`
   colapsa os dois casos em `null`.
4. **`GET /categories/{id}/books` aceita só `page`/`size`** — sem `q`, `sort` ou
   faixa de preço. Por isso a landing filtra por `searchBooks({ category })`, que
   compõe com os demais filtros; a rota por categoria fica para listagem simples.
5. **`GET /categories` devolve array cru**, não `PageResult` — única listagem não
   paginada do contrato.

## 26. Carrinho: comportamento real das mutações — NOVO (2026-07-29)

Levantado ao vivo antes de escrever `lib/api/cart.ts`, pela mesma razão do item
25: a [05-cart-checkout.md](05-cart-checkout.md) descreve estas regras a partir
da **story**, e a regra do dono é que a **API vence**. Todas foram exercitadas
com a conta admin e estão travadas em `live-contract.smoke.test.ts`.

**✅ As três regras da story se confirmam:**

| Regra afirmada pela story | Verificado |
|---|---|
| Adicionar livro já presente **incrementa** | ✅ `POST` 2 e depois 3 → linha fica **5** |
| `PATCH quantity: 0` **remove** a linha | ✅ some do `items`, confirmado por `GET` seguinte |
| Exceder estoque → **409** | ✅ e o estoque é medido contra o **acumulado no carrinho**, não contra cada requisição isolada |

**🔴 `AddCartItemRequest.quantity` é obrigatório na prática.**

O OpenAPI marca opcional (`minimum: 1`) e a story fala em "default 1". Nenhum dos
dois vale: upstream mapeia para **`int` primitivo**, então omitir o campo — ou
mandar `null` — dá **`400 MALFORMED_REQUEST`**, sem indicação de qual campo.

```
POST /cart/items  {"bookId":"…"}          → 400 MALFORMED_REQUEST
POST /cart/items  {"bookId":"…","quantity":null} → 400
POST /cart/items  {"bookId":"…","quantity":0}    → 400 VALIDATION_ERROR (errors.quantity)
```

É **a mesma classe de defeito do item 24** (`stockQuantity`), agora num segundo
DTO — vale conferir se há outros. Contorno no BFF: `addCartItem` **sempre** envia
`quantity`, com default 1 do nosso lado; o tipo em `types.ts` virou obrigatório.

**🔵 `CART_ITEM_UNAVAILABLE` é o único código de estoque no carrinho.**

`INSUFFICIENT_STOCK` está no nosso catálogo mas **nunca apareceu**. Tanto o `POST`
quanto o `PATCH` respondem `409 CART_ITEM_UNAVAILABLE`, e o mesmo código cobre
"esgotou" e "você pediu mais do que existe" — não dá para distinguir os dois pelo
`code`. O `detail` traz `available=14`, mas em inglês e sujeito a reescrita, então
**não é exibido**; a copy é uma só ("Não temos essa quantidade em estoque").

> Provável que `INSUFFICIENT_STOCK` seja da revalidação do **checkout** — a
> confirmar na etapa 5b.

**🔵 Dois códigos novos, não catalogados antes.** Ambos adicionados ao `ErrorCodes`:

| `code` | Onde |
|---|---|
| `BOOK_NOT_IN_CART` (404) | `PATCH /cart/items/{bookId}` de livro que não está no carrinho |
| `CART_NOT_FOUND` (404) | mutação quando o cliente **nunca teve** carrinho — `GET /cart` cria um vazio sob demanda, então só aparece se a primeira chamada de carrinho da conta for um `PATCH` |

**🔵 Assimetria PATCH × DELETE, que a UI aproveita:**

| | Linha ausente |
|---|---|
| `PATCH` | **404 `BOOK_NOT_IN_CART`** |
| `DELETE` | **200** com o carrinho inalterado — **idempotente** |

Duplo clique em "remover" não gera erro. Duplo clique no stepper, sim — daí o
estado pendente no componente.

**⚪ Menores, sem ação:**

1. **`DELETE /cart/items/{bookId}` devolve 200 + `CartViewModel`**, não 204. É a
   exceção à regra do item 15 ("DELETEs → 204") e está certo: a resposta é o
   carrinho atualizado, que é justamente o que evita um `GET` de volta.
2. **`bookId` não-UUID no corpo → `400 MALFORMED_REQUEST`** (falha de
   desserialização), não `INVALID_PARAMETER` com `errors.bookId`.
3. ~~**`updatedAt` vem sem fuso**~~ ✅ **RESOLVIDO pelo dono em 2026-07-30** —
   `LocalDateTime` virou `Instant` em todos os módulos. Ver o fim do item 27.
4. **`cart.id` muda** quando o carrinho fica vazio e recebe item de novo; estável
   enquanto tem conteúdo. Nada no front deve usá-lo como chave.
5. ~~**A seed não tem livro sem estoque**~~ — verificado no item 27: dá para
   fabricar o caso com `PATCH /books/{id} {"stockQuantity":0}` como admin, e a
   linha do carrinho **passa a vir `available: false`** sem precisar recarregar
   nada além do `GET /cart`.
6. **H2 é em memória:** reiniciar o backend **regenera todos os ids**. Nenhum
   teste (nem smoke) pode fixar um UUID — todos descobrem o livro via
   `GET /books`. Vale para qualquer id copiado à mão para um teste.

## 27. Checkout e pedidos: comportamento real — NOVO (2026-07-30)

Levantado ao vivo com a conta admin **antes** de escrever a spec da etapa 5b,
pela mesma razão dos itens 25 e 26. A [05-cart-checkout.md](05-cart-checkout.md)
descreve o checkout a partir da **story**, e a story erra em três pontos.

**🔴 O pedido nasce `CONFIRMED`, já pago — não existe etapa de pagamento.**

A story fala em "status PENDING" e a spec 05 apostou em `AWAITING_PAYMENT`. O que
acontece de verdade é que `POST /cart/checkout` **cobra na hora**: devolve um
`OrderViewModel` com `status: "CONFIRMED"` e um `statusHistory` que **já tem** a
transição `AWAITING_PAYMENT → CONFIRMED`. O `AWAITING_PAYMENT` existe por um
instante dentro da transação e nunca é observável pelo cliente.

```
POST /cart/checkout {"paymentMethod":"PIX"}
→ 200 { status: "CONFIRMED",
        statusHistory: [{ fromStatus:"AWAITING_PAYMENT", toStatus:"CONFIRMED", … }] }

GET /payments/order/{orderId}
→ 200 { status:"APPROVED", method:"PIX", gatewayTransactionId:"SIM-1759835a-…" }
```

O gateway é **simulado** (prefixo `SIM-`) e aprovou **8 de 8** tentativas. Não dá
para provar que nunca recusa, então a UI **exibe o `status` que vier** e sabe
desenhar `PAYMENT_FAILED` — mas não constrói fluxo de "pagar de novo", que não
existe endpoint para fazer. Consequência prática: **não há tela de pagamento**;
`paymentMethod` é a única coisa que o backend recebe (sem cartão, sem endereço).

**🔴 Carrinho vazio no checkout responde `404 CART_NOT_FOUND`, não 409.**

E vale mesmo para carrinho que **existe e ficou vazio** (adicionar + remover):

```
POST /cart/checkout  (carrinho sem itens)  → 404 CART_NOT_FOUND
GET  /cart           (mesmo instante)      → 200 {items: [], total: 0}
```

Os dois endpoints discordam sobre o mesmo estado. A copy que já temos para
`CART_NOT_FOUND` ("Seu carrinho está vazio.") serve, mas a UI não deve depender
disso: quem impede o caso é a própria página, que não oferece o CTA sem itens.

**🔵 `INSUFFICIENT_STOCK` continua não existindo.** A suspeita do item 26 (de que
ele seria da revalidação do checkout) **não se confirma**: forçando o caso —
livro no carrinho, admin zera o estoque, checkout — vem outra vez
`409 CART_ITEM_UNAVAILABLE`. O código segue no catálogo sem nunca ter aparecido.

**🔴 Os itens problemáticos do 409 só existem dentro do `detail`, em inglês.**

```
409 { code:"CART_ITEM_UNAVAILABLE",
      detail:"Insufficient stock for books: [175c35f7-0e36-4bbe-a43d-6402caef0cbf]" }
```

A spec 05 prometia "409 com os itens problemáticos; UI lista e aponta o que
remover". **Não há campo estruturado** — nem `errors`, nem lista de ids. Fazer
parse do `detail` violaria a regra de nunca ramificar por mensagem
([15](15-code-conventions.md)), e ele é documentado como reword-able.

**Não precisa:** o `GET /cart` já marca `available: false` na linha exata assim
que o estoque some (verificado). Então o caminho do 409 é *devolver o cliente ao
carrinho* — que se explica sozinho, com a copy e o "+" bloqueado que a etapa 5a
já entregou.

**🔵 Validação do `paymentMethod`: dois códigos diferentes para o mesmo campo.**

| Corpo | Resposta |
|---|---|
| `{}` (ausente) | `400 VALIDATION_ERROR` com `errors.paymentMethod: ["must not be null"]` |
| `{"paymentMethod":"BITCOIN"}` | `400 MALFORMED_REQUEST`, sem dizer qual campo |

O segundo é o enum quebrando na desserialização — mesma classe dos itens 24 e 26.
Como o valor sempre sai de um seletor nosso, o BFF valida contra a lista antes de
subir e nenhum dos dois deveria alcançar o usuário.

**🔵 Pedidos — o que confere e o que não confere com a [06](06-orders.md):**

| Afirmação da spec 06 | Ao vivo |
|---|---|
| `DELETE /orders/{id}` cancela | ✅ e **funciona com `CONFIRMED`**, devolvendo o pedido com `status: "CANCELLED"` |
| Detalhe só do dono; inexistente → 404 | ✅ `404 ORDER_NOT_FOUND` (código novo, catalogar) |
| Histórico **ordenado por data decrescente** | ❌ **veio crescente** — `content[0]` é o pedido mais antigo |

**📘 O README do backend (lido em 2026-07-30) explica duas dessas linhas:**

1. **A ordenação decrescente nunca foi prometida ao cliente.** O README promete
   "newest first" **só** em `GET /admin/orders`; a rota do cliente aparece como
   "Order history (paginated)", sem ordem. Ou seja: não é bug, é ausência de
   garantia. **Ordenar no BFF** na etapa 6 — e não contar com a ordem que vier.
2. **Cancelamento sai do palpite.** "From `AWAITING_PAYMENT` or `CONFIRMED`; the
   latter triggers stock restore and automatic refund." Confirma o `DELETE` que
   rodei e explica o `REFUNDED` que a página do pedido pode exibir depois.

**📘 E abre uma porta que a spec 19 aproveita:** `GET /payments/order/{orderId}`
é **autenticado, não admin** — o cliente lê o próprio pagamento. Como o
`OrderViewModel` **não traz `paymentMethod`**, é a única forma de mostrar na tela
o método que o cliente acabou de escolher.

**📘 Segunda conta semeada:** `joao@bookland.com` / `joao1234` (CUSTOMER), além do
admin. Permite finalmente medir o acesso a pedido de outro cliente (403 × 404) e
rodar os smoke pelo perfil que a app de fato usa.

**✅ Datas sem fuso — RESOLVIDO no mesmo dia (2026-07-30).**

O achado era: `"2026-07-30T13:01:34.4862"`, sem `Z` e sem offset, agora em campo
**exibido** (`createdAt` do pedido, `changedAt` do histórico). Uma string assim
não identifica um instante — quem faz o parse aplica o próprio fuso. Medido em
Node com a string real: máquina brasileira lia 13:01, container em UTC lia 10:01.
Em SSR o servidor e o navegador discordariam e o texto **mudaria sozinho** depois
da hidratação.

O dono trocou `LocalDateTime` por **`Instant` em todos os módulos**. Conferido ao
vivo logo depois de subir:

```
"createdAt": "2026-07-30T19:55:57.117193400Z"
```

| Conferência | Resultado |
|---|---|
| Campos varridos (carrinho, pedido, histórico, pagamento, usuário) | **9**, todos com `Z` |
| Tipo | **string** ISO — não epoch (`WRITE_DATES_AS_TIMESTAMPS` está desligado, que é o default) |
| Valor | bate com `date -u` no mesmo instante — **sem deslocamento** na conversão |
| 9 casas decimais (nanossegundos do `Instant`) | `new Date()` parseia e trunca para ms |

Consequência no front: o `parseApiDateTime()` que a [19](19-checkout.md) previa
**deixa de existir** — era só para anexar `-03:00` ao que não tinha fuso. Fica no
lugar dele uma asserção nos smoke (`/(Z|[+-]\d{2}:?\d{2})$/` em toda data de toda
resposta), que é o que denuncia módulo esquecido ou regressão.

### Ainda sem verificação (depende de ADMIN)
- `customerName` em `ReviewViewModel` — confirmado **só no schema**; criar review
  exige pedido `DELIVERED`, que só ADMIN promove.
- `GET /admin/orders` e `PATCH /admin/orders/{id}/status` com dados reais.
- Se `available` reflete `stockQuantity > 0` + soft-delete (item 7).
- Se `coverImageUrl` aceita mesmo só 255 chars (item 19) — precisa de `POST /books`.
- Se `DELETE /users/{id}` libera o e-mail para novo cadastro.

## 28. Histórico e cancelamento: comportamento real — NOVO (2026-08-05)

Sondado ao vivo **antes** de escrever a [20-orders-history.md](20-orders-history.md),
pelo mesmo motivo dos itens 25, 26 e 27. Rodado como **CUSTOMER**
(`joao@bookland.com`), que é o perfil que a app de fato usa.

**✅ A ordenação foi CORRIGIDA no mesmo dia** — backend `932727f`. O relato
abaixo fica como registro do que foi medido e do porquê de ter ido para o
backend; a resolução está no fim deste item.

**🔴 `GET /orders` vinha em ordem crescente, e `sort` não existe.**

O item 27 já tinha visto a ordem crescente. O que faltava — e muda a solução — é
que **não há como pedir outra**. Seis variantes, todas **200 na mesma ordem**:

| Query | Resposta |
|---|---|
| `?sort=createdAt,desc` | 200, ordem inalterada |
| `?sort=createdAt%2Cdesc` | 200, ordem inalterada |
| `?sort=createdAt,DESC` | 200, ordem inalterada |
| `?sort=-createdAt` | 200, ordem inalterada |
| `?sort=createdAt&direction=desc` | 200, ordem inalterada |
| `?sort=lixo,desc` | **200**, sem 400 — ignorado como o `sort` do catálogo (item 25) |

E a paginação prova que inverter no BFF não resolve — com 3 pedidos e `size=2`:

```
page 0: [18:17:49.755, 18:17:49.830]   ← os dois mais antigos
page 1: [18:18:33.254]                 ← o MAIS RECENTE, na última página
```

Inverter a página traz os antigos em ordem invertida, não os recentes. Por isso a
[20](20-orders-history.md) manda isso para o **backend** (`Sort.by(DESC,
"createdAt")`) em vez de contornar — e a US-15 já exigia decrescente.

> Isto **corrige a orientação** que o item 27 deu ("ordenar no BFF na etapa 6"):
> ela foi escrita sem saber que o mais recente cai na última página.

**🔴 Pedido de outro cliente é `403 ORDER_ACCESS_DENIED` — a pergunta da 19.**

```
GET    /api/v1/orders/{id-do-admin}   (token do joao) → 403 ORDER_ACCESS_DENIED
DELETE /api/v1/orders/{id-do-admin}   (token do joao) → 403 ORDER_ACCESS_DENIED
GET    /api/v1/orders/{id-do-admin}   (token do admin) → status inalterado ✔
```

Não é 404, e o isolamento **segura também na mutação**. Mesmo assim, a página
trata 403 como `notFound()` — decisão do dono, para não confirmar a existência do
id a quem sondar. O que muda é que deixou de ser palpite.

**🟢 Cancelamento: `DELETE` devolve 200 com o pedido, não 204.**

| Caso | Resposta |
|---|---|
| `DELETE` em `CONFIRMED` | **200** + `OrderViewModel` já `CANCELLED`, com `CONFIRMED → CANCELLED` no `statusHistory` |
| `GET /payments/order/{id}` depois | **`REFUNDED`** — automático, como o README prometia |
| `DELETE` no mesmo pedido de novo | **409 `ORDER_CANCELLATION_NOT_ALLOWED`** (código novo, catalogar) |
| `DELETE` em id inexistente | 404 `ORDER_NOT_FOUND` |
| `DELETE` com id malformado | 400 `INVALID_PARAMETER` + `errors.orderId: ["must be a valid UUID"]` |
| Pedido cancelado no histórico | **continua listado**, com `status: "CANCELLED"` |

**🟡 Paginação de `/orders` repete os dois vícios do catálogo (item 25).**

| Query | Resposta |
|---|---|
| `?size=1000` | **200 e obedece** — precisa do mesmo teto `MAX_PAGE_SIZE` |
| `?page=-1`, `?size=0`, `?page=abc` | **400** — o BFF descarta antes de subir |
| `?page=99` (fora do intervalo) | **200** com `content: []` (e ecoa `page: 99`) |
| Sem token | 401 `TOKEN_MISSING` |

**Códigos novos a catalogar:** `ORDER_ACCESS_DENIED` (403),
`ORDER_CANCELLATION_NOT_ALLOWED` (409).

### ✅ Ordenação — RESOLVIDA no mesmo dia (2026-08-05, backend `932727f`)

A consulta rodava **sem `ORDER BY`**: o banco devolvia na ordem que quisesse, na
prática ordem de inserção. Agora é **`createdAt` decrescente, com empate desfeito
por `id` decrescente**.

O desempate é o que torna a paginação segura, e não é firula: dois pedidos com o
mesmo `createdAt` podiam trocar de posição entre requisições, fazendo **um pedido
sumir das duas páginas e outro aparecer nas duas**.

**Reconferido ao vivo** com 5 pedidos criados dentro do mesmo segundo
(`.037794Z` a `.182109Z`) — o cenário de empate:

| Verificação | Resultado |
|---|---|
| `content[0]` é o mais recente | ✅ |
| 3 páginas de `size=2` concatenadas × `?size=100` | ✅ idênticas, item a item |
| Pedido duplicado ou perdido entre páginas | ✅ nenhum |
| `?sort=createdAt,asc` e `?sort=lixo,desc` | 200, ordem padrão (ignorados) |
| Cancelamento e 409 repetido | ✅ inalterados |

**Duas coisas que o dono do backend fixou como contrato** (README, seção Orders):

1. **Não haverá ordenação configurável pelo cliente.** As rotas de pedido servem
   sempre o mais recente primeiro — o modelo de Stripe/Shopify/GitHub: ordem fixa
   sensata mais filtros, não `?sort=campo,direção`. Se uma tela precisar de outra
   ordem, ela entra como **valor de lista fechada**. Consequência para nós: o BFF
   **não manda `?sort=`**; os únicos parâmetros são `page` e `size`.
2. **`?sort=` responder 200 e ignorar não é específico desta rota** — a API
   inteira ignora query param desconhecido. Casa com o item 25, onde
   `?sort=bogus` no catálogo também passa calado.

> ⚠️ **Mudou junto:** `GET /admin/orders/customer/{customerId}` compartilhava a
> consulta e **também passou a vir decrescente**. Varri o `src/` — nada nosso
> consome essa rota; o único vestígio de admin é o tipo
> `AdminOrderSummaryViewModel`, parado para a fase 2. `GET /admin/orders` já
> estava correto e só ganhou o desempate.

> Isto **encerra** a orientação do item 27 ("ordenar no BFF na etapa 6") e a
> orientação intermediária deste item ("mandar para o backend"): não há nada a
> fazer no front.

---

### Ação sugerida ao dono (revisão 3 — 2026-07-28)

**🟢 Contrato pronto. Nada bloqueia o BFF.** Resolvidos: **4, 5, 6, 11, 12, 13,
17, 18**. O fluxo autenticado inteiro foi exercitado ponta-a-ponta pela primeira
vez (registro → carrinho → checkout → pedido → pagamento → wishlist), tudo
coerente com o spec.

**🔵 O que ficou confirmado com dados reais (não só schema)**
- `title` + `coverImageUrl` chegam de fato em cart, order e wishlist items ✔
- Checkout com PIX → pagamento `APPROVED` e pedido já `CONFIRMED`, com
  `statusHistory` preenchido (`AWAITING_PAYMENT → CONFIRMED`) ✔
- Regra de review (`PURCHASE_REQUIRED`) é real: pedido `CONFIRMED` **não basta**,
  precisa `DELIVERED` — como [04-reviews.md](04-reviews.md) já previa ✔

**⚪ Sugestões opcionais ao backend (nenhuma bloqueia)**
- **Item 19:** devolver `maxLength: 2048` a `coverImageUrl` (caiu para 255 na
  varredura de `@Size`).
- **Item 20:** esconder `/error` do Swagger (`@Hidden` / `paths-to-exclude`).
- **Item 16:** `security: []` nos endpoints públicos.
- **Item 7:** confirmar se `available` reflete `stockQuantity > 0` + soft-delete.

**🟣 ~~Não verificável por fora~~ ✅ fechado na revisão 4** — com
`admin@bookland.com` / `admin1234` tudo que dependia de ADMIN foi confirmado
(ver item 22). Não há mais lacuna de verificação.

---

### Ação sugerida ao dono (revisão 4 — 2026-07-28)

**🔴 Único item aberto — backend**
- **Item 21 — `POST /auth/register` 500 intermitente.** Causa raiz identificada:
  H2 `The database has been closed` ao avaliar o **único CHECK do schema**
  (`users.role`). Não é modelagem — é rotatividade de conexão do pool.
  Fix sugerido: `spring.datasource.hikari.max-lifetime: 0` no perfil dev
  (+ avaliar a versão do H2, hoje 2.4.240). **Só afeta dev** (prod é PostgreSQL),
  mas convém confirmar que o mesmo caminho não existe lá.

**🟡 Vale corrigir, não bloqueia**
- **Item 24 — `stockQuantity` primitivo:** trocar por `Integer` + `@NotNull`.
  Hoje omitir o campo dá `MALFORMED_REQUEST` genérico, e o OpenAPI diz que é
  opcional. O BFF contorna sempre enviando o campo.

**⚪ Cosmético**
- **Item 20:** esconder `/error` do Swagger. **Item 16:** `security: []` nos públicos.

**🟢 Nada pendente do lado do front** — todas as premissas das specs foram
confirmadas contra a API rodando. O BFF pode começar.

**🔵 Ajustes que isso obriga no nosso lado (front, ao implementar)**
- **`apiFetch`:** ramificar por **`code`**, não por `detail`; **204 = void**
  (não parsear); refresh em 401 com `TOKEN_EXPIRED` **ou** `TOKEN_INVALID`.
- **Formulários:** consumir `errors[campo]` (**sempre array**; chave `_` = payload
  inteiro) para erro inline; mensagens do servidor vêm em **inglês** → usar Zod
  em pt-BR no client e traduzir por `code` o que vier do servidor.
- **Refresh rotaciona:** cada `/auth/refresh` **invalida** o refresh anterior —
  o BFF **tem** de regravar o cookie `bl_refresh` com o novo valor, senão a
  sessão morre na chamada seguinte. Verificado.

**⚪ Sugestões opcionais ao backend (nenhuma bloqueia)**
- **Item 16:** `security: []` nos endpoints públicos (login/register/books/categories).
- **Item 7:** confirmar se `available` reflete `stockQuantity > 0` + soft-delete.
- Expor o `docs/error-contract.md` (citado no schema) com a lista completa de `code`.

**⚪ Higiene / fase 2 (inalterado)**
- **Itens 1, 2, 3, 8 (stories desatualizadas):** atualizar as issues do Linear
  para refletir a API (cancel via `DELETE`, sem `PENDING`, status via rota admin,
  rótulos de wishlist). Opcional — não bloqueia o MVP.
  *(O item 6 saiu desta lista: logout agora é 204, story e API concordam.)*
- **Item 9 (`*/*`):** respostas de **sucesso** seguem sem `application/json`
  explícito (o servidor devolve JSON). Erros já são `application/problem+json`.
- **Item 10 (Opção B — menu fase 2):** **nada mudou** — segue sem métrica de
  vendas, campos de desconto, endpoint de autores, filtro por editora ou
  `createdAt` em `BookViewModel`. Header/footer continuam na Opção A.
- **Item 14 (ISBN):** ancorar a regex no Zod quando o CRUD admin for feito.
- **`UpdateOrderStatusRequest.adminId`** segue no corpo (deveria vir do token);
  enviar só se o backend exigir.
