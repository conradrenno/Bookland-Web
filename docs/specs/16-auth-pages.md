# 16 — Páginas de autenticação (`/login` e `/register`)

> Etapa 3 do front. Fecha US-01 e US-02 pelo lado da UI: o BFF já está pronto
> ([02-auth.md](02-auth.md)), falta a tela que fala com ele.
> Decisões tomadas com o dono em 2026-07-28.

## Escopo

**Dentro:** as duas páginas, um layout de auth enxuto, validação de formulário,
mapeamento de erro do BFF para a UI e testes de componente.

**Fora (fica para a etapa do catálogo):** `SiteHeader`/`SiteFooter`
([13](13-common_header.md)/[14](14-footer.md)) — o header depende de
`GET /categories` e `GET /cart`, que ainda não têm módulo em `lib/api/`. A
landing (`/`) segue sendo o boilerplate do create-next-app; será substituída pelo
catálogo.

## Decisões desta etapa

| Decisão | Escolha | Motivo |
|---|---|---|
| Stack de formulário | **react-hook-form + zod** (`@hookform/resolvers`) | Padrão dominante do ecossistema, que é o critério da [15](15-code-conventions.md). Erros por campo saem de graça, e é a mesma base para review/checkout/conta depois. |
| Renderização | **Client Component** (`"use client"`), chamando os route handlers | [07-ui-design.md](07-ui-design.md) classifica form de auth como ilha client. Server Action duplicaria os handlers que já existem e testamos. |
| Testes | **Vitest + jsdom + Testing Library** | Segundo projeto no Vitest; o projeto `node` atual continua sem pagar jsdom. |

## Rotas e arquivos

```
app/(auth)/layout.tsx        moldura das duas telas (route group: não vira URL)
app/(auth)/login/page.tsx    Server Component: guarda "já logado" + <LoginForm/>
app/(auth)/register/page.tsx idem, com <RegisterForm/>
components/auth/login-form.tsx     "use client"
components/auth/register-form.tsx  "use client"
components/auth/auth-card.tsx      casca visual comum (título, subtítulo, rodapé)
components/auth/form-alert.tsx     banner de erro do formulário (role="alert")
components/auth/text-field.tsx     label + input + mensagem, com o ARIA num lugar só
lib/auth/next-path.ts        safeNextPath() / withNextParam() — puro
lib/api/error-messages.ts    code → mensagem pt-BR (puro)
lib/api/auth-client.ts       browser → route handlers do BFF (nunca vê token)
lib/forms/apply-api-error.ts aplica ApiErrorBody nos campos do RHF (puro)
```

`text-field.tsx` e `auth-client.ts` não estavam no plano original; nasceram para
não repetir, respectivamente, a fiação de `aria-describedby` em 6 campos e o
`fetch` + tratamento de resposta em 2 formulários.

Route group `(auth)` porque as duas telas compartilham moldura e **não** devem
herdar o header do storefront quando ele existir.

## Fluxo de login (US-02)

1. Página é Server Component: se `getCurrentUser()` já devolve usuário,
   `redirect(safeNextPath(next) ?? "/")` — quem tem sessão não vê tela de login.
2. Form client: `POST /api/auth/login` com `{ email, password }`,
   `credentials: "same-origin"` (default; o `Set-Cookie` httpOnly vem na resposta).
3. Sucesso → `router.replace(destino)` **e** `router.refresh()`.
   O `refresh()` não é enfeite: sem ele o Router Cache pode servir a versão
   deslogada da rota de destino, e a página renderizaria sem a sessão que acabou
   de nascer.
4. Falha → mapeamento da tabela abaixo.

### `?next=` — sanitizar é obrigatório

O middleware já monta `/login?next=<rota>`. Redirecionar para o valor cru é
**open redirect**: `?next=https://evil.tld` (ou `//evil.tld`, que o browser lê
como protocol-relative) levaria o usuário recém-autenticado para fora do site.

`safeNextPath(raw)` aceita **somente** string que começa com `/` e **não** com
`//` nem `/\`; qualquer outra coisa vira `null` → destino `/`. Função pura, com
teste próprio no projeto `node` — é a mesma classe de erro que
`isProtectedPath` já evita por prefixo.

Duas armadilhas que a implementação precisou cobrir e valem registro:

- **Caracteres de controle.** O browser remove `\t`/`\n` *antes* de interpretar a
  URL, então `/<TAB>/evil.tld` volta a ser `//evil.tld` depois de passar por uma
  checagem ingênua de barra inicial. São rejeitados na entrada.
- **Parâmetro repetido.** `?next=/cart&next=//evil.tld` chega ao Server Component
  como **array**. Ler só o primeiro item é exatamente como se contrabandeia um
  segundo valor; `resolveAfterAuthPath` recusa o array inteiro.

`withNextParam(path, next)` monta o link cruzado login ↔ registro carregando o
destino pendente — sem ele, quem foi barrado em `/cart` e resolveu criar conta
antes cairia na home no fim.

## Fluxo de registro (US-01)

`POST /api/auth/register` → **201** já autenticado (o upstream devolve o par de
tokens; não há passo de login separado). Redirecionamento idêntico ao do login.

### Regras de validação (zod)

Espelham o contrato — fonte: `RegisterRequest` no OpenAPI.

| Campo | Regra | Mensagem pt-BR |
|---|---|---|
| `name` | obrigatório, ≤ 255 | "Informe seu nome." |
| `email` | obrigatório, formato, ≤ 255 | "Informe um e-mail válido." |
| `password` | 8–72 chars **e** ≥ 1 dígito (`/\d/`) | "A senha precisa de 8 a 72 caracteres e ao menos um número." |
| `confirmPassword` | igual a `password` | "As senhas não coincidem." |

