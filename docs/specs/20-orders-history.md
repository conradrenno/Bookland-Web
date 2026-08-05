# 20 — Histórico e cancelamento (Etapa 6)

> Fecha **US-15** (histórico) e **US-16** (cancelar). O contrato está em
> [06-orders.md](06-orders.md); esta spec é o **plano de implementação**, no
> formato da [19-checkout.md](19-checkout.md). Decisões tomadas com o dono em
> 2026-08-05, **depois** de sondar a API ao vivo (item 28 de
> [09-contract-notes.md](09-contract-notes.md)).

## O que a sondagem ao vivo mudou

Três respostas, e a primeira redesenha a etapa:

1. **O histórico vinha em ordem crescente e o `sort` não existia.**
   ✅ **Corrigido pelo backend no mesmo dia** — ver a seção abaixo.
2. **Pedido de outro cliente é `403 ORDER_ACCESS_DENIED`**, não 404 — a pergunta
   que a [19](19-checkout.md) deixou aberta. Vale para ler **e** para cancelar, e
   o pedido alheio sobreviveu à tentativa.
3. **Cancelar duas vezes é `409 ORDER_CANCELLATION_NOT_ALLOWED`**, com `code`
   estável. É o caminho de erro próprio desta etapa.

## A ordenação era do backend — e foi resolvida lá ✅

**Achado, encaminhado e corrigido em 2026-08-05** (backend `932727f`).

O histórico vinha **crescente**, e o `sort` era ignorado em todas as variantes.
O que fez isso ir para o backend em vez de virar contorno aqui é que **não havia
contorno honesto**. Inverter a página no BFF *parece* resolver e não resolve:

```
size=2, 3 pedidos, ordem crescente do upstream
page 0: [mais antigo, meio]      ← inverter aqui dá [meio, mais antigo]
page 1: [MAIS RECENTE]           ← o pedido de hoje morava aqui
```

O cliente abriria "Meus pedidos" e **não veria o que acabou de comprar**. As
alternativas reais eram buscar tudo com `size` alto e paginar no BFF (código que
nasce para ser deletado, com teto arbitrário) ou espelhar o índice da página
(~30 linhas de aritmética, com corrida se nascesse pedido entre as duas
chamadas). Nenhuma das duas se sustenta contra uma consulta sem `ORDER BY`.

**O que o backend entregou:** `createdAt` decrescente, com **empate desfeito por
`id` decrescente**. O desempate não é detalhe — sem ele, dois pedidos no mesmo
milissegundo podiam trocar de lugar entre requisições, e aí **um pedido some das
duas páginas enquanto outro aparece nas duas**.

**Conferido ao vivo (2026-08-05), com 5 pedidos criados dentro do mesmo segundo
— exatamente o caso de empate:**

| Verificação | Resultado |
|---|---|
| `content[0]` é o mais recente | ✅ |
| Concatenar as 3 páginas de `size=2` bate item a item com `?size=100` | ✅ |
| Nenhum pedido duplicado ou perdido na paginação | ✅ |
| `?sort=createdAt,asc` e `?sort=lixo,desc` | 200, ordem padrão — ignorados |

**Consequência para esta spec: o front não faz nada.** `listOrders` repassa
`page`/`size` e mostra o que vier — que agora é a ordem certa. E **nunca manda
`?sort=`**: o parâmetro nunca foi lido nessa rota, e a decisão do backend é
ordem fixa (mais recente primeiro), no modelo de Stripe/Shopify/GitHub. Se algum
dia uma tela precisar de "mais antigos primeiro", isso entra como **valor de
lista fechada**, não como `?sort=campo,direção`.

> ⚠️ **Mudou junto:** `GET /admin/orders/customer/{customerId}` compartilhava a
> consulta e também passou a vir decrescente. **Nada nosso consome essa rota** —
> conferido; o único vestígio é o tipo `AdminOrderSummaryViewModel`, parado para
> a fase 2. `GET /admin/orders` já estava certo e só ganhou o desempate.

## Escopo

**Dentro:**

- `lib/api/orders.ts` — `listOrders()`, `cancelOrder()` e
  `parseOrderSearchParams()`, o irmão do `parseBookSearchParams`.
- `app/api/orders/[orderId]/route.ts` — `DELETE`, a mutação da etapa.
- Página `/orders` — **US-15**, a lista paginada.
- Botão **Cancelar pedido** com diálogo de confirmação — **US-16**.
- **"Meus pedidos" no menu de conta** — o link que a 5b não pôde criar.
- `Pagination` generalizada, hoje casada com o catálogo.

**Fora:** reviews ([04](04-reviews.md)), que é etapa própria; conta e admin, que
são fase 2 ([08](08-phase-2.md)).

### Por que o cancelamento mora só no detalhe

A lista **não** ganha botão de cancelar. Três razões, na ordem em que pesam:

