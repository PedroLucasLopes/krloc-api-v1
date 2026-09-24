# 🚧 KRLoc — locação de equipamentos

Backend da locadora de equipamentos para canteiro de obras. Gerencia **equipamentos, acessórios,
clientes, locatários, contratos, fechamento financeiro e geração de documentos em PDF**.

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
- `@nestjs/axios` para a API de CEP · `pdfmake` para documentos · `csv-parser` + `multer` para importação
- `class-validator` + `class-transformer` nos DTOs

---

## 🏃 Comandos

```bash
npm run start:dev
npm run build
npm run lint
npm run test:sso        # ponta a ponta contra a stack de pé, 94 asserções
npx jest                # unidade: cobrança, contrato de erro, filtros do Prisma, e as regras de situação do equipamento e da associação de acessório
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

## 🚀 CI/CD

`.github/workflows/ci.yml`, no GitHub Actions:

| Quando | O que roda |
|---|---|
| pull request e push na `main` | `npm ci`, `npm audit` (produção sem aviso nenhum; o resto, sem alto), `prisma generate`, `lint:check`, build e testes de unidade |
| pull request | a imagem é montada, sem publicar |
| push na `main`, tag `v*` e à mão | as imagens da API e da migration vão para o GitHub Container Registry, `ghcr.io/pedrolucaslopes/krloc-api-v1` e `…-migrate`, com a tag do commit, `main` e a versão, proveniência e SBOM |

- **O pacote privado.** O `npm ci` e o build da imagem leem `@pedrolucaslopes/sso-client` com o
  `GITHUB_TOKEN` da execução, quando o pacote libera leitura a este repositório (nas configurações do
  pacote, "Manage Actions access"), ou com o secret `PACKAGES_READ_TOKEN`, um token clássico com
  `read:packages`. Sem um dos dois, o `npm ci` do pipeline responde 403.
- **`lint:check` é o lint sem `--fix`.** O `lint` do modelo do Nest corrige sozinho, e no pipeline isso
  esconderia o erro em vez de recusar.
- **O ponta a ponta fica na máquina.** `npm run test:sso` precisa do SSO de pé com o projeto KRLoc e a
  chave privada dele.
- **O pipeline é superfície de ataque.** Actions fixadas por commit, `permissions: {}` no topo e o
  mínimo por job, checkout sem credencial persistida, sem `pull_request_target`, e o token do npm como
  secret do BuildKit. O Dependabot (`.github/dependabot.yml`) abre pull request para as actions e a
  imagem base toda semana; o npm fica de fora, porque o pacote privado pede um token próprio dele.
- **O deploy no GCP ainda não existe.** A imagem publicada é o artefato. Subir para o Cloud Run entra
  quando houver o projeto no GCP e a federação de identidade das Actions, sem chave de conta de serviço
  guardada em secret.

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
                          │          └─ replacesItemId ─┘ ├──< EquipmentPrice
                          ├──< LeaseItemAccessory ── Accessory
                          └──< AuditLog
```

| Model | Papel |
|---|---|
| `Client` | dono do contrato · `tax_id` único · endereço validado por CEP |
| `Lessee` | locatário (obra) pertencente a um `Client` · 1 Client : N Lessees |
| `Equipment` | máquina · `code` normalizado com prefixo `KR` + `suffix` autoincrement |
| `EquipmentPrice` | histórico da tabela de preços: uma linha por mudança, com `validFrom`. Escrito pelo gatilho `equipment_price_history`, nunca pelo código |
| `Accessory` | item avulso associável a equipamentos (`EquipmentAccessory`, PK composta) |
| `ELease` | o contrato |
| `LeaseItem` | **snapshot imutável** do equipamento no momento da locação. `replacesItemId` liga o substituto ao item que ele substitui |
| `LeaseItemAccessory` | snapshot dos acessórios |
| `AuditLog` | trilha do contrato (`AuditAction` + `metadata` JSON). O fechamento grava o extrato |

`LeaseItem` é o coração do faturamento: os preços são **congelados** na criação, então mexer na
tabela de preços do `Equipment` não reescreve contrato já emitido. Prorrogação e dia excedente usam a
tabela **em vigor na data**, que sai do `EquipmentPrice`. Ver "Cobrança".

Enums: `StatusEquipment` (AVAILABLE · LEASED · MAINTENANCE · RETIRED · STOLEN · PENDING · REPLACE),
`LeaseStatus` (PENDING · ACTIVE · COMPLETED · CANCELLED), `AuditAction`.

### 🔧 Quem muda a situação do equipamento

Três donos, e nenhum invade o do outro:

