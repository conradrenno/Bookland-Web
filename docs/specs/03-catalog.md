# 03 — Catálogo

Cobre US-05 (buscar/filtrar), US-06 (detalhe), US-10 (categorias).

## US-05 — Navegar e buscar livros

**Rota:** `/` (landing = catálogo paginado; Server Component, SSR — SEO).
**Upstream:** `GET /api/v1/books` → `PageResult<BookViewModel>`.

Query params (contrato):

| Param | Tipo | Nota |
|---|---|---|
| `q` | string | busca por título (parcial) e autor |
| `category` | uuid | filtro por categoria |
| `minPrice` / `maxPrice` | number | faixa de preço |
| `sort` | string | default `title`; também `price`, `rating` (ver nota) |
| `page` | int | default 0 |
| `size` | int | default 20 |

### ✅ `parseBookSearchParams` — a URL não vai crua para o upstream (2026-07-29)

Os parâmetros acima nascem da **barra de endereço**, então chegam editáveis à
mão. Medido ao vivo (detalhe no item 25 da
[09-contract-notes.md](09-contract-notes.md)): `?category=not-a-uuid` e
`?minPrice=abc` devolvem **400**, `?size=1000` é obedecido ao pé da letra, e um
`sort` desconhecido é **ignorado em silêncio** (200 em ordem de título).

`parseBookSearchParams(searchParams)` em [`lib/api/books.ts`](../../src/lib/api/books.ts)
absorve isso antes da chamada:

- filtro inválido (uuid malformado, preço não-numérico ou negativo) → **descartado**,
  não repassado — um typo na URL mostra o catálogo, não uma tela de erro;
- `size` limitado a `MAX_PAGE_SIZE` (60); `page` inteiro ≥ 0;
- `sort` restrito a `title | price | rating` (decisão de produto — o contrato
  aceita string livre), sempre resolvido, para a UI marcar o filtro ativo;
- **parâmetro repetido** (`?sort=price&sort=rating`) chega como array e é
  **recusado inteiro**, mesma regra do `?next=` em [16](16-auth-pages.md).

`page` é **zero-based**, igual ao contrato e ao `PageResult.page`.

Regras (story):
- Resultado paginado com `totalElements` / `totalPages` (já vem no `PageResult`).
- Ordenação por preço, título ou avaliação média.
  ⚠️ `sort=price` verificado ao vivo (ordem crescente). `sort=rating` **não foi
  possível verificar**: todo o catálogo semeado está com `avgRating: 0`, então a
  ordem resultante é indistinguível da default. Reconferir quando houver reviews.
- Livros com estoque zero **aparecem marcados** como indisponível (campo
  `available` do `BookViewModel`), não somem da lista. Confirmar comportamento
  real do backend p/ `available` vs `stockQuantity`.
- **`avgRating: 0.0` = "sem avaliações"**, não "zero estrelas" (reviews são 1..5).
  `formatRating()` devolve `null` nesse caso — a UI mostra "Sem avaliações", nunca
  cinco estrelas vazias como se fosse nota.

UI:
- `SearchBar` (client) atualiza a query string; a página re-renderiza no server.
- `BookCard`: **capa** (`coverImageUrl` via `next/image`, com placeholder quando
  ausente), título, autores, preço (pt-BR `R$`), estrelas (`avgRating`), badge
  "Indisponível" quando `!available`. Ordem visual segue o style brief:
  capa → título → autor → preço → CTA.
- Filtros: categoria (do `GET /categories`), faixa de preço, `sort`.
- Estados: vazio ("nenhum livro encontrado"), erro, paginação.

## US-06 — Detalhe do livro

**Rota:** `/books/[bookId]` (SSR, **agregado**).
**Upstream:** `GET /books/{id}` **+** `GET /books/{id}/reviews` (1ª página) numa
só renderização de página.

Exibe: **capa** (`coverImageUrl`), título, ISBN, autores, editora, ano, edição,
sinopse, preço, avaliação média e disponibilidade.

- Livro inexistente → `ApiError(404)` → `notFound()` (página 404). Id malformado
  é checado **antes** da chamada (`isUuid`): o upstream responderia 400, e um
  link com typo é página inexistente, não requisição inválida.

  > 🟡 **Soft 404 (aberto, 2026-07-29).** O `notFound()` renderiza a UI certa,
  > mas o **status HTTP sai `200`**, não 404. Verificado no build de produção
  > (`pnpm start`), não é artefato do dev. Rota inexistente (`/rota-qualquer`)
  > devolve 404 corretamente — o problema é só quando o `notFound()` parte de
  > dentro de uma página dinâmica. Descartado como causa: o `<Suspense>` do
  > header (removê-lo não muda nada). Hipótese em aberto: a resposta já foi
  > commitada pelo streaming quando a página resolve. Não afeta o que o visitante
  > vê; afeta crawler/SEO. **Investigar isoladamente.**
