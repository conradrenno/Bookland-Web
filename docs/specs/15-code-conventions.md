# 15 — Convenções de código & padrões

> Decidido com o dono em 2026-07-28, antes de iniciar o BFF core.
> Complementa [01-architecture-bff.md](01-architecture-bff.md) (o *quê*) com o
> *como*. [10-testing.md](10-testing.md) continua sendo a fonte sobre testes.

## Princípio que rege as decisões abaixo

**Seguir o que o ecossistema JS/TS faz, salvo motivo concreto para desviar.**
Frontend tem muito menos consenso que backend — não existe equivalente ao layout
padrão do Maven — mas existem convenções dominantes, e divergir delas cobra
preço de quem entra no projeto depois.

Abstração entra quando há uma costura real, não por ritual: mais de uma
implementação plausível, ou uma fronteira que precisa ser trocada. Fora disso,
função exportada resolve — e é mais fácil de ler.

> ### ⚠️ Decisão revertida em 2026-07-28
> Uma primeira versão desta spec adotava **ports/adapters em arquivos separados
> + composition root** (`HttpTransport`, `ApiClient`, `HttpApiClient`,
> `composition.ts`), espelhando a arquitetura hexagonal do backend.
> **Foi revertido a pedido do dono**, com razão: aprender hexagonal não é motivo
> para desviar do que o mercado frontend faz, e o foco no backend é **Clean
> Architecture**, não hexagonal.
>
> O que motivava o `HttpTransport` — testar HTTP sem sobrescrever
> `globalThis.fetch` — o ecossistema já resolve com **MSW**, que intercepta no
> nível de rede. Ver [10-testing.md](10-testing.md).
>
> **Fica valendo:** o `apiFetch` é uma função; recursos são módulos de funções.
> Nada de interface + implementação + fiação para cada peça.

## Camadas do BFF

```
app/**              Server Components + route handlers   (borda HTTP/UI)
  ↓ usa
lib/api/<recurso>   Módulos de recurso        (books, cart, orders…)
  ↓ usa
lib/api/client.ts   apiFetch — gateway do upstream (query, erro, 204, token)
  ↓ usa
fetch               direto, sem camada intermediária
```

**Regra de dependência:** setas só apontam para baixo. `client.ts` não sabe o que
é um livro; `books.ts` não repete encanamento de HTTP; nenhum dos dois sabe o que
é uma rota do Next.

## Organização de pastas: por recurso

```
lib/api/
  client.ts        apiFetch + opções
  url.ts           buildUrl/query (puro)
  errors.ts        ApiError + parseUpstreamError
  problem.ts       RFC 7807 (dados)
  error-codes.ts   catálogo de `code`
  types.ts         DTOs do OpenAPI
  books.ts         (a fazer) funções do recurso
  cart.ts          (a fazer)
```

Arquivos compartilhados na raiz; cada recurso ganha o próprio módulo. Se um
recurso crescer a ponto de precisar de vários arquivos, aí sim vira pasta
(`books/`) — não antes.

**Por que não `ports/` + `adapters/`:** empacotar por camada técnica espalha
cada recurso em pastas distantes; nunca dá para ver "tudo sobre books" num lugar
só. Agrupar por assunto é o que o ecossistema faz (é o modelo do
`bulletproof-react`, a referência mais citada de arquitetura React) e também o
que o backend do Bookland faz — os módulos são `bookland-catalog`,
`bookland-auth`, `bookland-user`.

**Testes ficam co-locados** (`url.ts` ao lado de `url.test.ts`), não numa árvore
espelhada tipo `src/test/`. Em TS é o idiomático e tem razão prática: dá para ver
de relance quem tem teste, mover/apagar o módulo leva o teste junto, e o import
continua `./url`. Árvore paralela desincroniza sozinha. O Vitest só coleta
`*.test.ts` e o `next build` os ignora, então nada vaza para o bundle.

## Injeção de dependência: só onde paga

Sem container, sem composition root. O padrão é **parâmetro com default**, e só
quando existe motivo:

- `apiFetch` lê `API_BASE_URL`/`API_TIMEOUT_MS` do config direto — não há segunda
  configuração plausível em runtime.
- O **token** entra por parâmetro (`accessToken`), porque `client.ts` não pode
  importar `next/headers`: isso o prenderia ao runtime do Next e o tornaria
  inutilizável fora de um request. Quem sabe de cookie é a camada de auth.

Essa segunda é a única inversão do módulo — e existe por uma limitação técnica
real, não por gosto arquitetural.

## Modelo de erro

Único e centralizado — ver [09-contract-notes.md](09-contract-notes.md) itens 12/13.

- O upstream fala **RFC 7807** (`application/problem+json`). `problem.ts` tipa
  isso e nada mais (dados puros + type guards).
- `ApiError` é o **erro de domínio do BFF**. Toda falha — HTTP, rede, timeout,
  corpo inválido — vira um `ApiError`, para quem chama ter **um** `catch`.
- **Ramificar por `code`, nunca por `detail`.** O `detail` é prosa e o backend
  avisa que pode reescrevê-lo a qualquer momento.
- `ErrorCode` é união aberta (`KnownErrorCode | (string & {})`): os códigos
  conhecidos autocompletam, mas um código novo do backend **não quebra o build**.

## Testes

Segue [10-testing.md](10-testing.md). Reforços desta spec:

- Teste **comportamento observável**, não estrutura interna. O nome do teste
  descreve a regra ("não tenta refresh quando o 401 veio de `/error`").
- HTTP se testa com **MSW**, não com dublê injetado nem `globalThis.fetch` mockado.
- Cada regra que veio de uma descoberta contra a API real (204 sem corpo, `code`,
  `errors` por campo, 401 falso de `/error`) tem um teste que a trava — são as
  que mais custaram a descobrir.

## Estilo

- **TypeScript estrito**; sem `any` — use `unknown` + narrowing nas bordas
  (é exatamente o que `problem.ts` faz com o corpo do upstream).
- Comentário explica **por quê**, não o quê.
- Nomes revelam intenção: `isSessionProblem` em vez de `check401`.
- Arquivos em **kebab-case**; alias `@/` para `src/`.
- Idioma: **código e comentários em inglês**, specs e textos de UI em **pt-BR**.

## Commits

**[Conventional Commits](https://www.conventionalcommits.org/) com mensagem em
inglês** — mesma regra do código: o histórico é artefato técnico, e o padrão é o
que o ecossistema JS/TS usa (habilita changelog/versionamento automático depois,
se um dia fizer sentido).

```
<tipo>(<escopo opcional>): <resumo no imperativo, minúsculo, sem ponto final>

<corpo opcional — o porquê, não o quê>
```

- **Tipos:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`.
- **Escopo** = a área tocada, geralmente a pasta: `api`, `auth`, `ui`, `catalog`,
  `deps`, `specs`.
- Um commit = uma mudança coerente. Teste anda junto com o código que ele cobre.
- Breaking change: `!` depois do escopo (`feat(api)!: ...`).