`confirmPassword` é **só do cliente** — não existe no contrato e não é enviado.
Serve para não criar conta com senha errada de digitação, já que não há
"esqueci minha senha" na API.

No **login** a senha valida apenas "obrigatória" — mas **não** pelo motivo de
compatibilidade que se costuma citar. Não há base legada aqui: o projeto não foi
a produção e as contas semeadas (`admin1234`) já satisfazem a regra atual.
Os motivos que sobrevivem a isso:

1. **A autoridade é o servidor.** O formulário não decide se uma credencial é
   válida — o 401 do Spring decide. Rejeitar no cliente só troca "senha
   incorreta" por uma mensagem diferente para o mesmo desfecho.
2. **Duplicar a política cria divergência.** Se o backend afrouxar ou apertar a
   regra, o `/login` continuaria barrando pelo critério velho — e o sintoma
   ("minha senha certa não passa") é difícil de rastrear.
3. Expor a política numa tela pública de login entrega de graça o formato das
   senhas válidas a quem estiver tentando adivinhar.

A regra de força vive **só no registro**, onde ela de fato é a autoridade do
cliente sobre o que vai ser criado.

## Erro do BFF → UI

Ramificar por **`code`**, nunca por mensagem ([15](15-code-conventions.md)).
Os handlers já respondem `ApiErrorBody` (`{ code, message, fieldErrors? }`).

| `code` (status) | Onde aparece | Texto |
|---|---|---|
| `INVALID_CREDENTIALS` (401) | **banner** do form | "E-mail ou senha incorretos." — genérico de propósito: dizer qual dos dois errou permite enumerar contas. |
| `EMAIL_ALREADY_EXISTS` (409) | **inline no campo e-mail** + foco nele | "Este e-mail já está cadastrado." + link para `/login`. Decisão registrada na [02](02-auth.md): o usuário precisa corrigir *aquele* campo. |
| `VALIDATION_ERROR` (400) | por campo, via `fieldErrors` | mensagem do servidor; chave desconhecida ou `PAYLOAD_LEVEL_ERROR_KEY` cai no banner. |
| `MALFORMED_REQUEST` (400) | banner | "Não foi possível enviar o formulário." (bug nosso, não do usuário) |
| `INTERNAL_ERROR` / 5xx / `UNKNOWN` | banner | "Estamos com um problema. Tente novamente." |
| `NETWORK_ERROR` / `TIMEOUT` | banner | "Não foi possível conectar. Verifique sua internet e tente novamente." |

`applyApiError(body, setError)` centraliza isso: devolve a mensagem de banner
(ou `null`) depois de distribuir o que era por campo. Puro → testável em `node`.

> **Nota:** o `fetch` do form nunca lança `ApiError` — ele fala com o **nosso**
> route handler, não com o Spring. O que chega é o JSON de `toResponseBody()`.
> `ApiError` continua vivendo só no server.

## UX, estados e acessibilidade

- Botão de submit com `disabled` + rótulo "Entrando…" / "Criando conta…" durante
  o envio (`isSubmitting` do RHF), para não enviar duas vezes.
- `<form noValidate>` — a validação é do zod; o balão nativo do browser é
  inconsistente entre navegadores e não é traduzível.
- `autoComplete`: `email`, `current-password` (login), `new-password` (registro).
  Sem isso o gerenciador de senhas não oferece salvar.
- Erro de campo com `aria-invalid` + `aria-describedby` apontando para o `<p>` do
  erro; banner com `role="alert"` para o leitor de tela anunciar.
- **Hint e erro não coexistem no mesmo campo.** A dica ("a senha precisa de…") e
  o erro dizem a mesma frase; mostrar as duas obriga o usuário a procurar a
  diferença entre elas. Enquanto há erro, só o erro aparece.
- Link cruzado no rodapé do card: login ↔ registro, preservando o `?next=`.
- Sem toast aqui: [07](07-ui-design.md) reserva toast para mutação de página
  inteira; erro de formulário fica no formulário.

## Estética (spec [11](11-style-brief.md))

Card centrado, `max-w-md`, fundo `--background`; título em serif (`font-serif`,
Fraunces) e um subtítulo curto em `--muted-foreground`. Sem gradiente, sem
glassmorphism. Tokens já existem no `globals.css` — nenhuma cor literal nova.

## Testes

Novo projeto Vitest `jsdom` para `*.test.tsx`; o projeto `node` atual segue
cobrindo `*.test.ts` (`src/lib/**`). Deps novas (dev): `jsdom`,
`@testing-library/react`, `@testing-library/user-event`,
`@testing-library/jest-dom`.

O `fetch` do formulário é interceptado pelo **MSW**, como todo o resto —
sem mock de `globalThis.fetch` ([10](10-testing.md)).

Casos que travam as regras acima:

- login: 401 `INVALID_CREDENTIALS` → banner genérico, **não** marca campo;
- registro: 409 `EMAIL_ALREADY_EXISTS` → erro no campo e-mail, sem banner;
- registro: senha sem dígito não chega a enviar requisição;
- `confirmPassword` diferente → erro inline, sem requisição;
- sucesso → `router.replace` com `next` sanitizado;
- `?next=//evil.tld` → destino vira `/` (`next-path.test.ts`, projeto node);
- `VALIDATION_ERROR` com `errors: { password: [...] }` → mensagem no campo certo;
- duplo clique no submit → uma requisição só.

## Fora de escopo, registrado

- "Esqueci minha senha": **a API não tem** endpoint de reset. Não inventar tela.
- Login social / OAuth: não existe no contrato.
- Rate limit / captcha: responsabilidade do backend; nada no contrato hoje.
