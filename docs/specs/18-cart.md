# 18 — Carrinho (Etapa 5a)

> Fecha US-13 pelo lado do BFF **e** da UI. O contrato e as regras de negócio
> estão em [05-cart-checkout.md](05-cart-checkout.md); esta spec é o **plano de
> implementação** da etapa, no mesmo formato de [16-auth-pages.md](16-auth-pages.md).
> Decisões tomadas com o dono em 2026-07-29.

## Escopo

**Dentro:**

- `lib/api/cart.ts` — as quatro operações do carrinho sobre `apiFetch`.
- Route handlers em `app/api/cart/` para as três mutações.
- Página `/cart` — lista, controles de quantidade, remoção, total, estado vazio.
- **Contador no header** — a pendência nº 2 do 4b, adiada explicitamente na
  [13-common_header.md](13-common_header.md).
- Botão **"Adicionar ao carrinho"** na página do livro — o buraco visível do 4b.
- **Redesenho do card do catálogo** com o botão no hover (ver seção própria).

**Fora (5b, em seguida):** `/checkout`, `POST /api/cart/checkout` e o redirect
para `/orders/{id}`. A revalidação de estoque no momento da confirmação é um
caminho de erro à parte, e `/orders/{id}` ainda não existe ([06](06-orders.md)).

**Fora (etapa própria):** reviews na página do livro ([04](04-reviews.md)) —
recurso sem relação com o carrinho.

## Decisões desta etapa

| Decisão | Escolha | Motivo |
|---|---|---|
| Leitura do carrinho | **SSR direto** — a página e o header chamam `getCart()` no render | Mesma postura do catálogo: o servidor é a verdade. Sem estado global, sem hidratação de lista. |
| Sincronização após mutação | **`router.refresh()`** | O route handler devolve o `CartViewModel`, mas quem re-renderiza é o servidor. Zero fonte de verdade duplicada, e o **header (no layout raiz) também é re-renderizado** — é o que faz o badge atualizar de graça. Custa um round-trip por clique; aceitável no MVP. |
| Deduplicação do `GET /cart` | **`cache()` do React** em volta de `getCart()` | Em `/cart` o header e a página pedem o mesmo carrinho no mesmo render. Sem isso são dois `GET` por pageview. |
| Mutações | **Route handlers**, não Server Actions | Coerente com auth (etapa 2/3): o token vive em cookie httpOnly lido server-side, e o handler já tem `_shared.ts` com o tratamento de erro pronto. |
| Botão nos cards da grade | **Sim**, revelado no hover | Pedido do dono em 2026-07-29, com referência visual de e-commerce. A objeção que eu tinha ("cada card vira ilha client") **não se confirma**: o card segue Server Component, o hover é CSS puro e só o `<button>` hidrata. Ver a seção do card. |

## Arquivos

```
lib/api/cart.ts               getCart / addCartItem / updateCartItem / removeCartItem
lib/api/cart.test.ts          MSW: caminho feliz + 401 + 409 de estoque
app/api/cart/items/route.ts             POST   → adicionar
app/api/cart/items/[bookId]/route.ts    PATCH  → quantidade · DELETE → remover
lib/api/cart-client.ts        browser → route handlers (espelha auth-client.ts)
app/(storefront)/cart/page.tsx          Server Component: getCart() + render
components/cart/cart-line.tsx           "use client": quantidade e remoção
components/cart/quantity-stepper.tsx    − / valor / + com estado pendente
components/cart/cart-summary.tsx        total e CTA para o checkout (5b)
components/cart/empty-cart.tsx          estado vazio + CTA para o catálogo
components/cart/add-to-cart-button.tsx  "use client": página do livro e card
components/layout/cart-button.tsx       ícone + badge (extraído do site-header)

components/catalog/book-card.tsx        (alterado) painel, capa contida, botão
components/catalog/book-cover.tsx       (alterado) prop `fit`: cover | contain
```

`cart-client.ts` existe pela mesma razão que `auth-client.ts`: o `fetch` + leitura
do `ApiErrorBody` se repetiria em três componentes.

## Camada de dados — `lib/api/cart.ts`

| Função | Upstream | Corpo |
|---|---|---|
| `getCart()` | `GET /api/v1/cart` | — |
| `addCartItem(bookId, quantity?)` | `POST /api/v1/cart/items` | `AddCartItemRequest` |
| `updateCartItem(bookId, quantity)` | `PATCH /api/v1/cart/items/{bookId}` | `UpdateCartItemRequest` |
| `removeCartItem(bookId)` | `DELETE /api/v1/cart/items/{bookId}` | — |