| Situação | Quem grava |
|---|---|
| `AVAILABLE` · `MAINTENANCE` · `STOLEN` | o cadastro (`POST /equipment`, `PUT /equipment/:id`) e a volta do contrato |
| `PENDING` · `LEASED` · `REPLACE` | só o contrato, que muda o equipamento junto com o item dele. O cadastro recusa editar e desativar nessas três (`equipment_leased`) |
| `RETIRED` | a baixa, `DELETE /equipment/:id`. Desativado não se edita (`equipment_retired`) e só volta à frota por `POST /equipment/reactivate/:id`, que o devolve disponível |

**Desativar é baixa, não mais um estado do cadastro.** Sem o caminho separado de volta, bastava gravar
qualquer situação do cadastro para uma unidade baixada voltar a entrar em contrato — e, enquanto o
`EditEquipmentDto` herdou o padrão `AVAILABLE` do cadastro, bastava editar o nome dela.

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
  contrato, e grava `finishDate` em todas, roubo inclusive. `AVAILABLE` solta do contrato;
  `MAINTENANCE` e `STOLEN` continuam ligados e podem ganhar substituto (`PUT /elease/replace`), que
  entra `REPLACE`, começa no dia da troca e aponta para o item que substitui (`replacesItemId`). Item
  que já tem substituto não é trocado de novo; o substituto que quebrar, sim.
- **Início** grava no `AuditLog` o valor contratado de cada posição, o do documento assinado.
- **Fechamento** só passa se nenhum `LeaseItem` estiver sem `finishDate`/`finalStatus`; caso
  contrário devolve 400 com a lista de pendências. Roubado não trava mais: tem volta e indenização. Ao
  fechar, o equipamento que ainda aponta para o contrato (o que voltou para manutenção sem substituto)
  sai dele sem mudar de situação, e o `AuditLog` registra quais **e o extrato do fechamento**, que
  não muda depois: é o que a baixa e o fechamento do mês leem.
- Toda transição relevante grava `AuditLog`.

---

## 💰 Cobrança pelas cláusulas do contrato

