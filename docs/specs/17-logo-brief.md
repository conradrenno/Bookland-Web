# 17 — Brief da logo

Especificação para encomendar a marca da Bookland e substituir o texto
"Bookland" que hoje faz esse papel. Complementa o
[11-style-brief.md](11-style-brief.md) (estética) com os requisitos técnicos.

## Onde a marca aparece hoje

| Local | Arquivo | Fundo (claro / escuro) | Cor herdada |
|---|---|---|---|
| Header | [`site-header.tsx`](../../src/components/layout/site-header.tsx) | madeira `#6f4c3a` / `#4a3225` | `--surface-foreground` |
| Footer (barra final) | [`site-footer.tsx`](../../src/components/layout/site-footer.tsx) | quase-preto `#17110d` / `#100c09` | `--ink-foreground` |
| Login / Registro | [`(auth)/layout.tsx`](../../src/app/(auth)/layout.tsx) | creme `#faf6f1` / `#1c1712` | `--foreground` |

**São seis fundos diferentes contando o tema escuro** — e é isso que dita a
decisão principal abaixo. Uma logo em cor fixa não sobrevive aos seis.

## A decisão que importa: monocromática, com `currentColor`

Os caminhos do SVG devem usar `fill="currentColor"`. Assim o arquivo **herda a
cor do contexto**: creme sobre a madeira, creme sobre o preto, marrom escuro
sobre o creme das páginas de auth — automaticamente, e já correto no tema
escuro. Um arquivo, seis fundos, zero manutenção.

Contraste medido de cada alternativa (WCAG, mínimo 4.5:1 para texto):

| Cor | Sobre madeira | Sobre quase-preto | Sobre creme |
|---|---|---|---|
| **`currentColor`** | **6.66:1** ✅ | **15.04:1** ✅ | **14.61:1** ✅ |
| Dourado `#c9a15a` | 3.15:1 ⚠️ | 7.78:1 ✅ | **2.24:1** ❌ |
| Terracota `#a8492f` | **1.32:1** ❌ | — | 5.33:1 ✅ |
| Oliva `#3f4b3b` | **1.21:1** ❌ | — | — |

> Terracota é a cor primária da marca e **desaparece na madeira** (1.32:1) —
> mesma razão pela qual os hovers do header viraram dourados. Se a logo tiver um
> detalhe colorido, ele pode ser **dourado**, mas **não pode carregar a
> identidade**: no creme o dourado fica em 2.24:1. O que identifica a marca tem
> que estar no `currentColor`.

## Arquivos a pedir

| Arquivo | Formato | Dimensões | Uso |
|---|---|---|---|
| `logo.svg` | SVG | `viewBox="0 0 168 32"` (~5:1) | header, footer, auth |
| `mark.svg` | SVG | `viewBox="0 0 32 32"` (quadrado) | favicon, mobile estreito |
| `apple-icon.png` | PNG | 180×180, **fundo sólido** | iOS (não aceita transparência) |
| `opengraph-image.png` | PNG | 1200×630 | compartilhamento em redes |

Se vier PNG em vez de SVG: exportar a **3×** (480×96) e **duas versões**, clara
e escura — o que anula a vantagem do `currentColor`. SVG é preferível.

## Tamanhos de exibição

| Local | Altura |
|---|---|
| Header (mobile / desktop) | 28px / 32px |
| Footer | 24px |
| Login e Registro | 40px |

> **Restrição mais dura: tem que ler a 24px de altura** (o footer). É o que
> define o nível de detalhe possível — serifa fina e ornamento pequeno somem
> nesse tamanho. Desenhar pensando no menor uso, não no maior.

## Parâmetros técnicos do SVG

1. **Texto convertido em curvas** (outlines/paths). Um SVG que referencia a
   fonte por nome não renderiza em máquina que não a tenha instalada.
2. **`fill="currentColor"`** nos paths — sem cor fixa, sem `<style>`, sem
   gradiente, sem filtro.
3. **Sem `stroke`**, ou traço convertido em preenchimento: espessura de traço não
   escala junto com o resto e engorda no tamanho pequeno.
4. **`viewBox` obrigatório**; `width`/`height` na raiz são opcionais (o CSS
   controla o tamanho).
5. **Fundo transparente**, sem retângulo de fundo, sem moldura.
6. **Sem `<title>` embutido** — o nome acessível é dado no código.
7. **Sem metadados de editor** (Illustrator/Figma sujam o arquivo).
8. **Sem `<image>` embutido** — nada de raster dentro do SVG.
9. Margem óptica mínima: o espaçamento é do layout.

## Direção visual

Segue o [11-style-brief.md](11-style-brief.md): livraria editorial clássica, não
startup. A fonte de títulos do site é **Fraunces** (serifada) — pedir algo
coerente com ela ajuda a marca a parecer nativa. Evitar gradiente, neon,
glassmorphism e o clichê de "livro aberto genérico".

## Prompt pronto

> Crie a logo de uma livraria online chamada **Bookland**, estética editorial
> clássica (livraria de bairro sofisticada, não startup de tecnologia).
>
> Entregue **dois SVGs**: (1) um lockup horizontal com a palavra "Bookland",
> `viewBox="0 0 168 32"`; (2) só o símbolo, quadrado, `viewBox="0 0 32 32"`.
>
> Requisitos obrigatórios:
> - **Monocromático**, com todos os paths em `fill="currentColor"` — nenhuma cor
>   fixa, gradiente, filtro ou `<style>`.
> - **Texto convertido em curvas.** Sem `stroke` (converter traço em
>   preenchimento). Fundo transparente, sem retângulo de fundo.
> - **Precisa continuar legível a 24 pixels de altura** — evite serifa muito
>   fina e detalhe miúdo.
> - `viewBox` presente, sem `<title>` embutido, sem metadados de editor.
>
> Tipografia de referência: **Fraunces** (serifada). O desenho vai sobre fundo
> marrom-madeira escuro, preto e creme, então a forma precisa funcionar tanto em
> claro sobre escuro quanto em escuro sobre claro.

## Quando os arquivos chegarem

Trocar o texto pelo SVG nos três locais da tabela do topo, mantendo o link para
`/` e o nome acessível ("Bookland") — hoje o texto cumpre esse papel sozinho.
Favicon e ícone iOS entram como `src/app/icon.svg` e `src/app/apple-icon.png`
(convenção de arquivo do App Router).
