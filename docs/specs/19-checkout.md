# 19 — Checkout e pedido (Etapa 5b)

> Fecha US-14 e, de quebra, US-18. O contrato está em
> [05-cart-checkout.md](05-cart-checkout.md) e [06-orders.md](06-orders.md);
> esta spec é o **plano de implementação** da etapa, no formato da
> [18-cart.md](18-cart.md). Decisões tomadas com o dono em 2026-07-30, **depois**
> de exercitar o checkout contra o Spring (item 27 de
> [09-contract-notes.md](09-contract-notes.md)).

## O que a verificação ao vivo mudou

Três coisas que a spec 05 afirmava vindo da story **não se sustentam**, e uma
delas redesenha a etapa inteira:

1. **Não existe etapa de pagamento.** `POST /cart/checkout` cobra na hora e
   devolve o pedido já **`CONFIRMED`**, com o pagamento `APPROVED` por um gateway
   simulado. `AWAITING_PAYMENT` só aparece no `statusHistory`, como estado que o
   pedido teve por um instante dentro da transação.
2. **Carrinho vazio dá `404 CART_NOT_FOUND`**, não 409.
3. **O 409 de estoque não lista os itens** em campo nenhum — só dentro do
   `detail`, em inglês.

## Escopo

**Dentro:**

- `lib/api/orders.ts` — `checkout()` e `getOrder()` sobre `apiFetch`.
- `app/api/cart/checkout/route.ts` — a mutação, espelhando as do carrinho.
- Página `/checkout` — resumo do pedido, escolha de pagamento, confirmação.
- Página `/orders/[orderId]` — **US-18**, o destino do redirect.
- `lib/orders/status.ts` — mapa `OrderStatus` → rótulo pt-BR, cor e cancelável.
- Data sem fuso: resolver **agora**, porque aqui a data é exibida.

**Fora (etapa 6):** `/orders` (histórico, US-15) e o **cancelamento** (US-16).
O `DELETE` já foi verificado e funciona em `CONFIRMED`, mas cancelar é uma
mutação destrutiva com diálogo de confirmação e regras próprias — não entra de
carona no fim de uma etapa de compra.

**Fora (etapa própria):** reviews ([04](04-reviews.md)).

### Por que `/orders/[orderId]` entra aqui

Decidido com o dono em 2026-07-30. O checkout **já devolve o `OrderViewModel`
inteiro** e o pedido já está pago: o destino natural de quem acabou de comprar é
ver o que comprou. A alternativa — uma página de sucesso enxuta — seria código
jogado fora quando o detalhe nascesse na etapa 6, e deixaria o cliente sem ver o
pedido. Fica: **5b = comprar + ver o pedido**; a etapa 6 fica com a lista e o
cancelamento.

## Decisões desta etapa

| Decisão | Escolha | Motivo |
|---|---|---|
| Leitura do carrinho em `/checkout` | **SSR** com o mesmo `getCurrentCart()` da 5a | Já é memoizado com `cache()`; o header e a página do checkout dividem uma chamada. Zero código novo. |
| Carrinho vazio em `/checkout` | **`redirect` para `/cart`** no render | Não adianta oferecer confirmação sem itens — o upstream responderia 404. Quem chega por link antigo ou botão de voltar cai no carrinho, que sabe se explicar. |
| Mutação | **Route handler** `POST /api/cart/checkout` | Coerente com auth e carrinho: token em cookie httpOnly, `_shared.ts` já pronto. |
| Validação do `paymentMethod` | No handler, contra a lista do enum | O upstream tem **dois** erros diferentes para o mesmo campo (ausente → `VALIDATION_ERROR`; valor fora do enum → `MALFORMED_REQUEST`). Nenhum dos dois deveria chegar ao usuário, já que o valor sai de um seletor nosso. |
| Sucesso | `router.push('/orders/{id}')` **+ `router.refresh()`** | O push leva ao pedido; o refresh é o que **zera o badge** do header, que continua sendo server-rendered. Sem ele, o ícone ficaria mostrando itens de um carrinho que já virou pedido. |
| 409 de estoque | **Volta para `/cart`** com o motivo | Não dá para apontar a linha a partir do 409 (o `detail` é texto), mas o `GET /cart` já marca `available: false` no item exato. Devolver ao carrinho é mais honesto que listar nada. |
| Status do pedido | **Exibe o que vier**, incluindo `PAYMENT_FAILED` | O gateway aprovou 8/8, mas não há prova de que nunca recusa. O que a UI **não** faz é oferecer "pagar de novo": não existe endpoint. |
| Campos de pagamento | **Decorativos, por método**, com aviso curto | Pedido do dono em 2026-07-30 — a demo tem que parecer uma loja. Regras próprias na seção abaixo. |

