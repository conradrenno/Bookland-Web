# 13 — Header comum

Header padrão em todas as páginas (`SiteHeader`, montado em `app/layout.tsx`).
Estética: editorial/clássica (ver [11-style-brief.md](11-style-brief.md)).

## Estrutura (esquerda → direita)

1. **Logo** — canto superior esquerdo; link para `/` (landing = catálogo).
2. **Navegação principal:**
   - **Categorias** — *hover* abre um dropdown com as categorias
     (`GET /api/v1/categories`); *clique* vai para `/categories` (todas).
     Selecionar uma categoria → catálogo filtrado (`/?category={id}` →
     `GET /categories/{id}/books`).
   - **Mais bem avaliados** — `/?sort=rating` (`GET /books?sort=rating`).
3. **Busca** — barra **centralizada**; submit → `/?q={termo}`
   (`GET /books?q=` — busca título + autor, story US-05).
4. **Lado direito:**
   - **Deslogado:** **Entrar** (`/login`) · **Criar conta** (`/register`) ·
     ícone do **Carrinho**.
   - **Logado:** **menu de Perfil** (avatar/ícone + nome) — substitui
     Entrar/Criar conta — com dropdown: **Minha conta**, **Meus pedidos**,
     **Sair** (logout) · ícone do **Carrinho**. Se `role === "ADMIN"`, o dropdown
     inclui **Admin** (fase 2).
   - **Carrinho com contador:** badge = soma das quantidades
     (`CartViewModel.items[].quantity`).

## Decisão de menu — Opção A (dono, 2026-07-24)

Menu **enxuto ao que a API suporta hoje**. Os itens originais **Best Sellers,
Deals, Authors, Publishers** foram removidos do MVP por **não terem lastro na
API** (sem métrica de vendas, sem desconto, sem endpoint de autores, sem filtro
por editora). Ficam para a fase 2, **pendentes de suporte no backend** —
registrados em [09-contract-notes.md](09-contract-notes.md) (item "Opção B").

## Estado de autenticação

- Determinado por `getCurrentUser()` (decodifica o `bl_access`; ver
  [02-auth.md](02-auth.md)) — server-side.
- **Carrinho só existe para autenticado** (a API `/cart` exige auth). Deslogado:
  clicar no carrinho → `/login?next=/cart`; badge oculto (ou 0).
- **Contador do carrinho:** para o usuário logado, o header lê o carrinho
  server-side (BFF). Custo: 1 `GET /cart` por render de página com header —
  aceitável no MVP; otimizável depois (cache por request / contexto client).
- **Logout** é mutação → client chama `POST /api/auth/logout` (route handler),
  que limpa cookies e revoga o refresh.

## Comportamento & responsividade

- **Sticky** no topo, com leve sombra ao rolar (discreto — style brief pede
  visual editorial, sem exageros).
- **Mobile:** nav colapsa em menu (hambúrguer); busca vira ícone que expande;
  perfil/carrinho permanecem acessíveis.
- **SSR:** header renderiza no server; partes interativas (dropdown, busca,
  menu de perfil, logout) são ilhas client.
