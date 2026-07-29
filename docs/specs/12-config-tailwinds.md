# 12 — Tailwind / Design tokens

Paleta de marca do dono (warm/bookish: creme · marrom · terracota · oliva ·
dourado), traduzida para **Tailwind v4 + shadcn** e aplicada em
`src/app/globals.css`. Este doc é a fonte de verdade dos tokens; o `.ts` v3
original (no fim) fica só como **origem**.

## Como funciona no nosso stack

- Tailwind v4 é **CSS-first**: tokens vivem em `globals.css` (`@theme` + CSS
  variables), não num `tailwind.config.ts`. O `.ts` que o dono passou **não é
  lido** pelo v4 — foi convertido.
- Os componentes shadcn leem variáveis semânticas (`--primary`, `--card`,
  `--ring`, …). Completamos o set que faltava para eles funcionarem.
- **Light** em `:root`; **dark** em `.dark` (toggle manual futuro) **e** em
  `@media (prefers-color-scheme: dark)` (responde ao SO já, sem JS). Os dois
  blocos dark devem ficar em sincronia.

## Decisões de tradução (inferidas)

1. **`secondary` do shadcn ≠ verde do dono.** No shadcn, `secondary` é uma
   superfície neutra suave (botão discreto, badge secundária). O verde-oliva
   saturado (#3F4B3B) foi movido para um token **`--brand`** próprio; o
   `secondary` virou um neutro derivado do `muted`, com o oliva como cor de
   **texto** (`secondary-foreground`) para não perder a identidade.
2. **Superfícies adicionadas:** `card`/`popover` = creme quase branco (#FFFCF7)
   sobre o `background` creme, para dar leve elevação.
3. **Formulário/foco:** `input` = cor do `border`; `ring` = `primary` (terracota)
   no light e uma terracota mais clara (#C9754F) no dark, para o foco ficar
   visível — importante para acessibilidade.
4. **Estados semânticos** (não existiam): `success` (verde), `warning` (âmbar),
   `info` (azul-petróleo), além do `destructive` que já havia. Usados pelo
   `StatusBadge` (ver `06-orders.md`) e pela UX de erro (`07-ui-design.md`).
5. **Dark inferido** a partir da paleta: fundo marrom quente escuro (#1C1712) em
   vez de preto puro, mantendo o tom "livraria". `primary`/`destructive` seguem
   escuros o suficiente para texto creme legível (contraste ~5.5:1+); `accent`,
   `warning`, `info` clareiam para contraste sobre o escuro.
6. **Radius:** `--radius: 0.5rem` (o DEFAULT 8px do dono). A escala shadcn deriva
   sm/md/lg/xl a partir daí.
7. **Fontes:** Fraunces (serif, títulos) + Source Sans 3 (corpo), carregadas via
   `next/font/google` no `layout.tsx` (substituem a Geist do scaffold). `h1–h4`
   usam `font-serif` por padrão (regra em `@layer base`).

## Tokens (semânticos → utilitários)

Cada `--x` gera utilitários `bg-x` / `text-x` / `border-x` etc.

| Token | Light | Dark | Uso |
|---|---|---|---|
| `background` / `foreground` | `#FAF6F1` / `#2B211B` | `#1C1712` / `#EDE4D8` | página |
| `card` / `-foreground` | `#FFFCF7` / `#2B211B` | `#241D17` / `#EDE4D8` | Card, superfícies |
| `popover` / `-foreground` | `#FFFCF7` / `#2B211B` | `#241D17` / `#EDE4D8` | dropdowns, dialog |
| `primary` / `-foreground` | `#A8492F` / `#FAF6F1` | `#A8492F` / `#FDF7F0` | CTA principal |
| `secondary` / `-foreground` | `#EDE4D8` / `#3F4B3B` | `#2E2822` / `#EDE4D8` | ações discretas |
| `muted` / `-foreground` | `#EDE4D8` / `#6B5D4F` | `#2A241E` / `#B3A594` | texto secundário |
| `accent` / `-foreground` | `#C9A15A` / `#2B211B` | `#C9A15A` / `#1C1712` | destaques (dourado) |
| `destructive` / `-foreground` | `#9B3B2E` / `#FAF6F1` | `#B0432F` / `#FDF7F0` | remover/erro |
| `border` / `input` | `#DDD0BE` | `#3A2F26` | bordas / campos |
| `ring` | `#A8492F` | `#C9754F` | anel de foco |
| `brand` / `-foreground` | `#3F4B3B` / `#FAF6F1` | `#6E8163` / `#14100C` | identidade (oliva) |
| `success` / `-foreground` | `#3F6B4A` / `#FAF6F1` | `#5E9268` / `#10140F` | ok/entregue |
| `warning` / `-foreground` | `#9A6410` / `#FAF6F1` | `#C79A3F` / `#1C1712` | atenção/aguardando |
| `info` / `-foreground` | `#3E5C6B` / `#FAF6F1` | `#6FA0B4` / `#10141A` | informativo |
| `chart-1..5` | terracota, oliva, dourado, taupe, azul | versões claras | gráficos (fase 2) |

Mapa `OrderStatus` → token (ver `06-orders.md`): `AWAITING_PAYMENT`→`warning`,
`CONFIRMED`→`info`, `SHIPPED`→`primary/brand`, `DELIVERED`→`success`,
`CANCELLED`→`muted`, `PAYMENT_FAILED`→`destructive`.

## Acessibilidade

Contraste alvo **AA**. Pares principais validados no light: texto no fundo
(~12:1), branco na `primary` (~5.7:1), `muted-foreground` no `muted` (~5.1:1),
branco no `success`/`info`/`destructive` (5.9–6.9:1). No dark, `primary`/
`destructive` mantidos escuros para texto creme legível. Badges de estado usam
fundo **tonalizado** (`bg-*/15`) + texto do token, não preenchimento sólido.

## Pendências / futuro

- **Toggle claro/escuro manual:** hoje o dark segue o SO. Para um switch na UI,
  adotar `next-themes` (aplica `.dark`) — fica para quando montarmos o Header.
- **Espaçamento:** usando a escala padrão do Tailwind (o dono não definiu uma
  própria). Trocar aqui se surgir uma escala de marca.

---

## Origem — config `.ts` (v3) enviada pelo dono

> Referência apenas; **não** é carregada pelo Tailwind v4.

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        background: "#FAF6F1",
        foreground: "#2B211B",
        primary: { DEFAULT: "#A8492F", foreground: "#FAF6F1" },
        secondary: { DEFAULT: "#3F4B3B", foreground: "#FAF6F1" },
        muted: { DEFAULT: "#EDE4D8", foreground: "#6B5D4F" },
        accent: { DEFAULT: "#C9A15A", foreground: "#2B211B" },
        destructive: { DEFAULT: "#9B3B2E", foreground: "#FAF6F1" },
        border: "#DDD0BE",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Source Sans 3", "system-ui", "sans-serif"],
      },
      borderRadius: { DEFAULT: "8px", lg: "12px" },
    },
  },
};

export default config;
```