Todas devolvem `CartViewModel`. Nenhuma agrega nada: desde o ajuste do backend
de 2026-07-27, `CartItemViewModel` já traz `title`, `coverImageUrl` e
`available` — a agregação de miniaturas que o BFF faria **deixou de ser
necessária** (registrado no `CONTEXT.md`).

`quantity` é opcional no `AddCartItemRequest` (mínimo 1, default 1 no backend) e
`0` no `PATCH` **remove a linha** — é o contrato (`minimum: 0`), não uma
convenção nossa. A UI usa isso: o stepper descendo de 1 para 0 remove, e não
precisa de um caminho separado.

**Um helper puro, testado à parte:** `cartItemCount(cart)` = soma de
`items[].quantity`. É o que o badge mostra ([13](13-common_header.md)), e a soma
não é `items.length`.

## Route handlers

Espelham os de auth: leem o corpo com `readJsonBody`, respondem `malformedBody()`
quando não parseia, e passam qualquer falha por `toErrorResponse` — que já
reencaminha `status` + `code` do `ApiError` e colapsa o resto num 500 genérico.
Nada novo em `_shared.ts`.

Validação de entrada no handler (`bookId` é UUID, `quantity` é inteiro ≥ 0)
antes de chamar o upstream: é a mesma postura do `parseBookSearchParams` — lixo
que o upstream responderia com 400 é recusado aqui, com mensagem nossa.

## Erros → UI

Ramificação por `code`, nunca por mensagem ([15](15-code-conventions.md)). Dois
códigos já catalogados em `error-codes.ts` ganham copy pt-BR nesta etapa —
**hoje eles caem no fallback genérico**:

| `code` | Status | Copy proposta |
|---|---|---|
| `INSUFFICIENT_STOCK` | 409 | "Não temos essa quantidade em estoque." |
| `CART_ITEM_UNAVAILABLE` | 409 | "Este livro não está mais disponível." |
| `BOOK_NOT_FOUND` | 404 | "Este livro não está mais no catálogo." |

O erro aparece **na linha afetada**, não num banner de página: com várias linhas,
um banner no topo não diz qual delas falhou. O 401 continua sendo tratado pelo
middleware — `/cart` é rota protegida, então não-logado nunca chega à página.

## Contador no header

`CartButton` recebe a contagem do `SiteHeader` (Server Component), que passa a
chamar `getCart()` junto de `listCategories()` e `getCurrentUser()` no mesmo
`Promise.all`. Regras da [13](13-common_header.md):

- **Deslogado:** sem badge, link para `/login?next=%2Fcart` (já é o comportamento).
- **Logado, carrinho vazio:** sem badge — um "0" não informa nada.
- **Falha do `GET /cart`:** trata como sem badge. Já existe o precedente do
  `safeCategories()` no header: um recurso secundário que falha **não derruba o
  header inteiro**.

## Redesenho do card do catálogo

Pedido do dono em 2026-07-29, a partir de uma referência de e-commerce: card em
painel próprio, capa ocupando **parte** dele, dados dentro do painel e o botão
"Adicionar ao carrinho" surgindo no **hover**.

### Estrutura

```
┌─────────────────────────┐
│  [Indisponível]         │  ← badge só quando fora de estoque
│      ┌───────┐          │
│      │ capa  │          │  ← altura fixa, imagem contida e centrada
│      └───────┘          │
│  Autor, Autor           │  ← pequeno, muted
│  Título do livro        │  ← serif, 2 linhas no máximo
│  ★★★★☆                  │
│  R$ 47,80               │
│  [ ADICIONAR AO CARRINHO ]  ← espaço sempre reservado, visível no hover
└─────────────────────────┘
```

### Decisões