## Arquivos

```
lib/api/orders.ts             checkout / getOrder
lib/api/orders.test.ts        MSW: feliz + 409 de estoque + 404 de carrinho vazio
lib/api/bff-mutate.ts         helper genérico extraído de cart-client.ts
lib/api/checkout-client.ts    browser → POST /api/cart/checkout
app/api/cart/checkout/route.ts          POST → checkout
lib/orders/status.ts          OrderStatus → rótulo, cor, cancelável (puro)
lib/orders/status.test.ts

app/(storefront)/checkout/page.tsx      Server Component: carrinho + formulário
app/(storefront)/orders/[orderId]/page.tsx   Server Component: o pedido

components/checkout/checkout-form.tsx        "use client": método + envio + erro
components/checkout/payment-method-picker.tsx  as quatro opções
components/checkout/payment-fields.tsx       os campos decorativos por método
components/checkout/order-review.tsx         itens e total, só leitura
components/orders/order-status-badge.tsx     rótulo pt-BR + cor
components/orders/order-items.tsx            linhas do pedido (sem controles)
components/orders/status-timeline.tsx        statusHistory em ordem

lib/format.ts                 (alterado) parseApiDateTime — data sem fuso
lib/api/cart-client.ts        (alterado) passa a usar bff-mutate.ts
```

**`bff-mutate.ts` é o mesmo movimento do `_shared.ts` na 5a.** O `mutate()` de
`cart-client.ts` — `fetch`, `ok` → JSON, erro → `code` → copy pt-BR,
401 → `sessionExpired` — não tem nada de carrinho. O checkout precisa dele
devolvendo `OrderViewModel` em vez de `CartViewModel`, então o genérico sobe um
nível e os dois clientes passam a chamá-lo. Sem cópia.

## Camada de dados — `lib/api/orders.ts`

| Função | Upstream | Devolve |
|---|---|---|
| `checkout(token, paymentMethod)` | `POST /api/v1/cart/checkout` | `OrderViewModel` |
| `getOrder(token, orderId)` | `GET /api/v1/orders/{orderId}` | `OrderViewModel` |

`CheckoutRequest`, `OrderViewModel`, `OrderItemViewModel`,
`StatusTransitionViewModel` e `PaymentMethod` **já existem** em `types.ts` — o
contrato foi mapeado inteiro na etapa 1.

**Um código novo para o catálogo:** `ORDER_NOT_FOUND` (404), que aparece no
`getOrder` de um id que não existe. Copy: "Pedido não encontrado." — embora a
página vá tratá-lo com `notFound()`, não com mensagem.

## `/checkout`

Server Component. Lê o carrinho com `getCurrentCart()`; se estiver vazio,
`redirect('/cart')`. Renderiza duas colunas, como o carrinho: o formulário à
esquerda, o resumo à direita.

### O formulário de pagamento

`PaymentMethodPicker` é um radio group com os quatro métodos do enum. A escolha
troca os campos exibidos abaixo:

| Método | Campos decorativos |
|---|---|
| `CREDIT_CARD` / `DEBIT_CARD` | Número, validade, CVV, nome impresso |
| `PIX` | Chave PIX |
| `PAYPAL` | E-mail da conta |

**Regras que valem para todos eles**, e que a implementação não pode afrouxar:

1. **Aviso curto embaixo do bloco**, pedido do dono: uma linha explicando que é
   simulação e que ninguém deve digitar dado real. Copy proposta —
   *"Simulação: estes campos não são enviados a lugar nenhum. Não use dados
   reais."*
2. **Nunca saem da página.** O `POST` manda **só** `{ paymentMethod }`, que é o
   único campo que a API tem. O estado morre no componente.
3. **Nenhum `autocomplete` de pagamento.** Nada de `cc-number`, `cc-exp`,
   `cc-csc`: esses tokens fazem o navegador **oferecer o cartão de verdade** do
   usuário para um campo decorativo. Vai `autoComplete="off"` e nomes neutros.
4. **Não bloqueiam o envio.** Exigir preenchimento obrigaria a inventar um
   cartão para comprar num campo que nada consome. Ficam opcionais, e o aviso
   explica por quê.

> Se o dono preferir que pareçam obrigatórios (mais "real", ao custo de forçar
> dado falso), é trocar uma linha de validação — mas a decisão registrada é a
> acima.

### Envio

`CheckoutForm` é "use client". No sucesso: `router.push('/orders/{id}')` seguido
de `router.refresh()`. Erros, por `code`:

