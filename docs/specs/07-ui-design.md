# 07 — UI, design & i18n

## Design system

- **Tailwind CSS v4** + **shadcn/ui** (base `@base-ui/react`, cor base neutral).
- Componentes shadcn já instalados: `button`, `card`, `input`, `label`, `badge`,
  `skeleton`, `separator`, `sonner` (toasts). Adicionar conforme necessidade
  (`dialog` p/ confirmação de cancelamento, `select` p/ filtros/pagamento).
- Componentes de domínio próprios em `src/components/{layout,catalog,...}`.
- `cn()` (`src/lib/utils.ts`) para compor classes.

## Layout base

- `app/layout.tsx`: `SiteHeader` (logo, busca, categorias, carrinho, conta) +
  `<main>` + `SiteFooter` + `<Toaster />` (sonner).
- Container central `max-w-6xl`, responsivo mobile-first.
- Tema claro/escuro via variáveis do shadcn (respeitar `prefers-color-scheme`).

## SSR vs client

| Renderização | Onde |
|---|---|
| **SSR** (Server Components) | catálogo, detalhe do livro, reviews (leitura), histórico e detalhe de pedidos |
| **Client** (ilhas) | barra de busca, add-to-cart, mutações do carrinho, formulários de auth e de review, botão cancelar |

Regra: dados que precisam de SEO ou vêm do BFF sem interação → server. Qualquer
coisa com `onClick`/estado local → client, chamando route handlers do BFF.

## i18n

- **pt-BR** como língua única do MVP (`<html lang="pt-BR">`).
- Sem lib de i18n agora; textos em pt-BR direto nos componentes. Centralizar em
  `src/lib/i18n/pt-BR.ts` se crescer.
- Formatação: `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
  para preços; `Intl.DateTimeFormat("pt-BR")` para datas. Helpers em
  `src/lib/format.ts`.

## UX de erro (mapa `ApiError.status` → mensagem)

| Status | Significado | Mensagem pt-BR (base) |
|---|---|---|
| 400 | validação | "Verifique os campos destacados." (+ `fieldErrors`) |
| 401 | não autenticado | "Faça login para continuar." → redireciona `/login` |
| 403 | sem permissão | "Você não tem acesso a este recurso." |
| 404 | inexistente | `notFound()` / "não encontrado" |
| 409 | conflito de regra | contextual (ex.: "estoque insuficiente", "você já avaliou") |
| 422 | regra não processável | contextual (ex.: transição de status inválida) |
| 5xx | falha upstream | "Estamos com um problema. Tente novamente." |

- Erros de mutação (client) → **toast** (sonner) + destaque inline em formulários.
- Erros de página (SSR) → UI de erro dedicada / `error.tsx` por segmento.

## Acessibilidade & estados

- Toda listagem tem estados: carregando (`skeleton`), vazio, erro.
- Botões de ação com estado `disabled`/`pending`.
- Estrelas de rating com `aria-label` (ex.: "4 de 5 estrelas").