- **Estoque:** UI mostra disponibilidade ("Em estoque" / "Indisponível") a
  partir de `available`; a quantidade exata (`stockQuantity`) fica oculta por
  padrão (decisão de produto da story — "não expõe quantidade exata se
  configurado para ocultar"). Mostrar número só se decidirmos habilitar.
- Ações: "Adicionar ao carrinho" (client → `POST /api/cart/items`), desabilitada
  quando indisponível. Reviews renderizadas na mesma página (ver
  [04-reviews.md](04-reviews.md)).

## US-10 — Categorias

**Rota:** `/categories` (todas as categorias).
**Upstream:** `GET /api/v1/categories` → `CategoryViewModel[]`
(`id`, `name`, `bookCount`).
**Livros por categoria:** `GET /categories/{categoryId}/books` →
`PageResult<BookViewModel>` (reusa a UI da landing via `/?category={id}`).

- Usado no header/menu de navegação e nos filtros do catálogo.
- `bookCount` permite exibir contagem; categorias com 0 livros podem ser omitidas
  na navegação (decisão de UI).

## Capa do livro (`coverImageUrl`)

Campo adicionado ao `BookViewModel` (e a `Create/UpdateBookRequest`) —
**opcional** (string). Regras de UI:

- Renderizar com **`next/image`**; quando `coverImageUrl` for ausente/vazio,
  usar um **placeholder** (ex.: capa neutra com o título) — nunca `img` quebrada.
- **Aspect ratio** consistente de capa (ex.: `2 / 3`), `object-cover`, com
  `sizes` adequado para o grid; `alt` = `título`.
- O host da URL precisa estar em `next.config.ts › images.remotePatterns`.
  ✅ **Resolvido (2026-07-29):** `covers.openlibrary.org` (catálogo semeado) e
  `localhost:8080` (uploads) estão declarados. Falta só o host real de produção.
- **Upload da capa (admin, fase 2):** `POST /api/v1/books/{bookId}/cover`
  (`multipart/form-data`, campo `file`). Não faz parte do storefront MVP.

### ⚠️ `coverImageUrl` pode ser **relativa** — normalizar no BFF

O campo não é sempre uma URL absoluta. Depende da origem:

| Origem | Valor gravado | Ex. |
|---|---|---|
| Upload via API | **caminho relativo** | `/media/covers/{uuid}.jpg` |
| Cadastro manual / seed | URL absoluta | `https://covers.openlibrary.org/…` |

O `LocalImageStorageAdapter` grava `/media/covers/{uuid}.ext` e o Spring serve
esse prefixo como recurso estático. Sem normalizar, capas enviadas por upload
quebram — `/media/...` resolveria contra o host do Next, não o do Spring.

✅ **Implementado (2026-07-29):** `resolveCoverUrl()` em
[`lib/api/covers.ts`](../../src/lib/api/covers.ts). Absoluta `http(s)` → usa como
está; qualquer outra coisa → prefixa com **`MEDIA_BASE_URL`**; vazio → `null`
(sinal para a UI desenhar o placeholder, nunca imagem quebrada).

- **`MEDIA_BASE_URL` é separado de `API_BASE_URL`** (`lib/config.ts`) porque este
  vai **renderizado no HTML** — precisa ser um endereço que o otimizador de
  imagem do Next alcance, não o endereço interno que o BFF chama. Em dev
  coincidem; em produção, definir `NEXT_PUBLIC_BOOKLAND_MEDIA_URL`.
- Só `http`/`https` contam como absoluta, de propósito: um valor
  protocol-relative (`//outro.host/x.jpg`) ou um `javascript:` digitado no
  cadastro admin cai no ramo relativo e acaba **preso à nossa origem**.

### Limite de 255 chars — por que não é um problema

`books.cover_image_url` e `order_items.cover_image_url` são `varchar(255)`
(item 19 do [09](09-contract-notes.md)). Medido com casos reais:

| Caso | chars |
|---|---|
| Upload atual `/media/covers/{uuid}.jpg` | **54** |
| OpenLibrary (semeado) | 57 |
| S3 canônica em bucket público | 91 |
| Google Books thumbnail | 111 |
| Cloudinary com transformações | 141 |
| **S3 presigned (assinada)** | **358** ❌ |

Só estoura no caso de **URL assinada** — que **não deve ser persistida de
qualquer forma**, porque expira (guardar uma URL de 1 h num pedido de 2022
significa capa quebrada). A regra que mantém 255 confortável para sempre:

> **A coluna guarda um identificador estável (chave/caminho), não uma URL
> renderizada.** Assinatura, CDN e transformações são aplicadas **na leitura**.

O backend já segue isso — `ImageStoragePort.store()` devolve caminho, e o
Javadoc prevê trocar o adapter por S3/GCS sem tocar nas camadas internas.
Se um dia migrarem para bucket privado, o caminho é: adapter devolve a **chave**
(~40 chars), e a URL assinada é gerada por requisição — nunca gravada.

> ### ✅ Decisão: **não mexer no banco.** `varchar(255)` fica como está.
> Nenhuma migration é necessária — nem agora, nem previsivelmente. O que segue é
> **plano de contingência**, não tarefa.

**Se algum dia** aparecer a necessidade real de guardar URL externa longa, em
ordem de preferência:

1. **Proxy pelo nosso domínio** — servir `/_covers/{bookId}` no Next/BFF, que
   resolve e cacheia a origem externa. A coluna guarda só o identificador, e de
   quebra ganhamos `next/image` e independência do host. **Não exige migration.**
2. **Alargar as colunas** via migration — e aí seriam **duas**:
   `books.cover_image_url` (linha 40 da V1) **e** `order_items.cover_image_url`
   (linha 120). A segunda existe porque o item de pedido guarda um **snapshot**
   da capa no momento da compra, independente do catálogo; alargar só `books`
   deixaria o pedido estourando no INSERT.

A opção 1 é melhor justamente por não tocar no schema.
- ✅ **Cart/Order/Wishlist/LowStock items já trazem `coverImageUrl`**
  (resolvido 2026-07-27) — miniatura nessas telas sai direto da resposta,
  **sem agregação no BFF**. `CartItemViewModel` também ganhou `title` e
  `available`. Ver [09-contract-notes.md](09-contract-notes.md) item 11.

## Renderização

- `/` (catálogo), `/books/[id]`, `/categories`: **SSR** (Server Components).
- Interações (busca, add-to-cart): ilhas **client**.
- Cache: MVP sem ISR; `fetch` sem cache persistente (dados de estoque/preço
  mudam). Reavaliar `revalidate` por rota depois.
