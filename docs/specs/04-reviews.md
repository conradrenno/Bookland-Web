# 04 — Avaliações

Cobre US-20 (ler) e US-19 (criar). Moderação (US-21) é fase 2/admin.

## US-20 — Ler avaliações de um livro

**Upstream:** `GET /api/v1/books/{bookId}/reviews?page=&size=` →
`ReviewListViewModel`:

```
{
  reviews: PageResult<ReviewViewModel>,   // id, bookId, customerId, rating, comment?, createdAt
  averageRating: number,
  ratingDistribution: { "1": n, ..., "5": n }   // Record<string, number>
}
```

Renderizado dentro de `/books/[bookId]` (agregado — ver [03](03-catalog.md)).

UI:
- Resumo: média (estrelas + número) e **distribuição** 1★–5★ (barras).
- Lista paginada: rating, comentário, data (pt-BR), autor.
- Estado vazio: "Seja o primeiro a avaliar".

✅ **Nome do avaliador (resolvido 2026-07-27):** `ReviewViewModel` traz
**`customerName`** — não é preciso resolver via `GET /users/{id}`.
**Confirmado em payload real (2026-07-28):** `"customerName": "Admin"`.
A API devolve o **nome completo**; a **anonimização é responsabilidade do front**
(story US-20: `Jo** S***`). Regra: primeiro nome com as 2 primeiras letras +
`*` para o resto de cada palavra; `customerName` vazio/nulo → "Cliente".
Ver [09-contract-notes.md](09-contract-notes.md) item 5.

## US-19 — Avaliar um livro comprado

**Rota:** `POST /api/books/{bookId}/reviews` (BFF, autenticada).
**Upstream:** `POST /api/v1/books/{bookId}/reviews` com `CreateReviewRequest`
(`rating` 1..5 obrigatório; `comment?` — story limita a 1000 chars).
Resposta: `ReviewViewModel`.

Regras (story, aplicadas no backend; front reflete os erros):
- Só quem tem pedido **DELIVERED** contendo o livro pode avaliar.
  ✅ **Confirmado ao vivo (2026-07-28):** comprar não basta — com pedido
  `CONFIRMED` e pagamento `APPROVED`, avaliar ainda devolve
  **403 `PURCHASE_REQUIRED`**. A regra é mesmo "recebeu", não "pagou".
- Uma avaliação por cliente por livro; duplicata → **409 `DUPLICATE_REVIEW`**
  ✅ verificado 2026-07-28.
- Média do livro recalculada após criar ✅ — `averageRating` e `BookViewModel.avgRating`
  já refletem a nova nota no GET seguinte.
- `ratingDistribution` vem como mapa com **chave string**: `{"5": 1}`. Ao montar
  as barras 1★–5★, iterar de `"1"` a `"5"` e tratar chave ausente como **0**.

> ⚠️ **Consequência de UX:** o CTA de avaliar **não** pode aparecer logo após a
> compra. Só oferecer em itens de pedido com `status === "DELIVERED"` — e ainda
> assim tratar `PURCHASE_REQUIRED` como rede de segurança.

UI:
- Formulário (client) na página do livro: seletor de estrelas (1–5) + textarea
  (máx. 1000, contador). Visível só para autenticados.
- Erros mapeados por `code`: **401** → pedir login; **403 `PURCHASE_REQUIRED`** →
  "avalie apenas livros que você comprou e recebeu"; **409** → "você já avaliou
  este livro".
- Após sucesso: refetch da lista de reviews / atualização otimista.
