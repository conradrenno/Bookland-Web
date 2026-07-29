# Bookland Web — Specs

Decisões de dono + contrato, que **ancoram** a implementação do BFF/Next.
Ordem de leitura sugerida:

| # | Spec | Responde |
|---|------|----------|
| 00 | [Visão geral & escopo](00-overview.md) | O que é, MVP, fases, decisões tomadas |
| 01 | [Arquitetura & BFF](01-architecture-bff.md) | Papel do BFF (agregador), estrutura, convenções, erros |
| 02 | [Autenticação](02-auth.md) | Cookie httpOnly, refresh/rotação, middleware (US-01→04) |
| 03 | [Catálogo](03-catalog.md) | Busca, filtros, listagem, detalhe (US-05, US-06, US-10) |
| 04 | [Avaliações](04-reviews.md) | Ler e criar reviews (US-19, US-20) |
| 05 | [Carrinho & Checkout](05-cart-checkout.md) | Carrinho e finalização (US-13, US-14) |
| 06 | [Pedidos](06-orders.md) | Histórico, detalhe, cancelamento (US-15, US-16, US-18) |
| 07 | [UI, design & i18n](07-ui-design.md) | shadcn/ui, SSR vs client, pt-BR, UX de erro |
| 08 | [Fase 2 (backlog)](08-phase-2.md) | Wishlist, conta, painel admin |
| 09 | [Notas de contrato](09-contract-notes.md) | ⚠️ Divergências OpenAPI × stories do Linear |
| 10 | [Estratégia de testes](10-testing.md) | Vitest (unit no BFF) + Playwright (E2E depois) |
| 11 | [Style brief](11-style-brief.md) | Direção visual: editorial/livraria clássica |
| 12 | [Tailwind / design tokens](12-config-tailwinds.md) | Paleta de marca, light+dark, fontes (aplicado no `globals.css`) |
| 13 | [Header comum](13-common_header.md) | Header padrão: logo, categorias, busca, perfil/carrinho |
| 14 | [Footer](14-footer.md) | Footer padrão: mapa do site, contato, pagamento |
| 15 | [Convenções de código](15-code-conventions.md) | Camadas, organização por recurso, erro, estilo |
| 16 | [Páginas de auth](16-auth-pages.md) | `/login` e `/register`: RHF+zod, `?next=`, erro → UI |

## Fontes de verdade

| Fonte | Responde | Precedência |
|---|---|---|
| **API Bookland** (`docs/bookland-openapi.json` + Spring rodando) | Contrato **e** comportamento: endpoints, DTOs, tipos, enums, regras já implementadas | **Máxima** |
| Linear (projeto Bookland, team REN) | Intenção original: jornada, critérios de aceitação, prioridade | Referência (pode estar desatualizada) |
| Estas specs | Decisões do dono: escopo, auth, SSR, BFF, design | Decisões de produto |

> **Regra (dono, 2026-07-24): a API sempre vence.** Onde uma story/issue do Linear
> divergir da API já construída, considere a **story desatualizada** e siga a API —
> em shapes *e* em regras de negócio. As stories valem como intenção/contexto,
> mas não sobrepõem o que a API faz. Colisões concretas em
> [09-contract-notes.md](09-contract-notes.md).

## Decisões do dono (fixadas em 2026-07-24)

1. **Escopo MVP:** storefront completo — catálogo/busca → detalhe+reviews → carrinho → checkout → pedidos + auth. Wishlist, conta e admin → **fase 2**.
2. **Auth:** access + refresh em **cookies httpOnly**; refresh e rotação **server-side** no BFF. Browser nunca vê o token.
3. **Styling:** **Tailwind + shadcn/ui**.
4. **BFF:** papel **agregador** — compõe respostas e molda DTOs para o front quando útil (não só passthrough).
