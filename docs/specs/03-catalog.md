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

Regras (story):
- Resultado paginado com `totalElements` / `totalPages` (já vem no `PageResult`).
- Ordenação por preço, título ou avaliação média.
- Livros com estoque zero **aparecem marcados** como indisponível (campo
  `available` do `BookViewModel`), não somem da lista. Confirmar comportamento
  real do backend p/ `available` vs `stockQuantity`.

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

- Livro inexistente → `ApiError(404)` → `notFound()` (página 404).
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
- O host da URL precisa estar em `next.config.ts › images.remotePatterns`
  (hoje: `localhost:8080`; ajustar para o host real de produção).
  🔴 **Furo atual:** os livros semeados usam `https://covers.openlibrary.org/...`,
  que **não está** em `remotePatterns` — `next/image` derruba a página com
  "hostname not configured". Adicionar `covers.openlibrary.org` (dev) antes de
  renderizar o catálogo.
- **Upload da capa (admin, fase 2):** `POST /api/v1/books/{bookId}/cover`
  (`multipart/form-data`, campo `file`). Não faz parte do storefront MVP.

### ⚠️ `coverImageUrl` pode ser **relativa** — normalizar no BFF

O campo não é sempre uma URL absoluta. Depende da origem:

| Origem | Valor gravado | Ex. |
|---|---|---|
| Upload via API | **caminho relativo** | `/media/covers/{uuid}.jpg` |
| Cadastro manual / seed | URL absoluta | `https://covers.openlibrary.org/…` |

O `LocalImageStorageAdapter` grava `/media/covers/{uuid}.ext` e o Spring serve
esse prefixo como recurso estático. Então o front precisa de um **normalizador**:

```ts
// começa com http(s) → usa como está; senão → prefixa com a base da API
const coverSrc = (u?: string) =>
  !u ? null : /^https?:\/\//.test(u) ? u : `${API_PUBLIC_BASE}${u}`;
```

Sem isso, capas enviadas por upload quebram (`/media/...` resolveria contra o
host do Next, não o do Spring).

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
