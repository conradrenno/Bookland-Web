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
| Campos de pagamento | **Decorativos, por método, mas obrigatórios e validados** | Pedido do dono em 2026-07-30 — a demo tem que parecer uma loja, e o número tem que parecer um cartão. Regras próprias na seção abaixo. |

## Arquivos

```
lib/api/orders.ts             checkout / getOrder
lib/api/orders.test.ts        MSW: feliz + 409 de estoque + 404 de carrinho vazio
lib/api/payments.ts           getOrderPayment (só leitura, para a página do pedido)
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
lib/checkout/payment-schema.ts               zod por método (Luhn, validade, chave PIX)
lib/checkout/payment-schema.test.ts
components/checkout/order-review.tsx         itens e total, só leitura
components/orders/order-status-badge.tsx     rótulo pt-BR + cor
components/orders/order-items.tsx            linhas do pedido (sem controles)
components/orders/order-payment.tsx          método + status do pagamento
components/orders/status-timeline.tsx        statusHistory em ordem

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
| `getOrderPayment(token, orderId)` | `GET /api/v1/payments/order/{orderId}` | `PaymentViewModel` |

`CheckoutRequest`, `OrderViewModel`, `OrderItemViewModel`,
`StatusTransitionViewModel`, `PaymentViewModel` e `PaymentMethod` **já existem**
em `types.ts` — o contrato foi mapeado inteiro na etapa 1.

### Por que o pagamento entra (README do backend, 2026-07-30)

`GET /payments/order/{orderId}` é **autenticado, não admin** — o cliente pode ler
o próprio pagamento. Sem isso, o método que ele acabou de escolher **some da
tela**: o `OrderViewModel` não traz `paymentMethod` em campo nenhum. A página do
pedido pede os dois em paralelo e mostra "Pago com PIX · aprovado".

É exatamente o papel de **agregador** que o BFF tem por decisão do dono
([01](01-architecture-bff.md)) — e o único caso da etapa em que ele compõe algo.
Falha do pagamento **esconde o bloco**, não derruba a página: mesmo precedente do
`safeCategories()` e do badge do carrinho. Custa uma chamada a mais por pageview
de pedido, num lugar que não é hot path.

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

| Método | Campos | Validação (RHF + zod, como em [16](16-auth-pages.md)) |
|---|---|---|
| `CREDIT_CARD` / `DEBIT_CARD` | Número | 16 dígitos, máscara `0000 0000 0000 0000`, **passa no Luhn** |
| | Validade | `MM/AA`, mês 01–12, **no futuro** |
| | CVV | 3 ou 4 dígitos |
| | Nome impresso | dois nomes, só letras e espaço |
| `PIX` | Chave | e-mail, CPF/telefone (11 dígitos) **ou** chave aleatória (UUID) |
| `PAYPAL` | E-mail | formato de e-mail |

**Todos são obrigatórios** — decisão do dono em 2026-07-30: o número tem que
*parecer* um cartão de verdade, e um campo que aceita qualquer coisa não parece.
O formulário só envia com tudo válido, exatamente como uma loja real.

**Luhn, e o que fazer para não travar a demo.** Dígito verificador é o que separa
"16 dígitos" de "número plausível" — mas 16 dígitos ao acaso reprovam no Luhn
quase sempre, e quem estiver testando ficaria preso. Então o aviso obrigatório
**também é a ajuda**:

> *Simulação — use um número de teste, ex.: 4111 1111 1111 1111. Estes campos
> não são enviados a lugar nenhum; não use dados reais.*

Se na prática isso incomodar, tirar o Luhn é apagar uma linha do schema; o resto
da validação continua de pé.

**Três regras que não são de gosto, e a implementação não pode afrouxar:**

1. **Nunca saem da página.** O `POST` manda **só** `{ paymentMethod }`, que é o
   único campo que a API tem. O resto morre no componente — nem no `router`, nem
   em `localStorage`, nem em log.
2. **Nenhum `autocomplete` de pagamento.** Nada de `cc-number`, `cc-exp`,
   `cc-csc`: esses tokens fazem o navegador **oferecer o cartão de verdade** do
   usuário para um campo de mentira. Vai `autoComplete="off"` e nomes neutros.
   Vale o mesmo para a chave PIX, que pode ser CPF.
3. **O aviso é obrigatório e fica junto dos campos**, não no rodapé da página:
   quem está digitando tem que ler antes de digitar.

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
`OrderStatusBadge`, itens com capa/título/preço **congelado no checkout**
(o backend congela preço, título e capa — README), total, forma de pagamento e a
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
a etapa 6 consome. Deixou de ser palpite: o README do backend diz que se cancela
**de `AWAITING_PAYMENT` ou `CONFIRMED`**, e que cancelar um `CONFIRMED` dispara
**restauração de estoque + estorno automático**. Bate com o `DELETE` que rodei
ao vivo. Os demais status não são canceláveis.

`PaymentStatus` ganha rótulos junto, porque a página mostra o pagamento:
`PENDING` "processando", `APPROVED` "aprovado", `DECLINED` "não aprovado",
`REFUNDED` "estornado" — este último é o que aparece depois de um cancelamento.

## Data sem fuso — resolver aqui

**✅ Resolvido no backend, antes de a etapa começar (2026-07-30).** As datas
chegavam como `"2026-07-30T13:01:34.4862"` — sem `Z` e sem offset, ou seja, sem
dizer que instante eram. O dono trocou `LocalDateTime` por **`Instant`** em todos
os módulos, e agora vem assim:

```
"createdAt": "2026-07-30T19:55:57.117193400Z"
```

Conferido campo a campo logo depois de subir: **9 campos de data em 5 respostas
(carrinho, pedido, histórico, pagamento, usuário), todos com `Z`, todos como
string** — não epoch — e o instante batendo com o relógio real, sem
deslocamento de 3 horas na conversão. As 9 casas decimais que o `Instant` do Java
emite não incomodam: o JS trunca para milissegundos.

**Consequência para esta etapa: o `parseApiDateTime()` que estava planejado sai
do escopo.** Ele existia só para anexar `-03:00` ao que não tinha fuso, embutindo
a premissa de que o relógio do backend é o da loja. Com instantes de verdade,
`new Date()` basta e o `formatDate`/`formatDateTime` — que já fixam a exibição em
`America/Sao_Paulo` — passam a mostrar o mesmo horário para todo mundo, servidor
e navegador inclusive. Some junto o risco de mismatch de hidratação.

**Fica no lugar dele uma asserção nos smoke**, que é o que garante que nenhum
módulo ficou para trás e que a regressão apareça na hora: todo campo de data de
toda resposta tem que casar com `/(Z|[+-]\d{2}:?\d{2})$/`.

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
  `lib/orders/status.ts`.
- **jsdom** — `CheckoutForm` (envia só `paymentMethod` **e nada dos campos de
  pagamento**; 409 leva ao carrinho; duplo clique cria **um** pedido; 401 leva ao
  login), `PaymentMethodPicker` (troca de método troca os campos **e limpa os
  anteriores**), `PaymentFields` (campo vazio barra o envio; número que reprova
  no Luhn barra; validade no passado barra; **nenhum `autocomplete` de cartão**),
  `OrderStatusBadge`, `StatusTimeline`.

  O teste do corpo enviado é o mais importante da etapa: é ele que trava a regra
  de que **nenhum dado de pagamento sai do navegador**.
- **smoke** — estender `live-contract.smoke.test.ts`: adicionar → checkout →
  `status CONFIRMED` → `GET /orders/{id}` devolve o mesmo pedido → o pagamento
  existe e é `APPROVED` → carrinho ficou vazio → checkout de novo dá
  `404 CART_NOT_FOUND`. **Mais a asserção de fuso** descrita acima, varrendo as
  respostas em vez de conferir campo a campo — assim ela cobre campo novo que
  apareça depois.

## Verificado ao vivo (2026-07-30)

Detalhe completo no item 27 de [09-contract-notes.md](09-contract-notes.md):
checkout feliz, carrinho vazio, `paymentMethod` ausente e inválido, estoque
zerado por trás do carrinho, pedido por id, id inexistente e cancelamento.

**Falta uma sondagem, e agora dá para fazer:** o README revela uma **segunda
conta semeada** — `joao@bookland.com` / `joao1234` (CUSTOMER). Com ela dá para
fechar o que a [06](06-orders.md) deixou em aberto: o que responde `GET
/orders/{id}` de um pedido **de outro cliente** — 403 ou 404? Muda o que a
página faz. Enquanto não medimos, `/orders/[orderId]` trata **os dois como
`notFound()`**, que é a postura segura: confirmar a existência do pedido alheio
não ajuda ninguém. Rodar quando o dono reiniciar o Spring.

Vale também usar a conta de cliente nos smoke daqui em diante: hoje eles correm
como **admin**, que é o único perfil que passa por rotas que o storefront nunca
toca. Comprar como cliente é o caminho que a app exercita de verdade.