**O contrato de locação é a regra.** O texto dele é um `DocumentTemplate` no banco (ver "Documentos
em PDF"), e o motor está em
`routes/finantial/billing/`, sem banco: `calendar.ts` (dias), `packages.ts` (pacotes), `rules.ts` (a
cobrança de uma posição) e `statement.ts` (o extrato). `billing.spec.ts` cobre cada caso. Todo valor
corre em centavos e sai em reais.

| Cláusula | O que a conta faz |
|---|---|
| 1ª, parágrafo segundo | **dias corridos da retirada à efetiva devolução de cada equipamento**, no dia de São Paulo, ao menos um |
| 7ª | preço do período pela tabela da assinatura: o snapshot do `LeaseItem` |
| 5ª | vencido o período, prorrogação por igual período pela tabela em vigor no vencimento |
| parágrafo único da 5ª | dias além do último período vencido a 10% do mensal atual; sem mensal, a diária |
| 6ª e 7ª | roubo soma a indenização pelo preço do dia do pagamento, o do fechamento |

- **Cada equipamento é cobrado até a própria volta.** Dentro do período contratado, o uso sai na
  combinação mais barata de diária, semana, quinzena e mês que cobre os dias (`cheapestCover`), e
  nunca passa do contratado. Quem devolve em um dia de um contrato de uma semana paga uma diária.
- **O valor contratado não é piso.** É o do período inteiro, o do documento e o do orçamento do
  contrato pendente (`quotePosition`), e o que a obra paga se ficar o prazo todo.
- **Posição** é o equipamento com os substitutos dele (`positionsOf`), cobrada como um aluguel só,
  da retirada do original à volta do último. Defeito ou roubo sem substituto encerram a posição no dia.
- **Acessório não entra na conta.** É contado por quantidade, não por unidade, e não há registro de
  acessório perdido ou quebrado. A 6ª e a 7ª preveem indenizá-lo; isso pede um fluxo de volta de
  acessório que ainda não existe.
- **Preço zero não é pacote.** A importação de planilha gravava célula vazia como `0`; pacote
  opcional `<= 0` fica de fora, e diária `<= 0` marca `missingPrice`, que a tela e o documento avisam.
- **O histórico de preços** é o `EquipmentPrice`, escrito pelo gatilho `equipment_price_history` a
  cada `INSERT` ou mudança de preço no `Equipment`, com `(now() AT TIME ZONE 'utc')`. A migration
  `20260918150000_billing_by_contract` criou o gatilho, preencheu uma linha por equipamento e ligou os
  substitutos já registrados pelo `AuditLog`.
- **Extrato congelado.** O de contrato concluído é o gravado no fechamento, em `CONTRACT_COMPLETED`;
  contrato fechado antes disso é calculado de novo.

⚠️ **Interpretação a confirmar.** Contrato de diária prorroga diária a diária, cada uma pela tabela do
dia (5ª). A leitura alternativa, todo dia além do primeiro a 10% do mensal, dá outro valor. O código
segue a primeira, e o teste "o exemplo do Pedro" a fixa.

| Rota | O que devolve |
|---|---|
| `GET /api/finantial/:id` | o extrato do contrato: pendente, o contratado; ativo, até hoje, como se tudo voltasse hoje; concluído, o gravado |
| `GET /api/finantial?month=AAAA-MM` | o fechamento do mês: fechados com o que cobrar, ativos no fim do mês com o que correu, frota na obra, manutenções e roubos |
| `POST /api/finantial/simulate` | a calculadora: equipamentos com a devolução e a ocorrência de cada um. Não grava nada |
| `POST /api/generate/finantial/:id` · `POST /api/generate/closure/:id` · `POST /api/generate/finantial` | extrato do contrato ativo, baixa do concluído (cláusula 10ª) e fechamento do mês, em PDF |

---

## 📄 Documentos em PDF

Contrato, extrato, baixa e fechamento do mês saem em **PDF** (`pdfmake`), e **o texto não mora no
código**: ele é um `DocumentTemplate` no banco, versionado.

| Peça | Onde mora |
|---|---|
| Ordem e texto do contrato | `DocumentTemplate` de `kind = CONTRACT`: uma lista ordenada de blocos |
| Razão social, CNPJ, endereço, telefone e logo | o `issuer` e o `logo` do mesmo registro |
| Nota de cálculo e assinaturas dos relatórios | `DocumentTemplate` de `kind = REPORT` |
| Layout: fonte, tabela, margem, cabeçalho e rodapé | `document/pdf/pdf.ts`, e só ele |
| Tabela de equipamentos, tabela de preços, ficha do locatário | blocos calculados: o modelo diz onde entram e com que rótulos, os dados vêm do contrato |

- **Bloco de texto** é `title`, `section`, `paragraph` ou `clause`; **bloco de dados** é `renter`,
  `items`, `prices` ou `signatures`. Cláusula nova é uma linha a mais na lista, sem deploy e sem
  editar TypeScript — antes eram 20 chamadas literais `text9(clausules.nineth)` numa ordem fixa.
- **Marcadores** dentro do texto: `{issuerName}`, `{issuerTaxId}`, `{issuerAddress}`, `{issuerPhone}`,
  `{issuerCity}`, `{contractId}`, `{start}`, `{end}`, `{total}` e `{today}`. Marcador desconhecido
  fica escrito como está, em vez de virar vazio silencioso.
- **Versão nova é `INSERT` com `version + 1`, nunca `UPDATE`.** O contrato guarda em
  `ELease.documentTemplateId` a versão com que foi gerado, e o documento refeito depois sai igual ao
  assinado. Antes, mudar o texto mudava contrato antigo sem avisar ninguém.
- **A cláusula que o motor de cobrança implementa é marcada** com `billingRule`: `usage`, `renewal`,
  `excess` e `indemnity`. Modelo que perca alguma é recusado com `document_template_invalid` (424).
  Sem essa trava, trocar "10%" por "15%" no texto deixaria o contrato e a fatura dizendo coisas
  diferentes, em silêncio. Mudança nessas quatro exige mexer no motor junto.
- **Sem modelo carregado**, a geração responde `document_template_missing` (424) e o resto da API
  continua de pé. O conteúdo de cada ambiente entra por um SQL rodado uma vez, fora de todo
  repositório, como o da primeira subida do SSO: os repositórios são públicos, e o texto do contrato,
  o CNPJ e o endereço da locadora são dados da empresa.
- **`GET /api/document/template/:kind`** mostra a versão em vigor, e `…/versions` lista o histórico.
  Escrever é pelo SQL, de propósito: mudar o contrato de locação não é um clique.
- O modelo fica em memória por 60 segundos, no `DocumentTemplateService`.
- O logo é PNG em base64 no próprio registro. Não há mais asset lido de `process.cwd()`, nem a linha
  no Dockerfile que copiava `src/global/assets` para fora de `dist/`.

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
| `/api/equipment` | GET · GET/:id · POST · POST/upload · POST/reactivate/:id · PUT/:id · DELETE/:id | delete = soft (`RETIRED`); reativar é o único caminho de volta |
| `/api/accessory` | GET · GET/:id · POST · POST/upload · POST/associate · PUT/:id · DELETE/:id | |
| `/api/client` | GET · GET/:id · POST · PUT/:id · DELETE/:id | valida CEP e CPF/CNPJ |
| `/api/lessee` | GET · GET/:id · GET/lesseesbyclient/:clientId · POST · PUT/:id · DELETE/:id | |
| `/api/elease` | GET · GET/:id · POST · POST/{start,close,cancel}/:id · PUT/{add,remove,status,replace}/:id | |
| `/api/generate` | POST/{contract,finantial,closure}/:id · POST/finantial | devolve PDF: contrato, extrato, baixa e fechamento do mês |
| `/api/document` | GET/template/:kind · GET/template/:kind/versions | o modelo em vigor e o histórico de versões. Ver "Documentos em PDF" |
| `/api/finantial` | GET (`?month=AAAA-MM`) · GET/:id · POST/simulate | fechamento do mês, extrato do contrato e calculadora. Ver "Cobrança" |

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

1. `PaginationConfig`: `numberFormatter(1, 10, limit)` dá **piso 10**, e o `MAX_LIMIT` corta em **500**.
2. `ELeaseService.findAll` filtra `lesseeId` com `contains`/`insensitive` sobre um UUID.
3. Limite de requisições por origem: 600/min geral e 30/min nas rotas caras (`HEAVY_ROUTE_LIMIT`):
   importação de planilha, fechamento do mês, calculadora e documentos.
4. `start:prod` aponta para `node dist/main`, que não existe. O caminho certo é `dist/src/main`.
5. **`PUT /elease/remove/:id` não confere se o equipamento é do contrato.** Com o id de um
   equipamento reservado em outro contrato responde 200: o `disconnect` não faz nada e o
   `updateMany` devolve o equipamento a `AVAILABLE` ainda ligado ao outro contrato. A trava de "só
   um equipamento" olha o total antes da remoção: tirar todos de uma vez deixa o contrato vazio.
6. `LeaseItemAccessory` não guarda de qual equipamento veio. Adicionar equipamento a contrato não
   fotografa os acessórios dele, e remover não tira.
7. `FilterClientDTO.email` tem `@IsEmail()`: a busca por e-mail só aceita o endereço completo,
   apesar do `contains` no service.
8. `PrismaExceptionFilter` responde 500 `internal_error` a todo erro conhecido do Prisma que não seja
   `P2002`. É o que chega quando um update condicionado ao status perde a corrida (start, cancel ou
   close concorrentes) e quando `DELETE /client/:id` recebe um id que não existe.
9. **Começar contrato antes da data de início** deixa o item com a retirada no dia previsto e a
    volta no dia real, antes dela. A conta cobra um dia, o mínimo, mas o documento mostra as duas
    datas como estão.
10. **Aviso de não prorrogação (5ª) não é registrado.** Contrato vencido e não devolvido conta como
    prorrogado. Dano por mau uso (8ª), que segue cobrando até o conserto, também não tem registro.

### ✅ Já corrigidos

- **Desativar não era baixa.** Equipamento `RETIRED` voltava à frota pela edição, como qualquer troca
  de situação. Agora o cadastro recusa editar desativado (`equipment_retired`) e a volta é
  `POST /equipment/reactivate/:id`, que só aceita quem está desativado (`equipment_not_retired`) e o
  devolve disponível, com o `updateMany` condicionado à situação. Ver "Quem muda a situação do
  equipamento".
- **Edição de equipamento sem `status` gravava `AVAILABLE`.** O `PartialType` herda os
  inicializadores da classe de origem, e o `ValidationPipe` roda com `transform: true`: o
  `status = AVAILABLE` do `CreateEquipmentDto` chegava ao `update` em toda edição que não mandasse a
  situação. Mexer no nome de uma unidade em manutenção a deixava disponível. O cadastro não tem mais
  padrão no DTO — quem dá o `AVAILABLE` de fábrica é o `@default` da coluna —, e há teste de
  regressão em `editEquipment.dto.spec.ts`.
- **Associar acessório aceitava qualquer unidade.** A trava de "só equipamento disponível" morava no
  `where` de um `findMany`, cujo retorno é sempre array: `if (!equipment)` nunca era verdade.
  Acessório entrava em unidade reservada, locada ou desativada, e saía para a obra sem estar em
  contrato nenhum — o contrato fotografa os acessórios quando reserva a unidade. Agora a situação é
  conferida de verdade (`equipment_unavailable`), o id repetido vale uma vez, e o `updateMany` do
  estoque confere quantas linhas mudou, contra duas associações levando a mesma última unidade.
- **Segunda rodada do pentest** (`PENTEST.md`, KR-11 a KR-16): contrato não nasce mais ativo ou
  concluído pelo corpo da requisição; datas de contrato e da calculadora têm limite, e o motor tem teto,
  porque um término em 9999 prendia a API inteira calculando; o cadastro de equipamento só grava
  disponível, manutenção e roubado, e equipamento reservado, locado ou substituto só muda pelo contrato;
  a importação de planilha só grava as colunas do cadastro; e as rotas caras têm limite de 30 por minuto.
- **O financeiro não existia.** `FinantialService` só fazia `console.log`, o relatório por período
  nunca validava nada, e contrato com equipamento roubado não fechava, sem volta nem indenização.
  Agora a cobrança segue as cláusulas do contrato (ver "Cobrança"), o roubo tem volta e indenização,
  e cada documento tem o próprio nome de arquivo no fallback ASCII.
- **O documento era código.** O texto do contrato morava em `document/utils/contract.json`, com as
  cláusulas sob chaves ordinais (`nineth`, `twelveth`), e a ordem delas era uma sequência literal de
  `text9(...)` no `FormatService`: cláusula nova exigia editar TypeScript e subir imagem. O CNPJ e o
  endereço da locadora estavam dentro do parágrafo de abertura, num repositório público, e o logo era
  lido de `process.cwd()`, o que obrigava o Dockerfile a copiar o asset para fora de `dist/`. Nada era
  congelado: um contrato regerado depois de uma mudança de texto saía diferente do assinado. Agora o
  modelo é dado, versionado e preso ao contrato. Ver "Documentos em PDF".
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

- Preço de contrato **nunca** vem do `Equipment` de agora: o do período sai do snapshot em
  `LeaseItem` (7ª), e o de prorrogação, excedente e indenização, do `EquipmentPrice` na data (5ª e 7ª).
- A conta é a do motor em `routes/finantial/billing/`, coberta pelo `billing.spec.ts`. Tela e
  documento só escrevem o que ele devolve.
- Data que chega do corpo tem limite (`global/validators/dateRange.validators.ts`): a conta percorre
  cada dia do período, no mesmo processo que atende todo o resto.
- Situação e data de fechamento de contrato não vêm do corpo; o cadastro de equipamento só grava
  `AVAILABLE`, `MAINTENANCE` e `STOLEN`. O resto é do ciclo do contrato.
- **DTO de edição não herda valor padrão.** `PartialType` copia os inicializadores da classe de
  origem, e com `transform: true` eles chegam ao `update` como se tivessem sido enviados. Campo que o
  servidor controla tem padrão na coluna, não no DTO.
- Desativado só volta por `POST /equipment/reactivate/:id`, e volta disponível. O cadastro não tira
  ninguém do desativado.
- Acessório só entra em equipamento `AVAILABLE`: depois de reservado, o contrato já fotografou os
  acessórios da unidade.
- DTO não declara campo que o servidor controla, e service não espalha linha de planilha no Prisma: o
  `whitelist` só barra o que o DTO não declara.
- Rota cara leva `@Throttle(HEAVY_ROUTE_LIMIT)`.
- Texto de documento é dado, não código: ele entra no `DocumentTemplate`, e o layout fica em
  `document/pdf/`. Cláusula com `billingRule` só muda junto do motor de cobrança.
- Erro sai com código do catálogo `global/error/apiError.ts`. `message` não leva valor da requisição nem
  detalhe interno; valor que a tela mostra vai em membro próprio.
- Transição de status acontece em `$transaction`, junto do `AuditLog`.
- Equipamento só entra em contrato se `AVAILABLE`, com `updateMany` condicionado ao status.
- `deleteEquipment` é **soft delete** (`RETIRED`).
- Endereço de cliente e obra sai de `zipcodeAddress`: a base de CEP vence, o que ela deixa vazio vem
  do corpo (`||`, nunca `??`), e a conferência é contra a base, nunca contra o endereço gravado.
- Operação de contrato sobre equipamento confere o `eleaseId` do próprio contrato, não só o status.
  O `remove` ainda não confere: ver o ponto de atenção 6.
- Rota nova exige `Route` + `Permission` no SSO, senão responde 404.
- O **refresh token** nunca chega ao navegador. O access token chega, e só por `GET /auth/token`
  (RFC 10017 §6.2.2.1). Os dois ficam no cookie de sessão, cifrado.
- Escrita autenticada por cookie exige o header `X-CSRF-Token`; quem manda `Authorization: Bearer`
  não precisa dele.
