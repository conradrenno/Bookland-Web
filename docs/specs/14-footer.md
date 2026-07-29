# 14 — Footer

Footer padrão no rodapé de **todas** as páginas (`SiteFooter`, em
`app/layout.tsx`). Duas seções.

## Primeira seção — três colunas

### Coluna 1 — Site Map
Título **"Mapa do site"**, com os mesmos links do header (Opção A — ver
[13-common_header.md](13-common_header.md)):
- **Categorias** (`/categories`)
- **Mais bem avaliados** (`/?sort=rating`)

> Os itens Best Sellers / Deals / Authors / Publishers foram removidos junto com
> o header (sem lastro na API). Reintroduzir aqui e no header quando o backend
> suportar (item "Opção B" em [09-contract-notes.md](09-contract-notes.md)).

### Coluna 2 — Contato
- Título **"Endereço"** + endereço da empresa (placeholder por ora).
- Subseção **"Fale conosco"** com telefones (placeholders/dummy inicialmente).

### Coluna 3 — Formas de pagamento
Título **"Formas de pagamento"** + ícones **decorativos** (selo de confiança —
mostram ao cliente o que será aceito no checkout):
- **Visa**, **Mastercard** (representam cartão de crédito/débito), **Pix**,
  **PayPal**.
- **Decorativo apenas** — não são clicáveis nem configuram nada.
- **Ícones inline (SVG)**, sem requisição externa (CSP/offline).
- ⚠️ **Fonte de verdade do checkout é o enum da API**
  (`PaymentMethod = CREDIT_CARD | DEBIT_CARD | PAYPAL | PIX`). As bandeiras do
  footer são só ilustrativas; quem dita as opções reais é a
  [05-cart-checkout.md](05-cart-checkout.md).

## Segunda seção — barra inferior

Visualmente separada da primeira (divider ou fundo diferente — ex.: `bg-muted`
ou `border-t border-border`). Exibe:
- Nome da empresa (**Bookland**).
- Aviso **"© Todos os direitos reservados"** com o símbolo de copyright e o ano.

## Notas de estilo

- Coerente com o style brief: tons terrosos, serif nos títulos das colunas,
  respiro. Nada de gradiente/neon.
- **SSR** (conteúdo estático); sem interação além dos links.
