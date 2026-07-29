# 10 — Estratégia de testes

**Decisão (dono, 2026-07-24):** adotar **Vitest** para testes unitários, com
escopo focado na lógica do BFF. E2E fica para uma fase posterior (Playwright).

## Princípio

Testar onde o retorno é alto e o custo é baixo: **lógica pura e ramificada**.
Não perseguir cobertura de Server Components / route handlers / middleware com
teste unitário — o valor real desse fluxo é integração/E2E.

## Ferramentas

| Camada | Ferramenta | Status |
|---|---|---|
| Unit (lógica BFF, helpers) | **Vitest** | ✅ adotado |
| Mock de HTTP | **MSW** (`msw/node`) | ✅ adotado |
| Componentes puros | **Vitest + @testing-library/react + jsdom** | a adotar |
| E2E (fluxo storefront real contra o Spring) | **Playwright** | fase posterior |

## Mock de HTTP: **MSW**, não dublê injetado

> Decidido em 2026-07-28, substituindo uma camada de transporte injetável.

O MSW intercepta **no nível de rede**, então o código sob teste chama `fetch`
exatamente como em produção. Três consequências que sustentam a escolha:

- **Não distorce o desenho.** Sem MSW, a alternativa era criar uma porta de
  transporte só para poder injetar um dublê — arquitetura movida por teste, e
  fora do que o ecossistema JS faz.
- **Testa o que roda.** O dublê provava que *o nosso wrapper* se comporta; o MSW
  exercita `fetch`, headers, status e corpo de verdade.
- **Serve a camada seguinte.** Route handlers e componentes que fazem fetch não
  aceitam dependência injetada — o `fetch` acontece dentro do Next. Ali o MSW é
  a única opção, e já estará montado.

Setup em `src/test/msw.ts`, carregado como `setupFiles` do Vitest:
`server.listen({ onUnhandledRequest: "error" })` — requisição não stubada é bug
de teste, e deixar vazar para a rede real é como suíte fica intermitente.
Handlers são por teste, via `server.use(...)`, com `resetHandlers()` entre eles.

⚠️ A suíte de contrato (`*.smoke.test.ts`) roda em config próprio **sem** o
setup do MSW — ela precisa alcançar o Spring de verdade.

## No escopo do Vitest (alta prioridade)

- **Erros** (`src/lib/api/errors.ts`): `parseUpstreamError` e as flags de
  `ApiError` (`isUnauthorized/isForbidden/isNotFound/isConflict`) para
  401/403/404/409/422; corpo não-JSON; `toResponseBody`.
- **Auth** (`src/lib/api/auth.ts`): helpers de cookie; **refresh-on-401 com retry
  único** (garantir que não entra em loop; 1 refresh no máximo por chamada).
- **Cliente HTTP** (`src/lib/api/client.ts`): montagem de URL/query, injeção do
  `Bearer`, timeout (`AbortController`), parse de 2xx vs erro. Upstream
  interceptado por **MSW** (ver abaixo).
- **Agregação/mapeamento**: funções que compõem detalhe do livro + reviews ou
  moldam DTOs (ex.: ocultar `stockQuantity`, derivar disponibilidade).
- **Regras de UI derivadas do contrato**: mapa `OrderStatus` → rótulo/cor/
  cancelável (`StatusBadge`); formatação pt-BR de `R$`/data (`src/lib/format.ts`).

## Também no escopo (média prioridade)

- **Componentes puros de apresentação**: `BookCard`, `RatingStars`, `StatusBadge`
  — render + variações de props, sem rede. Via RTL + jsdom.

## Fora do escopo do Vitest

- Server Components, route handlers (`app/api/**`), `middleware.ts`, `cookies()`,
  redirects — mockar tudo isso é frágil e de baixo valor. Cobrir com **Playwright**
  quando houver E2E (login → catálogo → carrinho → checkout → pedido → cancelar).

## Suíte de contrato (`*.smoke.test.ts`) — adicionada 2026-07-28

Uma segunda suíte, **opt-in**, que roda contra o **Spring de verdade** em :8080.

- **Por que existe:** testes unitários com transporte dublê provam que o BFF se
  comporta como esperado *dado* um contrato — não provam que a API ainda cumpre
  esse contrato. Toda divergência cara desta fase (401 virando 403, 204 sem
  corpo, `errors` por campo) só apareceria aqui.
- **Fora do `pnpm test`** de propósito: backend desligado não pode deixar a
  suíte unitária vermelha. Config próprio (`vitest.smoke.config.ts`), rodado
  com **`pnpm test:smoke`**.
- Usa o admin semeado do perfil dev (`admin@bookland.com` / `admin1234`).
- Cobre hoje: busca com query params, 401 `problem+json`, validação por campo,
  e o ciclo login → GET autenticado → logout 204.

## Convenções

- Arquivos `*.test.ts(x)` co-localizados com o código (`src/lib/api/errors.test.ts`).
- **Sem rede real na suíte unitária** — e sem `globalThis.fetch = vi.fn()`:
  stubar via **MSW**.
- Ambiente: `node` para `src/lib/**`; `jsdom` só nos testes de componente.
- Scripts: `pnpm test` (watch), `pnpm test:run` (CI/one-shot),
  `pnpm test:coverage`, `pnpm test:smoke` (exige backend no ar).

## Plano de adoção

1. ✅ **Feito (2026-07-28):** `vitest` + `@vitest/coverage-v8` + `msw`,
   `vitest.config.ts` e scripts. **40 testes** cobrindo `url`/`errors`/`client`,
   mais 5 de contrato ao vivo.
2. ⏳ `@testing-library/react` + `jsdom` quando nascer o primeiro componente
   (projeto jsdom separado, para não pagar DOM em toda a suíte).
3. Testes de componente conforme `BookCard`/`StatusBadge` nascerem.
4. Playwright numa fase posterior para o fluxo E2E.