| `code` | Status | O que a UI faz |
|---|---|---|
| `CART_ITEM_UNAVAILABLE` | 409 | Mensagem + **`router.push('/cart')`**: o carrinho marca a linha sozinho |
| `CART_NOT_FOUND` | 404 | `router.push('/cart')` — o carrinho esvaziou noutra aba |
| `TOKEN_MISSING` / 401 | 401 | `/login?next=%2Fcheckout`, como no resto do app |
| qualquer outro | — | Mensagem no formulário, botão volta a ficar clicável |

O botão fica desabilitado só enquanto a requisição está no ar — mas, diferente do
carrinho, **um duplo clique aqui cria dois pedidos**. Além do `disabled`, o
handler guarda um flag de envio, e a navegação de sucesso acontece antes de
qualquer reabilitação.

## `/orders/[orderId]`

Server Component: `getOrder()`, `notFound()` no 404 e no id que não é UUID
(mesma postura de `/books/[bookId]`), e o 403 — pedido de outro cliente —
tratado como "não encontrado" para não confirmar a existência do pedido alheio.

Mostra: número curto do pedido (8 primeiros caracteres do UUID), data,
`OrderStatusBadge`, itens com capa/título/quantidade/preço congelado, total, e a
timeline do `statusHistory`. Nenhuma ação — cancelar é da etapa 6.

### Mapa de status — `lib/orders/status.ts`

Puro e testado à parte, porque a etapa 6 vai usar o mesmo mapa na lista:

| `OrderStatus` | Rótulo | Tom |
|---|---|---|
| `AWAITING_PAYMENT` | Aguardando pagamento | âmbar |
| `CONFIRMED` | Confirmado | verde |
| `SHIPPED` | Enviado | azul |
| `DELIVERED` | Entregue | verde |
| `CANCELLED` | Cancelado | neutro |
| `PAYMENT_FAILED` | Pagamento não aprovado | vermelho |

O campo `cancelável` do mapa fica **declarado mas sem uso nesta etapa** — é o que
a etapa 6 consome. `CONFIRMED` é cancelável: verificado ao vivo.

## Data sem fuso — resolver aqui

`createdAt` e `changedAt` chegam como `"2026-07-30T13:01:34.4862"`: sem `Z`,
sem offset. É o item 3 dos "menores" do 26, que deixa de ser inofensivo agora que
a data **aparece na tela**.

O problema: `new Date("…13:01:34")` é lido como **hora local do runtime**. No
servidor isso é o fuso do host; no navegador, o do visitante. `format.ts` já fixa
a exibição em `America/Sao_Paulo`, então um host em UTC renderizaria 10:01.

**Correção proposta:** `parseApiDateTime()` em `format.ts` — quando a string não
traz offset, assume o fuso da loja e anexa `-03:00`. O Brasil não tem horário de
verão desde 2019, então o offset de São Paulo é constante; se voltar a ter, esta
é a linha a mexer. A correção certa é o backend mandar o offset — fica registrado
no item 27 para o dono.

## Erros → UI

Ramificação por `code`, nunca por mensagem ([15](15-code-conventions.md)). Dois
códigos ganham copy nesta etapa:

| `code` | Copy |
|---|---|
| `ORDER_NOT_FOUND` | "Pedido não encontrado." |
| `PAYMENT_FAILED`* | "Não conseguimos aprovar o pagamento." |

\* não é `code` de erro — é `OrderStatus`. Entra no mapa de status, não no
`error-messages.ts`; listado aqui só para não sumir.

## Testes

Seguindo [10-testing.md](10-testing.md):

- **node** — `orders.ts` com MSW (feliz, 409, 404), validação do route handler,
  `lib/orders/status.ts`, `parseApiDateTime` (com e sem offset, e o `Z` que já
  funciona).
- **jsdom** — `CheckoutForm` (envia só `paymentMethod`; 409 leva ao carrinho;
  duplo clique cria **um** pedido; 401 leva ao login), `PaymentMethodPicker`
  (troca de método troca os campos), `PaymentFields` (**nenhum `autocomplete` de
  cartão** e nada é enviado), `OrderStatusBadge`, `StatusTimeline`.
- **smoke** — estender `live-contract.smoke.test.ts`: adicionar → checkout →
  `status CONFIRMED` → `GET /orders/{id}` devolve o mesmo pedido → carrinho ficou
  vazio → checkout de novo dá `404 CART_NOT_FOUND`.

## Verificado ao vivo (2026-07-30)

Detalhe completo no item 27 de [09-contract-notes.md](09-contract-notes.md):
checkout feliz, carrinho vazio, `paymentMethod` ausente e inválido, estoque
zerado por trás do carrinho, pedido por id, id inexistente e cancelamento.
