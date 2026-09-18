# 🚧 KRLoc — locação de equipamentos

Backend da locadora de equipamentos para canteiro de obras. Gerencia **equipamentos, acessórios,
clientes, locatários, contratos, fechamento financeiro e geração de documentos `.docx`**.

Do ponto de vista do ecossistema, é uma **Relying Party** do [SSO](https://github.com/PedroLucasLopes/sso-api-v1). Não tem cadastro de
usuário nem tela de login própria: toda a autenticação vem da biblioteca
[`@pedrolucaslopes/sso-client`](https://github.com/PedroLucasLopes/sso-lib-v1/blob/main/CLAUDE.md).

O `README.md` descreve a visão de produto. Este arquivo descreve **como o código está hoje**. A
revisão de segurança, com nota e vetor CVSS de cada achado, está em [`PENTEST.md`](PENTEST.md).

---

## ⚡ Stack

- **NestJS 11** (Express) · TypeScript 5.7 · CommonJS
- **Prisma 7** com `prisma-client` generator → `generated/prisma` (adapter `@prisma/adapter-pg`)
- **PostgreSQL**. **Não há Redis.**
- **`@pedrolucaslopes/sso-client`** para OAuth, sessão e RBAC
- `@nestjs/axios` para a API de CEP · `docx` para documentos · `csv-parser` + `multer` para importação
- `class-validator` + `class-transformer` nos DTOs

---

## 🏃 Comandos

```bash
npm run start:dev
npm run build
npm run lint
npm run test:sso        # ponta a ponta contra a stack de pé, 94 asserções
npx jest                # unidade: contrato de erro, validação por campo e filtros do Prisma
npx prisma migrate dev
```

Porta padrão: `PORT` ou **3000**. Prefixo global: **`/api`**.

### Onde o navegador enxerga esta aplicação

O front é o [`plataforma_krloc-v1`](https://github.com/PedroLucasLopes/plataforma_krloc-v1), um repositório
próprio. Ele roda em **`http://localhost:5174`** e proxia `/api` para o container em `:3000`. Front e API
na mesma origem: sem CORS, e o `SameSite=Strict` dos cookies vale sem ressalva. Por isso
`APP_BASE_URL` é o endereço do **front**, não o do container: é dele que sai a `redirect_uri`
registrada no SSO.

```
navegador -> localhost:5174/api/accessory   (front, proxy do Vite)
          -> localhost:3000/api/accessory   (este container)
```

O teste faz o papel do proxy, reescrevendo a origem quando segue um `Location`. A configuração dele
mora em `.env.test`, dentro deste projeto. Ver `.env.test.example`.

> ⚠️ **`npm install` roda aqui, e exige `NODE_AUTH_TOKEN`.** `@pedrolucaslopes/sso-client` vem do
> GitHub Packages, que pede token clássico com `read:packages` até para instalar. O `.npmrc` deste
> projeto só diz onde buscar; o token vem do ambiente, e no Docker entra como secret do BuildKit.
> Nada aqui depende de pasta vizinha.

Em container, `docker compose up -d --build` na raiz deste repositório, no mesmo terminal com
`NODE_AUTH_TOKEN`. O compose sobe só o krloc e as migrations, com a configuração em `.env.docker`, e
chega ao SSO pela porta da máquina: `SSO_INTERNAL_URL=http://host.docker.internal:8080/sso`. Não há
ordem de subida; o SSO só precisa estar de pé quando alguém for logar.

---

## 📁 Estrutura

```bash
💻 src/
├─ 🧩 global/
│  ├─ address/        # ZipcodeService (ViaCEP) + AddressValidator
│  ├─ dto/            # PaginationDTO, Health
│  ├─ error/          # contrato de erro (apiError.ts), recusa da validação e filtros do Prisma
│  ├─ interceptors/   # PerformanceInterceptor
│  ├─ prisma/  types/  utils/  validators/
└─ 🔐 routes/
   └─ accessory/ client/ document/ elease/ equipment/ file/ finantial/ lessee/
```

Convenção: `routes/<dominio>/{controller,dto,service}` em **minúsculas**. (O `sso` usa maiúscula
inicial; divergência histórica, não unifique sem combinar.)

**Não existe mais `routes/auth/`, `global/guard/` nem `global/redis/`.** Tudo isso virou a
biblioteca. Se precisar mudar comportamento de autenticação, o lugar é `sso-client`.

---

## 🗄️ Modelo de domínio

```
Client ──< Lessee ──< ELease ──< LeaseItem >── Equipment >── EquipmentAccessory ── Accessory
                          ├──< LeaseItemAccessory ── Accessory
                          └──< AuditLog
```

| Model | Papel |
|---|---|
| `Client` | dono do contrato · `tax_id` único · endereço validado por CEP |
| `Lessee` | locatário (obra) pertencente a um `Client` · 1 Client : N Lessees |
| `Equipment` | máquina · `code` normalizado com prefixo `KR` + `suffix` autoincrement |
| `Accessory` | item avulso associável a equipamentos (`EquipmentAccessory`, PK composta) |
| `ELease` | o contrato |
| `LeaseItem` | **snapshot imutável** do equipamento no momento da locação |
| `LeaseItemAccessory` | snapshot dos acessórios |
| `AuditLog` | trilha do contrato (`AuditAction` + `metadata` JSON) |

`LeaseItem` é o coração do faturamento: os preços são **congelados** na criação, então mexer na
tabela de preços do `Equipment` não reescreve contrato já emitido.

Enums: `StatusEquipment` (AVAILABLE · LEASED · MAINTENANCE · RETIRED · STOLEN · PENDING · REPLACE),
`LeaseStatus` (PENDING · ACTIVE · COMPLETED · CANCELLED), `AuditAction`.

---

## 🔄 Ciclo de vida do contrato

```
            createELease            startContract           closeContract
   (nada) ─────────────► PENDING ──────────────► ACTIVE ──────────────► COMPLETED
                            │                       │
                            └─── cancelContract ────┴──────► CANCELLED
```

Regras que `ELeaseService` (~1000 linhas) garante:

- **Criação** aceita só equipamentos `AVAILABLE`. Dentro de `$transaction` cria o `ELease`, move os
  equipamentos para `PENDING`, grava `LeaseItem` + `LeaseItemAccessory` e o `AuditLog`. O
  `updateMany` condicionado ao status é a trava contra reserva concorrente.
- **Início** leva `PENDING → ACTIVE`; equipamentos vão para `LEASED`.
- **Cancelamento** só em `PENDING` e com todo equipamento ainda `PENDING`: os equipamentos voltam a
  `AVAILABLE`, fora do contrato, e os itens fecham.
- **Volta** (`PUT /elease/status`) aceita equipamento `LEASED` ou `REPLACE` ligado ao **próprio**
  contrato. `AVAILABLE` solta do contrato; `MAINTENANCE` e `STOLEN` continuam ligados e podem ganhar
  substituto (`PUT /elease/replace`), que entra `REPLACE` e registra volta como qualquer outro.
- **Fechamento** só passa se nenhum `LeaseItem` estiver sem `finishDate`/`finalStatus` ou marcado
  `STOLEN`; caso contrário devolve 400 com a lista de pendências. Ao fechar, o equipamento que ainda
  aponta para o contrato (o que voltou para manutenção sem substituto) sai dele sem mudar de
  situação, e o `AuditLog` registra quais.
- Toda transição relevante grava `AuditLog`.

Cálculo financeiro (`FinantialService`): faixas decrescentes 30 / 15 / 7 / 1 dias sobre
`p_monthly`, `p_biweekly`, `p_weekly`, `p_diary`, ignorando itens substituídos.

---

## 🔑 Autenticação

Uma linha no `app.module.ts`, que lê as variáveis da tabela mais abaixo:

```ts
SsoClientModule.forRootFromEnv()
```

Isso instala `/api/auth/login`, `/api/auth/callback`, `/api/auth/token`, `/api/auth/logout`,
`/api/auth/me`, o `cookie-parser` e um **guard global que fecha por padrão**. Rota nova nasce
protegida. O `main.ts` não registra `cookie-parser`: a biblioteca registra. Variável obrigatória
faltando derruba o boot com a lista do que falta.

| Decorator | Efeito |
|---|---|
| `@SsoPublic()` | ignora sessão e RBAC (health check) |
| `@SsoAuthenticated()` | exige sessão, dispensa permissão por rota |
| _(nenhum)_ | exige sessão **e** permissão correspondente; sem ela, 404 como rota inexistente |
| `@CurrentUser()` | injeta a identidade no handler |
| `@CurrentToken()` | injeta o access token verificado |

Quem entra por cookie chega ao controller **com o `Authorization: Bearer` preenchido**: o guard
hidrata o header depois de verificar o token. O código de domínio não distingue os dois caminhos.

⚠️ **Quem escreve autenticado por cookie precisa do header `X-CSRF-Token`.** O valor sai de
`GET /api/auth/me`, que também devolve `csrfCookieName`, ou do cookie `krloc_csrf`. `GET`, `HEAD` e `OPTIONS` passam sem ele, e
quem manda `Authorization: Bearer` também: o navegador nunca anexa Bearer sozinho. O detalhe está
no [`CLAUDE.md` da biblioteca](https://github.com/PedroLucasLopes/sso-lib-v1/blob/main/CLAUDE.md).

⚠️ **Sessão morta não devolve 401 seco.** Navegação de página vira `302` para `/api/auth/login` com
o `returnTo` da própria URL. Chamada de API devolve `401` com `error: "login_required"` e o
`login_url` pronto, e o `returnTo` sai do `Referer`, que é a tela do front onde a pessoa estava.
O front só precisa de:

```js
if (res.status === 401) {
  const { error, login_url } = await res.json();
  if (error === 'login_required') location.assign(login_url);
}
```

### ⚠️ Permissões vivem no SSO, não aqui

Não há tabela de permissão local, nem manifesto. Para uma rota nova responder é preciso, **no console
do SSO**: cadastrar a `Route` no projeto do krloc, marcá-la para um papel, e o usuário ter esse papel no
projeto. Papel tem nome livre, como `ARQUITETO`; os quatro padrão nascem vazios.

Rota que existe aqui mas não está no catálogo do SSO, ou não está no papel de quem pediu, responde
**404**, o mesmo corpo de um caminho que não existe (a partir do `@pedrolucaslopes/sso-client` 0.2.0).
Permissão concedida vale na requisição seguinte, sem novo login; revogada, em até 30 segundos. Troca de
papel, remoção do projeto, projeto suspenso e logout valem em até 30 segundos, sem novo login: o
`sso-client` 0.4.0 pergunta ao SSO pela introspecção (RFC 7662) se o grant vale e qual é o papel de
agora. Papel trocado já sai com token novo na mesma resposta; grant inativo derruba a sessão. A janela
é `APP_GRANT_CHECK_SECONDS`, e `/api/auth/me` pergunta a cada chamada, que é como a tela descobre.

O `test:sso` não depende do catálogo real: cria um papel próprio só com as rotas que usa, cadastra a
rota que faltar e desfaz tudo no fim, inclusive quando quebra no meio.

---

## 🧭 Superfície de rotas (prefixo `/api`)

| Rota | Verbos | Observações |
|---|---|---|
| `/api/health` | GET | `@SsoPublic()`, healthcheck do container |
| `/api/auth/*` | GET · POST | instaladas pela biblioteca. O `callback` devolve documento, não `302` |
| `/api/home` | GET | `@SsoAuthenticated()`, devolve o estado da sessão para o front |
| `/api/equipment` | GET · GET/:id · POST · POST/upload · PUT/:id · DELETE/:id | delete = soft (`RETIRED`) |
| `/api/accessory` | GET · GET/:id · POST · POST/upload · POST/associate · PUT/:id · DELETE/:id | |
| `/api/client` | GET · GET/:id · POST · PUT/:id · DELETE/:id | valida CEP e CPF/CNPJ |
| `/api/lessee` | GET · GET/:id · GET/lesseesbyclient/:clientId · POST · PUT/:id · DELETE/:id | |
| `/api/elease` | GET · GET/:id · POST · POST/{start,close,cancel}/:id · PUT/{add,remove,status,replace}/:id | |
| `/api/generate` | POST/{contract,finantial,closure}/:id | devolve `.docx` |
| `/api/finantial/:id` | GET | ⚠️ só faz `console.log`, retorna `void` |

---

## ⚙️ Variáveis de ambiente

Modelo comentado em [`.env.example`](.env.example). Copie para `.env.docker` (container) ou `.env`
(`npm run start:dev`).

| Chave | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL do domínio do krloc. O SSO não o alcança |
| `SSO_ISSUER` | identidade pública do SSO, a mesma string da claim `iss` |
| `SSO_INTERNAL_URL` | endereço do SSO visto de dentro do container. No compose, `http://host.docker.internal:8080/sso` |
| `APP_CLIENT_ID` | `Project.clientId` cadastrado no SSO |
| `APP_PRIVATE_KEY_BASE64` | chave privada da aplicação, gerada pelo SSO |
| `APP_BASE_URL` | base pública **vista pelo navegador**: o front. O callback é `${APP_BASE_URL}/auth/callback` |
| `APP_POST_LOGIN_REDIRECT` | destino do login sem `returnTo`. `/` é a home do front |
| `APP_LOGIN_ERROR_REDIRECT` | tela pública do front para login recusado: `/sign-in-error`. Sem ela, quem o SSO recusa, como conta sem papel no projeto, recebe JSON no callback |
| `APP_COOKIE_PREFIX` | prefixo dos cookies: `krloc_session`. Único por app que divida host |
| `COOKIE_SECRET` | 32 bytes hex que cifram os cookies **deste** app |
| `COOKIE_SECURE` · `COOKIE_SAMESITE` | atributos dos cookies. `strict` é o padrão |
| `ZIPCODE_API_URL` | ViaCEP. O CEP é reduzido a oito dígitos antes de entrar na URL |
| `TRUST_PROXY` | quantos saltos de proxy confiar no `X-Forwarded-For`. Sem ela, o limite de requisições conta todo mundo como o proxy do front |
| `APP_GRANT_CHECK_SECONDS` | opcional. De quanto em quanto tempo o guard pergunta ao SSO se o grant de um token vale. Padrão 30 |

### Por que duas destas ainda vêm do ambiente

A regra do ecossistema é que o que está no banco do SSO não se repete no `.env`. Duas linhas fogem
disso, e cada uma por uma razão técnica, não por conveniência:

- **`APP_CLIENT_ID`** é o identificador **público** do cliente (RFC 6749 §2.2). Existe como
  `Project.clientId` no banco do SSO, mas é com ele que esta aplicação se identifica **antes** de
  poder perguntar qualquer coisa. Buscá-lo do SSO exigiria já saber qual registro buscar.
- **`APP_PRIVATE_KEY_BASE64`** é a metade privada do par de `private_key_jwt`. O SSO guarda só a
  metade pública, em `ClientKey`. Se guardasse esta, um dump do banco permitiria personificar toda
  aplicação registrada, e a autenticação de cliente deixaria de provar coisa alguma.

`COOKIE_SECRET` é diferente da do SSO de propósito: cada domínio cifra o próprio estado.
`APP_BASE_URL` é fato de deploy, não de catálogo: só esta aplicação sabe onde ela está acessível.

---

## 🧱 Convenções

- **Controller** só orquestra; regra de negócio no service.
- **DTOs**: `create<X>` · `edit<X>` = `PartialType(Create<X>)` · `filter<X>` estende `PaginationDTO`.
- `findAll` lança `ApiException('no_results')` com lista vazia (padrão do projeto; o front a trata
  como lista vazia).
- **Erro é código do catálogo**, `throw new ApiException('<codigo>')`, nunca frase solta em exception
  do Nest. Ver "Contrato de erro".
- Operações multi-tabela em `$transaction`.
- Uploads: `FileInterceptor('file')` + `FileSizeValidationPipe` + `memoryStorage` com `limits`.
  O teto de 2 MB vale no multer, **antes** de o arquivo ser lido inteiro na memória (o pipe sozinho só
  recusava depois); o pipe confere extensão `.csv` e tipo declarado. Os valores moram em
  `routes/file/file.constant.ts`.
- ⚠️ O arquivo do filtro de validação se chama `prismacientvalidationerror.exception.ts` (typo herdado).

---

## 🚫 Contrato de erro

Todo erro da aplicação sai com o código no campo `error`:

```json
{ "statusCode": 404, "error": "equipment_not_found", "message": "Equipment not found" }
```

- **O código é o contrato; o texto é do front.** O `plataforma_krloc-v1` escolhe a frase pelo código,
  na língua da tela, e **nunca mostra `message`**. Ele é para quem lê a resposta crua, como o `detail`
  da RFC 9457 §3.1.4, e não carrega valor da requisição nem detalhe interno.
- **O catálogo é `global/error/apiError.ts`**: código, status e texto de desenvolvedor, num lugar só.
  Código novo entra ali, no `constants/messages.ts` do front e nos JSON de tradução dele. Renomear ou
  tirar um quebra o front, que passa a mostrar a mensagem genérica do status.
- **Valor que a tela precisa vai num membro próprio**, nunca no texto (RFC 9457 §3.2): `status` em
  `contract_in_state`, `from` e `to` em `replace_type_mismatch`, `equipment` em `replace_same_unit`,
  `value` em `address_mismatch` e `equipments` em `contract_items_out`, só com código e sufixo.
- **Validação de DTO** sai `validation_failed`, com `fields: [{ field, error, message }]`. O código do
  campo vem do `context` da regra, como `@Matches(..., { context: { code: 'phone_invalid' } })`; regra sem
  código sai `invalid_value`, e o front mostra a recusa genérica.
- **Erro do Prisma** vira `duplicate` (409), `validation_failed` (400) ou `internal_error` (500). A mensagem
  dele traz a consulta, com nomes do schema e valores gravados, e fica no log: do erro conhecido, só o
  código e o alvo. Os dois filtros são globais, em `app.module.ts`.
- **O que o framework responde sozinho fica como o Nest escreve**: o 404 de caminho que não existe, que
  o `sso-client` imita para rota negada, o 413 do upload e o 429 do limite de requisições. O front os
  reconhece pelo status.
- **O `sso-client` usa o mesmo campo**, a partir da 0.5.0, para `csrf_token_invalid`,
  `origin_not_allowed`, `invalid_token` e `login_required`.

Com o catálogo, o status passou a acompanhar o código. Mudaram: `client_has_lessees`, de 404 para 409;
o contrato que não existe na geração de documento, de 406 para 404; cliente ou obra que não existe,
referidos no corpo, de 400 para 404; contrato que não está pendente, ao pôr ou tirar equipamento, de
404 para 400; e o arquivo ausente, de 404 para 400, como o pipe do upload já respondia.

---

## 🚨 Pontos de atenção conhecidos

1. `FinantialService.equipmentCurrentValue` calcula e faz `console.log`. Retorna `void`, nada chega
   ao cliente.
2. `DocumentService.generateFinantialReport`: `if (contract.leaseItems && !contract.leaseItems)` é
   sempre falso, então a validação de "sem movimentação no período" nunca dispara.
3. `Content-Disposition` dos três documentos usa `filename="contrato.docx"` fixo no fallback ASCII,
   inclusive para relatório e fechamento.
4. `PaginationConfig`: `numberFormatter(1, 10, limit)` dá **piso 10** e **teto ilimitado**.
5. `ELeaseService.findAll` filtra `lesseeId` com `contains`/`insensitive` sobre um UUID.
6. Limite de requisições por origem: 600/min geral e 30/min nas duas rotas de importação.
7. `FormatService` lê o logo via `path.resolve(process.cwd(), ...)` em vez de `__dirname`, o que
   obriga o Dockerfile a copiar o asset para fora de `dist/`.
8. `start:prod` aponta para `node dist/main`, que não existe. O caminho certo é `dist/src/main`.
9. **Contrato com equipamento roubado não fecha.** `closeContract` recusa item `STOLEN`, a
   substituição não fecha o item roubado e não há fluxo de indenização. O `FinantialService` conta
   esse item até hoje, porque ele não tem `finishDate`.
10. **`PUT /elease/remove/:id` não confere se o equipamento é do contrato.** Com o id de um
    equipamento reservado em outro contrato responde 200: o `disconnect` não faz nada e o
    `updateMany` devolve o equipamento a `AVAILABLE` ainda ligado ao outro contrato. A trava de "só
    um equipamento" olha o total antes da remoção: tirar todos de uma vez deixa o contrato vazio.
11. `LeaseItemAccessory` não guarda de qual equipamento veio. Adicionar equipamento a contrato não
    fotografa os acessórios dele, e remover não tira.
12. `EquipmentService.equipmentIsRented` só trava `LEASED`: equipamento `PENDING` (reservado) ou
    `REPLACE` (substituto) pode ser editado, até de status, ou desativado com o contrato em curso.
13. `FilterClientDTO.email` tem `@IsEmail()`: a busca por e-mail só aceita o endereço completo,
    apesar do `contains` no service.
14. `PrismaExceptionFilter` responde 500 `internal_error` a todo erro conhecido do Prisma que não seja
    `P2002`. É o que chega quando um update condicionado ao status perde a corrida (start, cancel ou
    close concorrentes) e quando `DELETE /client/:id` recebe um id que não existe.

### ✅ Já corrigidos

- **O front reconhecia o erro pela frase.** Eram 55 textos exatos e 6 expressões regulares, e o texto
  desconhecido aparecia cru na tela. Agora todo erro sai com código (ver "Contrato de erro") e o front
  nunca mostra `message`. O filtro de validação do Prisma, que devolvia ao cliente a última linha da
  mensagem interna (``Argument `name` is missing.``), passou a responder `validation_failed` e a deixar o
  texto no log. Ver `PENTEST.md`, KR-10.
- **Bypass de autorização**: o guard antigo montava `new RegExp(req.path)` e testava a permissão
  contra ela. Um pedido a `/api/.*` casava com qualquer permissão. Há teste de regressão.
- **Segredo simétrico** trocado por verificação contra o JWKS do SSO.
- **Redis removido**; sessão em cookie cifrado.
- **`SsoAuthGuard`** que chamava `res.redirect()` e retornava `false`, causando "Cannot set headers
  after they are sent", deixou de existir.
- **Logout** era cosmético; agora revoga no SSO (RFC 7009).
- **Mudança feita no console do SSO levava até 15 minutos para valer aqui**, o tempo do access token.
  Papel trocado, pessoa tirada do projeto e logout agora valem em até 30 segundos, pela introspecção
  do `sso-client` 0.4.0, e o `test:sso` cobre a troca de papel nos dois sentidos.
- **`logout` exigia permissão RBAC** por não estar marcado.
- Dependências de runtime (`@prisma/*`, `@nestjs/mapped-types`) movidas para `dependencies`.
- Pacote npm `crypto` removido: era um placeholder que sombreava o módulo nativo.
- **`GET /accessory` ignorava filtro e página**: o controller estava sem `@Query()`.
- **Filtro de cliente por `taxId`** montava `taxId` em vez da coluna `tax_id` e respondia 500.
- **Endereço de cliente e obra**: `??` deixava a string vazia da base de CEP vencer o digitado, e a
  edição conferia o endereço contra o gravado, o que recusava toda troca de CEP com a rua nova. Agora
  a edição confere contra a base do CEP, novo ou atual, e só consulta a base quando o CEP muda ou
  chega campo de endereço. Trocar para CEP sem logradouro sem mandar a rua é recusado com
  `Address is required for this zipcode`.
- **`DELETE /lessee` nunca apagava** (comparava array com `null`). Apaga obra sem contrato; com
  qualquer contrato, até encerrado, recusa.
- **`PUT /lessee` com `clientId`** comparava o id da obra com o do cliente e recusava sempre. O
  cliente atual passa; só a troca de dono é recusada.
- **Cancelar recusava todo contrato com equipamento.** Agora só recusa quando algum equipamento já
  não está `PENDING`.
- **Substituto não registrava volta**, e contrato com substituição nunca fechava. A volta aceita
  `LEASED` e `REPLACE`, exige equipamento do próprio contrato e valida o status de cada item: sem
  `@ValidateNested`, `LEASED` passava como volta e soltava o equipamento sem devolvê-lo.
- **`closeContract` não soltava nada**: desconectava ids de `LeaseItem`, de uma lista que fica vazia
  quando o fechamento passa. Agora solta o que ainda aponta para o contrato, sem mudar a situação.

---

## ✅ Invariantes ao alterar

- Preço de contrato **nunca** vem do `Equipment`: use o snapshot em `LeaseItem`.
- Erro sai com código do catálogo `global/error/apiError.ts`. `message` não leva valor da requisição nem
  detalhe interno; valor que a tela mostra vai em membro próprio.
- Transição de status acontece em `$transaction`, junto do `AuditLog`.
- Equipamento só entra em contrato se `AVAILABLE`, com `updateMany` condicionado ao status.
- `deleteEquipment` é **soft delete** (`RETIRED`).
- Endereço de cliente e obra sai de `zipcodeAddress`: a base de CEP vence, o que ela deixa vazio vem
  do corpo (`||`, nunca `??`), e a conferência é contra a base, nunca contra o endereço gravado.
- Operação de contrato sobre equipamento confere o `eleaseId` do próprio contrato, não só o status.
  O `remove` ainda não confere: ver o ponto de atenção 10.
- Rota nova exige `Route` + `Permission` no SSO, senão responde 404.
- O **refresh token** nunca chega ao navegador. O access token chega, e só por `GET /auth/token`
  (RFC 10017 §6.2.2.1). Os dois ficam no cookie de sessão, cifrado.
- Escrita autenticada por cookie exige o header `X-CSRF-Token`; quem manda `Authorization: Bearer`
  não precisa dele.