1. Cancelar dispara **estorno e restauração de estoque** — verificado ao vivo. É
   destrutivo, e destrutivo pede que a pessoa esteja olhando para o que vai
   desfazer: os itens, o total, o pagamento.
2. O `DELETE` devolve o **`OrderViewModel` inteiro**. No detalhe, isso é a página
   se atualizando; na lista, é um payload jogado fora.
3. Uma lista com ação destrutiva por linha convida ao clique errado — as linhas
   são parecidas e só o id curto as separa.

A lista leva ao detalhe; o detalhe cancela.

## Decisões desta etapa

| Decisão | Escolha | Motivo |
|---|---|---|
| Leitura de `/orders` | **SSR** | Mesma postura do catálogo: estado na URL, página re-renderiza no servidor. Nada aqui precisa de interatividade. |
| Estado da lista | **Na URL** (`?page=`) | Regra 6 do `CONTEXT.md`. Um pedido compartilhável por link vale mais que estado em memória. |
| Ordenação | **Nenhum parâmetro é enviado** | O upstream serve sempre o mais recente primeiro, por decisão de contrato (README do backend, seção Orders). `?sort=` nunca foi lido nessa rota — mandar seria cargo cult. |
| Parâmetros inválidos | **Descartados**, nunca propagados | `page=-1`, `size=0` e `page=abc` dão **400** no upstream, e `?size=1000` é **obedecido** — os mesmos dois vícios do catálogo. Regra 5 do `CONTEXT.md`: typo na barra de endereço mostra a lista, não uma tela de erro. |
| Mutação | **Route handler** `DELETE /api/orders/[orderId]` | Coerente com carrinho e checkout: token em cookie httpOnly, `_shared.ts` pronto. |
| Sucesso do cancelamento | **`router.refresh()`**, sem estado local | O detalhe é server-rendered; o refresh traz status, timeline e pagamento (`REFUNDED`) já atualizados numa tacada. Mesmo movimento do `AddToCartButton`. |
| 403 na leitura | **`notFound()`** | Decisão do dono (2026-08-05). Dizer "você não tem acesso" confirma para um estranho que aquele id é um pedido real. O cliente não faz nada com a diferença. **A página já se comporta assim** — o que muda é que deixou de ser palpite. |
| Confirmação | **Diálogo modal**, não `confirm()` | `window.confirm` não é estilizável, é bloqueante e some no SSR. Entra o `alert-dialog` do shadcn — o primeiro desta app. |
| Pedido cancelado | **Continua na lista**, com badge cinza | É histórico. Some da lista = o cliente acha que perdeu o pedido, e o estorno vive nele. |

## Arquivos

```
lib/api/orders.ts                    + listOrders, cancelOrder,
                                       parseOrderSearchParams  (edita)
lib/api/orders-client.ts             novo — browser → BFF (cancelamento)
lib/api/error-codes.ts               + ORDER_ACCESS_DENIED,
                                       ORDER_CANCELLATION_NOT_ALLOWED  (edita)
lib/api/error-messages.ts            + copy dos dois  (edita)
app/api/_shared.ts                   + invalidOrderId()  (edita)
app/api/orders/[orderId]/route.ts    novo — DELETE
app/(storefront)/orders/page.tsx     novo — US-15
app/(storefront)/orders/[orderId]/page.tsx   + botão cancelar  (edita)
components/orders/order-summary-card.tsx     novo — a linha da lista
components/orders/empty-orders.tsx           novo — estado vazio
components/orders/cancel-order-button.tsx    novo — client, diálogo
components/ui/alert-dialog.tsx               novo — shadcn
components/ui/pagination.tsx                 movido de catalog/, generalizado
components/layout/account-menu.tsx           + "Meus pedidos"  (edita)
```

## Camada de dados — `lib/api/orders.ts`

Cresce de dois para quatro exports. Continua arquivo plano: a regra 7 diz que
vira pasta só se o recurso crescer de verdade, e quatro funções não é isso.

```ts
listOrders(accessToken, params?: OrderSearchParams): Promise<PageResult<OrderSummaryViewModel>>
cancelOrder(accessToken, orderId): Promise<OrderViewModel>
parseOrderSearchParams(raw): OrderSearchParams
```

`cancelOrder` devolve o pedido atualizado — **200 com corpo**, não 204. Foi
medido; o nome `DELETE` engana. O `updatedAt` e o `statusHistory` já vêm com a
transição `CONFIRMED → CANCELLED`.

`parseOrderSearchParams` é o `parseBookSearchParams` sem filtros: só `page` e
`size`, mesmo tratamento de array repetido (recusa o valor inteiro) e mesmo teto
`MAX_PAGE_SIZE`. Reaproveita os helpers privados de `books.ts`? **Não** — são
quatro linhas duplicadas contra acoplar catálogo e pedidos por um `parsePage`.

## `/orders`

SSR, protegida pelo middleware (`/orders` já está em `PROTECTED_PREFIXES`).