| Ponto | Escolha | Motivo |
|---|---|---|
| Botão × *stretched link* | Botão **acima** do overlay (`relative z-10`), irmão do `<a>` | O card usa hoje um `::after` que cobre tudo para ser clicável por inteiro. O botão precisa vencer esse overlay — e ficar **fora** do anchor, porque `<button>` dentro de `<a>` é HTML inválido. Assim continua havendo **um** anchor na árvore de acessibilidade. |
| Ajuste da capa | `object-contain` numa área de altura fixa | Hoje é `object-cover`, que **corta** a capa. Capa de livro tem proporção irregular; a referência mostra larguras diferentes centradas na mesma caixa. Vira uma prop `fit` no `BookCover` — a página de detalhe segue como está. |
| Altura no hover | **Espaço do botão sempre reservado** | Card que cresce no hover empurra a linha inteira. O botão ocupa a altura desde o início e só alterna a visibilidade. |
| Revelar no hover | `@media (hover: hover)` + `group-focus-within` | Sem a media query, o botão **nunca** aparece em touch, onde não existe hover. Sem o `focus-within`, o teclado não alcança. Em telas de toque ele fica permanentemente visível. |
| Custo em JS | Card continua **Server Component** | O hover é CSS (`group-hover`), não estado. Só o `<AddToCartButton>` leva `"use client"` — N botões pequenos, não N cards hidratados. |
| Deslogado | Botão vira link para `/login?next=…` | Mesma regra do ícone do carrinho na [13](13-common_header.md): `/cart` exige token. Sem sessão, clicar leva ao login e volta. |

### O que fica de fora, e por quê

**Selo de desconto e preço riscado — sem lastro na API.** `BookViewModel` tem só
`price`; não existe `listPrice`, `originalPrice` nem percentual. É a mesma
lacuna do item 10 de [09-contract-notes.md](09-contract-notes.md), que já tirou
"Deals" do menu. Decidido com o dono (2026-07-29): **deixar de fora** — o layout
funciona sem o selo, e riscar um preço que a API não informa seria inventar
dado. Se o backend ganhar o campo um dia, entra sem mexer na estrutura do card.

**Coração de wishlist — fase 2.** A API suporta (`POST /wishlist/items`), mas
trazer isso para cá seria embutir um recurso inteiro da fase 2 na etapa do
carrinho. O canto superior direito do card **fica livre** para ele, para que a
wishlist não obrigue a remexer no layout depois.

## Testes

Seguindo [10-testing.md](10-testing.md):

- **node** — `cart.ts` com MSW (feliz, 409 de estoque, 401), `cartItemCount`,
  e a validação dos handlers.
- **jsdom** — `QuantityStepper` (estado pendente, não deixa disparar duas vezes),
  `CartLine` (erro na linha certa), `EmptyCart`, `AddToCartButton`.
  O `BookCard` já tem teste; ele passa a cobrir que **o botão está no DOM
  independente do hover** (é CSS que o esconde, então o teste não depende de
  simular hover) e que deslogado ele é um link para o login.
- **smoke** — estender `live-contract.smoke.test.ts` com o ciclo real contra o
  Spring: adicionar → incrementar (mesmo livro) → `PATCH 0` → confirmar remoção.

## ✅ Verificação ao vivo — feita (2026-07-29)

As três regras que a spec 05 afirmava vindo da **story** foram exercitadas contra
o Spring antes de qualquer UI. Detalhe completo no item 26 de
[09-contract-notes.md](09-contract-notes.md); resumo:

1. **Adicionar repetido incrementa** ✅ — 2 e depois 3 deixam 5. O botão manda
   "quantos a mais", nunca o total novo.
2. **`PATCH quantity: 0` remove** ✅ — o stepper descendo a 0 apaga a linha.
3. **O 409 é sempre `CART_ITEM_UNAVAILABLE`** — `INSUFFICIENT_STOCK` **nunca
   apareceu** no carrinho, e o mesmo código cobre "esgotou" e "pediu demais".
   Só há uma copy possível.

**Duas surpresas que mudaram o plano:**

- **`quantity` é obrigatório**, apesar de opcional no OpenAPI: é `int` primitivo
  no Java, então omitir dá `400 MALFORMED_REQUEST` — não default 1. `addCartItem`
  passou a **sempre** enviá-lo, com o default do nosso lado, e o tipo em
  `types.ts` virou obrigatório. Mesma classe do item 24.
- **`BOOK_NOT_IN_CART`** (404): código que não estava catalogado. Sai no `PATCH`
  de uma linha ausente — mas o `DELETE` equivalente é **idempotente** (200).
  Duplo clique em "remover" não é erro; no stepper, é — daí o estado pendente.

Um ponto para a etapa de pedidos, não para esta: **`updatedAt` vem sem fuso
horário**. No carrinho não aparece; em `/orders`, data exibida sem `Z` é lida
como hora local.