**Cada linha:** id curto (`#9bc07628`, o mesmo `shortId` do detalhe), data em
pt-BR, `OrderStatusBadge`, quantidade de itens e total. A linha inteira é link
para `/orders/{id}` — não um "ver detalhes" no canto.

> `OrderSummaryViewModel` **não traz os itens**, só `itemCount`. Nada de
> miniaturas na lista sem uma chamada por pedido; o card mostra "3 itens".

**Vazio:** `EmptyOrders`, irmão do `EmptyCart` — "você ainda não fez pedidos" e
um CTA para o catálogo.

**Página fora do intervalo:** o upstream responde **200 com lista vazia** (não
404), então `?page=99` cai no mesmo componente vazio. Aceitável: é URL digitada
à mão, e o pager nunca gera esse link.

## Cancelamento

**Onde:** `/orders/[orderId]`, ao lado do painel de pagamento, e **só quando**
`isCancellable(order.status)` — o mapa em `lib/orders/status.ts` já existe e já
tem a coluna, escrita na 5b para esta etapa.

**Fluxo:** botão `variant="outline"` discreto (não `destructive` — o destaque
fica no diálogo) → `AlertDialog` explicando o que acontece → `DELETE` →
`router.refresh()`.

A copy do diálogo diz a verdade que a sondagem confirmou:

> **Cancelar este pedido?** Os itens voltam para o estoque e o pagamento de
> R$ 69,90 é estornado. Não dá para desfazer.

**Guarda de clique duplo:** o botão desabilita no envio, como o `CheckoutForm`.
Mesmo se escapar, o segundo `DELETE` volta `409` e vira mensagem — não corrompe
nada.

## Erros → UI

Ramificação por `code`, nunca por mensagem ([15](15-code-conventions.md)). Dois
códigos novos:

| `code` | HTTP | Copy |
|---|---|---|
| `ORDER_CANCELLATION_NOT_ALLOWED` | 409 | "Este pedido não pode mais ser cancelado." |
| `ORDER_ACCESS_DENIED` | 403 | "Pedido não encontrado." — mesma copy do 404, de propósito (ver a tabela de decisões) |

`ORDER_NOT_FOUND` e `INVALID_PARAMETER` já existem em `error-messages.ts`.

## Testes

Seguindo [10-testing.md](10-testing.md):

- **node** — `listOrders`/`cancelOrder` com MSW (feliz, 409, 403, 404);
  `parseOrderSearchParams` (lixo descartado, teto do `size`, array recusado);
  validação do route handler (sem token → 401, id malformado → 400).
- **jsdom** — `CancelOrderButton` (o diálogo abre; **cancelar o diálogo não
  dispara `DELETE`**; sucesso chama `router.refresh()`; 409 mostra a mensagem;
  duplo clique manda **um** `DELETE`); `OrderSummaryCard`; `Pagination`
  generalizada, com o teste que já existe.

  O teste de "cancelar o diálogo não dispara nada" é o mais importante da etapa:
  é o que separa uma confirmação de um botão com um passo a mais.
- **smoke** — estender `live-contract.smoke.test.ts` como cliente: comprar →
  `GET /orders` contém o pedido → cancelar → status `CANCELLED` → pagamento
  `REFUNDED` → cancelar de novo dá `409 ORDER_CANCELLATION_NOT_ALLOWED` → ler
  pedido de outra conta dá `403 ORDER_ACCESS_DENIED`.

  **Mais a ordenação, que já nasce verde** (`lists newest first`): comprar duas
  vezes seguidas e afirmar que `content[0]` é a compra mais recente. E vale um
  teste a mais no que o desempate protege — paginar com `size=1` e conferir que a
  concatenação **não perde nem repete** pedido. É o tipo de regressão que só
  aparece com empate de `createdAt` e passaria batido numa conta cujos pedidos
  estão espaçados no tempo.

## Verificado ao vivo (2026-08-05)

Detalhe completo no item 28 de [09-contract-notes.md](09-contract-notes.md):
histórico vazio e com dois pedidos, ordenação, paginação (`size=1`, página fora
do intervalo, `size=1000`, `page=-1`, `size=0`, `page=abc`), `sort` em seis
variantes, leitura e cancelamento de pedido alheio, cancelamento feliz, estorno,
cancelamento repetido, id inexistente e id malformado.

**Segunda rodada, depois do fix de ordenação** (backend `932727f`): 5 pedidos
criados dentro do mesmo segundo, ordem decrescente confirmada, paginação
`size=2` concatenada sem perda nem duplicata, `?sort=` ignorado sem quebrar, e o
cancelamento reconferido inalterado.

## Nada pendente no backend para esta etapa

A única pendência que esta spec abriu — a ordenação — **foi resolvida antes de
qualquer código do front ser escrito**. O que resta na lista do dono é anterior e
não toca aqui: itens 21 (register 500), 24 e 26 (`int` primitivo).
