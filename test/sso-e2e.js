/* Teste ponta a ponta do krloc como aplicacao cliente do SSO.
 *
 * O login federado com o Google e substituido por uma AuthSession inserida
 * direto no banco do SSO mais o cookie de sessao cifrado com a COOKIE_SECRET
 * do servidor. O resto do caminho e real: redirect, PKCE, troca de code com
 * private_key_jwt, verificacao contra o JWKS e RBAC por rota. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
/* Do PACOTE, nunca do repositorio do SSO. Esta aplicacao e independente:
 * repositorio proprio, infraestrutura propria, ciclo de vida proprio. O
 * @pedrolucaslopes/sso-client ja e o contrato com o SSO, entao e ele que carrega as
 * ferramentas de teste, e elas viajam junto com qualquer aplicacao nova. */
const {
  ensureProjectUser,
  mintAdminToken,
  purgeTestUsers,
} = require('@pedrolucaslopes/sso-client/testing');

/* Raiz DESTA aplicacao. O teste nao sobe para o workspace. */
const APP_DIR = path.resolve(__dirname, '..');

/* Cada aplicacao e dona dos proprios segredos. O teste precisa de tres
 * fontes, e usa cada uma no papel certo. */
const readEnv = (file) => {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^\s*[A-Za-z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
};

/* Configuracao do teste, TODA dentro desta aplicacao.
 *
 * Este projeto nao le arquivo de outro repositorio. Ele se conecta a um SSO,
 * e para o teste de integracao precisa de duas credenciais de operador desse
 * SSO: a conexao do banco e a COOKIE_SECRET, que substituem o login federado
 * que nenhum teste automatizado consegue fazer.
 *
 * Elas moram em `krloc/.env.test`, ignorado pelo git, ou no ambiente. Quem
 * opera o SSO preenche uma vez. Ver `.env.test.example`.
 */
const env = {
  ...readEnv(path.join(APP_DIR, '.env.docker')),         // identidade do krloc
  ...readEnv(path.join(APP_DIR, '.env.test')),           // credenciais do SSO alvo
  ...process.env,
};

const faltando = [
  'APP_TEST_BASE_URL',
  'SSO_TEST_DATABASE_URL',
  'SSO_TEST_COOKIE_SECRET',
].filter(
  (chave) => !env[chave],
);

if (faltando.length) {
  console.error(
    `\nFaltam ${faltando.join(' e ')}.\n\n` +
      'Copie krloc/.env.test.example para krloc/.env.test e preencha com os\n' +
      'dados do SSO contra o qual este teste roda.\n',
  );
  process.exit(1);
}

/* A COOKIE_SECRET do SSO e diferente da do krloc de proposito: cada dominio
 * cifra o proprio estado. Selar o cookie de sessao do SSO com a chave errada
 * nao da erro, so manda o usuario para o login de novo. */
const SSO_COOKIE_SECRET = env.SSO_TEST_COOKIE_SECRET;

/* Os cookies desta aplicacao levam prefixo proprio. Cookie nao e isolado por
 * porta (RFC 6265 secao 8.5), entao sem isso duas aplicacoes em localhost
 * sobrescreveriam a sessao uma da outra. O nome e montado aqui do mesmo jeito
 * que a biblioteca monta. */
const PREFIXO =
  env.APP_COOKIE_PREFIX ||
  crypto.createHash('sha256').update(env.APP_CLIENT_ID).digest('hex').slice(0, 8);
const COOKIE_SESSAO = `${PREFIXO}_session`;
const COOKIE_TX = `${PREFIXO}_tx`;
const COOKIE_CSRF = `${PREFIXO}_csrf`;

// `host.docker.internal` e o alias do container; aqui roda na maquina.
const SSO_DB = env.SSO_TEST_DATABASE_URL.replace('host.docker.internal', '127.0.0.1');

const SSO = env.SSO_ISSUER.replace(/\/+$/, '');
/* Duas bases, porque o front e a API deixaram de ser a mesma coisa.
 *
 * `APP_PUBLICO` e o que o BACKEND acredita ser seu endereco publico: em
 * desenvolvimento, o front em :5174 proxiando /api. E dali que sai a
 * redirect_uri registrada no SSO, e e contra essa origem que o guard compara
 * o header `Origin`.
 *
 * `APP` e o transporte: o container em :3000, que e quem de fato atende. Este
 * teste faz o papel do proxy do front, reescrevendo a origem quando segue um
 * Location. Sem isso ele tentaria falar com um front que ainda nao existe.
 */
const APP_PUBLICO = env.APP_BASE_URL.replace(/\/+$/, '');
const APP_PUBLICO_ORIGEM = new URL(APP_PUBLICO).origin;
const APP = env.APP_TEST_BASE_URL.replace(/\/+$/, '');

/** Troca a origem publica pela do container, como o proxy do front faria. */
const comTransporte = (url) =>
  String(url).replace(APP_PUBLICO_ORIGEM, new URL(APP).origin);
/* As rotas administrativas do SSO exigem `Authorization: Bearer` de um
 * usuario com papel no projeto do proprio SSO. O objeto e preenchido no
 * preparo, depois de o token ser emitido. */
const admin = { 'content-type': 'application/json' };

const OPERADOR = 'e2e-krloc-operador@exemplo.com';

const db = new Client({ connectionString: SSO_DB });

/* O que a rodada criou no SSO e precisa sair no fim, por id e e-mail exatos. A
 * limpeza roda tambem quando a rodada quebra no meio: sem isso, um erro deixaria
 * o operador de teste com o papel raiz do SSO. */
const rodada = { emails: [OPERADOR], papelId: null, rotas: [] };

async function limparRodada() {
  const usuarios = await purgeTestUsers(db, rodada.emails);

  if (rodada.papelId) {
    await db.query('DELETE FROM "Permission" WHERE "roleId" = $1', [rodada.papelId]);
    await db.query('DELETE FROM "Role" WHERE id = $1', [rodada.papelId]);
  }

  if (rodada.rotas.length) {
    await db.query('DELETE FROM "Permission" WHERE "routeId" = ANY($1)', [rodada.rotas]);
    await db.query('DELETE FROM "Route" WHERE id = ANY($1)', [rodada.rotas]);
  }

  return usuarios;
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FALHA'} | ${name}${detail ? ` -> ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

/** Abre um cookie selado, para inspecionar e reescrever o que ha dentro. */
const openCookie = (key, token) => {
  const [iv, tag, ct] = token.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
};

const sealCookie = (key, obj) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
};

const readCookies = (res) =>
  (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');

const get = (url, cookie) =>
  fetch(url, { redirect: 'manual', headers: cookie ? { cookie } : {} });

/* Rota que o papel nao alcanca responde com o mesmo 404 de um caminho que nao
 * existe (RFC 9110 secao 15.5.4). Passar pelo RBAC e, entao, qualquer resposta
 * que nao seja 401, 403 nem esse 404: um controller sem dados tambem devolve
 * 404, mas com a mensagem dele. `caminho` vai sem o prefixo global. */
const negadoPeloGuard = async (res, method, caminho) =>
  res.status === 404 &&
  (await res.clone().json().catch(() => null))?.message ===
    `Cannot ${method} ${new URL(APP).pathname}${caminho}`;

const passouPeloRbac = async (res, method, caminho) =>
  res.status !== 401 && res.status !== 403 && !(await negadoPeloGuard(res, method, caminho));

(async () => {
  await db.connect();

  /* Credencial administrativa: um usuario do banco com o papel raiz do SSO, e
   * um token vindo do fluxo OAuth completo. A raiz nao depende do catalogo, e e
   * o que deixa o teste rodar num SSO recem-criado, onde os papeis padrao nascem
   * vazios. */
  await ensureProjectUser(db, { projectName: 'SSO', email: OPERADOR, name: 'E2E KRLoc', role: 'SUPERADMIN' });
  const operador = await mintAdminToken(db, {
    issuer: SSO, cookieSecret: SSO_COOKIE_SECRET, email: OPERADOR,
  });
  admin.authorization = `Bearer ${operador.token}`;

  const project = (
    await db.query(`SELECT id, status FROM "Project" WHERE "clientId" = $1`, [env.APP_CLIENT_ID || env.KRLOC_CLIENT_ID])
  ).rows[0];

  if (!project) throw new Error('projeto krloc nao encontrado no SSO');

  console.log('\n=== preparo ===');
  if (project.status !== 'ACTIVE') {
    const res = await fetch(`${SSO}/project/${project.id}/status`, {
      method: 'PATCH', headers: admin, body: JSON.stringify({ status: 'ACTIVE' }),
    });
    check('projeto ativado por administrador', res.ok, `HTTP ${res.status}`);
  } else {
    check('projeto ja esta ACTIVE', true);
  }

  const tag = crypto.randomBytes(4).toString('hex');

  const ssoApi = async (method, rota, body) => {
    const res = await fetch(`${SSO}${rota}`, {
      method, headers: admin, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  /* Papel desta rodada, com exatamente as rotas que o teste usa. Nao depende do
   * que o catalogo do krloc concede aos papeis padrao, que num SSO novo nascem
   * vazios. Rota que ja existe no catalogo e usada como esta; a que faltar, o
   * teste cadastra e apaga no fim. */
  const rotaDoKrloc = async (method, caminho) => {
    const existente = (await db.query(
      'SELECT id FROM "Route" WHERE "projectId" = $1 AND path = $2 AND method = $3::"Method"',
      [project.id, caminho, method],
    )).rows[0];

    if (existente) return existente.id;

    const criada = await ssoApi('POST', '/route', { projectId: project.id, path: caminho, method });

    if (criada.status !== 201) throw new Error(`o SSO nao cadastrou ${method} ${caminho}: HTTP ${criada.status}`);

    rodada.rotas.push(criada.json.id);
    return criada.json.id;
  };

  const PAPEL = `E2E_KRLOC_${tag.toUpperCase()}`;
  const papel = await ssoApi('POST', '/role', { projectId: project.id, name: PAPEL });
  rodada.papelId = papel.json?.id ?? null;
  check(`papel customizado ${PAPEL} criado no krloc`, papel.status === 201, `HTTP ${papel.status}`);

  const concede = async (method, caminho) => {
    const concedida = await ssoApi('POST', '/permission', {
      roleId: papel.json.id, routeId: await rotaDoKrloc(method, caminho),
    });

    if (concedida.status !== 201) throw new Error(`o SSO nao concedeu ${method} ${caminho}: HTTP ${concedida.status}`);
  };

  const CONCEDIDAS = [['GET', '/equipment'], ['GET', '/equipment/:id'], ['POST', '/equipment']];

  for (const [method, caminho] of CONCEDIDAS) await concede(method, caminho);

  rodada.emails.push(`krloc-${tag}@exemplo.com`);

  const user = await (
    await fetch(`${SSO}/user`, {
      method: 'POST', headers: admin,
      body: JSON.stringify({ name: `Teste ${tag}`, email: `krloc-${tag}@exemplo.com` }),
    })
  ).json();

  const vinculo = await ssoApi('POST', '/projectuser', { userId: user.id, projectId: project.id, roleId: papel.json.id });
  check(`usuario associado ao krloc com o papel ${PAPEL}`, vinculo.status === 201, `HTTP ${vinculo.status}`);

  const sessionId = crypto.randomUUID();
  /* `expiresAt` e TIMESTAMP sem fuso, e o Prisma grava e le essa coluna sempre
   * em UTC. O `now()` do Postgres devolve a hora local do servidor, que nesta
   * maquina esta em America/Sao_Paulo: a sessao nasceria tres horas no passado
   * e o servidor a descartaria como expirada. `AT TIME ZONE 'utc'` alinha o SQL
   * cru do teste com a convencao do Prisma. */
  await db.query(
    `INSERT INTO "AuthSession" (id, "userId", "expiresAt")
     VALUES ($1, $2, (now() AT TIME ZONE 'utc') + interval '1 hour')`,
    [sessionId, user.id],
  );
  const ssoCookie = `sso_session=${sealCookie(SSO_COOKIE_SECRET, { authSessionId: sessionId })}`;

  console.log('\n=== rotas sem sessao ===');
  const health = await get(`${APP}/health`);
  check('GET /health e publico', health.status === 200, `HTTP ${health.status}`);

  const denied = await get(`${APP}/equipment`);
  check('GET /equipment sem sessao devolve 401', denied.status === 401, `HTTP ${denied.status}`);

  console.log('\n=== login completo da aplicacao ===');
  const login = await get(`${APP}/auth/login`);
  const txCookie = readCookies(login);
  check('GET /auth/login redireciona ao SSO', login.status === 302 && login.headers.get('location')?.startsWith(SSO));
  check('cookie de transacao e HttpOnly', (login.headers.getSetCookie?.() ?? []).some((c) => /HttpOnly/i.test(c)));

  const authorizeUrl = new URL(login.headers.get('location'));
  check('authorize leva code_challenge_method=S256',
    authorizeUrl.searchParams.get('code_challenge_method') === 'S256');

  const authorized = await get(authorizeUrl.toString(), ssoCookie);
  const callbackUrl = authorized.headers.get('location');
  check('SSO emite o code para a redirect_uri do app',
    authorized.status === 302 && callbackUrl?.startsWith(`${APP_PUBLICO}/auth/callback`),
    `HTTP ${authorized.status}`);

  const callback = await get(comTransporte(callbackUrl), txCookie);
  let appCookie = readCookies(callback);
  /* O callback devolve um documento da PROPRIA origem, nao um 302. E o que
   * permite `SameSite=Strict` na sessao: o retorno do provedor federado e uma
   * cadeia de redirects que comeca em outro site, e um 302 dentro dela faria a
   * pagina de destino chegar sem cookie, com 401 e laco de login. Navegacao
   * iniciada por este documento e same-site, e aí o cookie vai. */
  const corpoCallback = await callback.clone().text();
  check('callback troca o code e cria a sessao', callback.status === 200, `HTTP ${callback.status}`);
  check('callback devolve documento da propria origem, nao 302',
    /http-equiv="refresh"/i.test(corpoCallback),
    callback.headers.get('content-type') ?? 'sem content-type');
  const destinoBounce = /url=([^"']+)/i.exec(corpoCallback)?.[1] ?? '';
  check('o bounce so aponta para a propria origem, nunca para outro site',
    destinoBounce.startsWith('/') || new URL(destinoBounce).origin === APP_PUBLICO_ORIGEM,
    destinoBounce);
  check('cookie de sessao do app foi emitido', appCookie.includes(COOKIE_SESSAO));

  const sessionCookies = (callback.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(COOKIE_SESSAO));
  check('cookie de sessao e HttpOnly', /HttpOnly/i.test(sessionCookies ?? ''));

  /* REGRESSAO. Cookie nao e isolado por porta (RFC 6265 secao 8.5): duas
   * aplicacoes em localhost dividem o mesmo pote. Com nome fixo, a segunda a
   * logar sobrescreveria a sessao da primeira, e o cookie anti-CSRF de uma
   * seria legivel pelo JavaScript da outra. */
  check('o cookie leva prefixo desta aplicacao, nao um nome generico',
    COOKIE_SESSAO !== 'app_session' && (sessionCookies ?? '').startsWith(COOKIE_SESSAO),
    COOKIE_SESSAO);
  check('nenhum token no cookie em claro',
    !/eyJ/.test(sessionCookies ?? ''), 'conteudo cifrado');

  // REGRESSAO. Navegador descarta cookie individual acima de 4096 bytes,
  // em silencio: sem erro, sem log, sem nada. O `fetch` deste teste NAO
  // aplica esse limite, entao ele passava enquanto nenhum navegador
  // conseguia logar. Aconteceu de verdade: a lista de permissoes dentro do
  // token levou o cookie a 4266 bytes.
  const valorCookie = (sessionCookies ?? '').split(';')[0].split('=').slice(1).join('=');
  check('cookie de sessao cabe no limite de 4096 bytes do navegador',
    valorCookie.length < 4096, `${valorCookie.length} bytes`);
  check('cookie com folga de pelo menos 25%',
    valorCookie.length < 3072, `${valorCookie.length} de 4096`);

  console.log('\n=== rotas com sessao ===');
  const me = await get(`${APP}/auth/me`, appCookie);
  const identity = me.ok ? await me.json() : null;
  check('GET /auth/me devolve a identidade', me.status === 200 && identity?.email === `krloc-${tag}@exemplo.com`,
    identity?.email ?? `HTTP ${me.status}`);
  check('as permissoes do papel chegaram ao app, e so elas',
    identity?.permissions?.length === CONCEDIDAS.length,
    `${identity?.permissions?.length ?? 0} permissoes`);

  const equipment = await get(`${APP}/equipment`, appCookie);
  check('GET /equipment com sessao passa pelo RBAC',
    await passouPeloRbac(equipment, 'GET', '/equipment'),
    `HTTP ${equipment.status} (404 do controller = sem dados, mas autorizado)`);

  const ZERO = '00000000-0000-4000-8000-000000000000';
  const byId = await get(`${APP}/equipment/${ZERO}`, appCookie);
  check('rota com :id casa com a permissao parametrizada',
    await passouPeloRbac(byId, 'GET', `/equipment/${ZERO}`), `HTTP ${byId.status}`);

  console.log('\n=== token entregue ao cliente (RFC 10017 secao 6.2.2.1) ===');
  const tokenRes = await get(`${APP}/auth/token`, appCookie);
  const grant = tokenRes.ok ? await tokenRes.json() : null;
  check('GET /auth/token devolve o access token', tokenRes.status === 200 && !!grant?.access_token,
    `HTTP ${tokenRes.status}`);
  check('token_type e Bearer', grant?.token_type === 'Bearer');
  check('expires_in em segundos, curto', typeof grant?.expires_in === 'number' && grant.expires_in <= 900,
    `${grant?.expires_in}s`);
  check('Cache-Control: no-store na entrega do token',
    tokenRes.headers.get('cache-control') === 'no-store', tokenRes.headers.get('cache-control'));
  // RFC 10017 secao 6.2.2.2: o refresh token NAO acompanha o access token.
  check('refresh_token NAO e entregue ao cliente', !('refresh_token' in (grant ?? {})));

  const bearer = { Authorization: `Bearer ${grant.access_token}` };

  console.log('\n=== Authorization: Bearer, sem cookie nenhum ===');
  const viaBearer = await fetch(`${APP}/equipment`, { headers: bearer, redirect: 'manual' });
  check('GET /equipment so com Bearer passa pelo RBAC',
    await passouPeloRbac(viaBearer, 'GET', '/equipment'),
    `HTTP ${viaBearer.status} (404 do controller = sem dados, mas autorizado)`);

  const meBearer = await fetch(`${APP}/auth/me`, { headers: bearer });
  const idBearer = meBearer.ok ? await meBearer.json() : null;
  check('identidade resolvida a partir do Bearer',
    idBearer?.email === `krloc-${tag}@exemplo.com`, idBearer?.email ?? `HTTP ${meBearer.status}`);

  const ruim = await fetch(`${APP}/equipment`, { headers: { Authorization: 'Bearer nao.e.um.jwt' } });
  check('Bearer invalido devolve 401', ruim.status === 401, `HTTP ${ruim.status}`);

  const semNada = await fetch(`${APP}/equipment`);
  check('sem cookie e sem Bearer devolve 401', semNada.status === 401, `HTTP ${semNada.status}`);

  console.log('\n=== sem permissao, a rota responde como se nao existisse (RFC 9110 secao 15.5.4) ===');

  /* `/accessory/:id` existe no codigo do krloc, mas o papel desta rodada nao a
   * alcanca: ou ela nao esta no catalogo do SSO, ou esta sem permissao para o
   * papel. Para quem nao pode usar, e indistinguivel de um caminho que nao
   * existe. Sem sessao continua 401, porque a pessoa precisa saber que tem de
   * entrar. */
  const negada = await get(`${APP}/accessory/${ZERO}`, appCookie);
  const corpoNegada = await negada.clone().json().catch(() => null);
  const inexistente = await get(`${APP}/nao-existe-${tag}`, appCookie);
  const corpoInexistente = await inexistente.json().catch(() => null);

  check('rota que o papel nao alcanca devolve 404', negada.status === 404, `HTTP ${negada.status}`);
  check('o 404 da rota negada e igual ao de um caminho que nao existe',
    (await negadoPeloGuard(negada, 'GET', `/accessory/${ZERO}`))
      && inexistente.status === 404
      && corpoInexistente?.message === `Cannot GET ${new URL(APP).pathname}/nao-existe-${tag}`
      && corpoNegada?.error === corpoInexistente?.error,
    `${corpoNegada?.message} | ${corpoInexistente?.message}`);
  check('o 404 da rota negada nao anuncia como se autentica',
    !negada.headers.get('www-authenticate'), negada.headers.get('www-authenticate') ?? 'sem WWW-Authenticate');

  const negadaPorBearer = await fetch(`${APP}/accessory/${ZERO}`, { headers: bearer });
  check('pelo Bearer, a rota negada tambem responde 404',
    await negadoPeloGuard(negadaPorBearer, 'GET', `/accessory/${ZERO}`), `HTTP ${negadaPorBearer.status}`);

  /* Concessao feita no SSO vale sem novo login: antes de negar, o guard pergunta
   * de novo ao SSO. Entre duas perguntas do mesmo papel ha ao menos 5 segundos,
   * entao o teste espera esse tanto antes de tentar. */
  await concede('GET', '/accessory/:id');
  await new Promise((resolve) => setTimeout(resolve, 5500));

  const recemConcedida = await get(`${APP}/accessory/${ZERO}`, appCookie);
  check('permissao concedida no SSO vale na requisicao seguinte, sem novo login',
    await passouPeloRbac(recemConcedida, 'GET', `/accessory/${ZERO}`), `HTTP ${recemConcedida.status}`);

  console.log('\n=== o guard hidrata o Authorization a partir da sessao ===');
  const homeCookie = await get(`${APP}/home`, appCookie);
  const sessaoCookie = homeCookie.ok ? await homeCookie.json() : null;
  check('GET /home so com cookie responde 200', homeCookie.status === 200, `HTTP ${homeCookie.status}`);
  check('o handler recebeu o access token', sessaoCookie?.tokenDisponivel === true);
  // Sem isto, quem se identificou por cookie chegaria ao controller sem
  // header, e o codigo de dominio teria de saber distinguir os dois casos.
  check('Authorization: Bearer chegou preenchido ao handler',
    sessaoCookie?.authorizationHeader === true);
  check('identidade correta na resposta', sessaoCookie?.user?.email === `krloc-${tag}@exemplo.com`,
    sessaoCookie?.user?.email);

  const homeBearer = await fetch(`${APP}/home`, { headers: bearer });
  const sessaoBearer = homeBearer.ok ? await homeBearer.json() : null;
  check('mesma resposta quando o cliente envia Bearer',
    sessaoBearer?.authorizationHeader === true && sessaoBearer?.tokenDisponivel === true,
    `HTTP ${homeBearer.status}`);
  check('os dois caminhos resolvem o mesmo usuario',
    sessaoBearer?.user?.id === sessaoCookie?.user?.id);

  console.log('\n=== CSRF: cookie sozinho nao basta para escrever (RFC 10017 6.2.3.2) ===');

  const csrf = (await (await get(`${APP}/auth/me`, appCookie)).json()).csrfToken;
  check('GET /auth/me entrega o token anti-CSRF', typeof csrf === 'string' && csrf.length >= 32,
    `${csrf?.length ?? 0} caracteres`);

  const csrfCookie = (callback.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith(`${COOKIE_CSRF}=`));
  check('o mesmo token chega num cookie legivel pelo front',
    csrfCookie === `${COOKIE_CSRF}=${csrf}`, csrfCookie ? 'app_csrf presente' : 'ausente');
  check('o cookie do token anti-CSRF NAO e HttpOnly, de proposito',
    (callback.headers.getSetCookie?.() ?? []).some(
      (c) => c.startsWith(`${COOKIE_CSRF}=`) && !/HttpOnly/i.test(c)));

  const escrever = (headers) =>
    fetch(`${APP}/equipment`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

  const semToken = await escrever({ cookie: appCookie });
  check('POST so com cookie, sem o header, devolve 403',
    semToken.status === 403, `HTTP ${semToken.status}`);

  const tokenErrado = await escrever({ cookie: appCookie, 'x-csrf-token': 'a'.repeat(csrf.length) });
  check('POST com token anti-CSRF errado devolve 403',
    tokenErrado.status === 403, `HTTP ${tokenErrado.status}`);

  const origemEstranha = await escrever({
    cookie: appCookie, 'x-csrf-token': csrf, origin: 'https://site-do-atacante.example',
  });
  check('Origin de outro site e recusado mesmo com o token certo',
    origemEstranha.status === 403, `HTTP ${origemEstranha.status}`);

  // 400 aqui significa que passou pelo guard e chegou a validacao do corpo, que
  // e exatamente o que se quer provar. O que nao pode e 401, 403 ou o 404 do guard.
  const comToken = await escrever({ cookie: appCookie, 'x-csrf-token': csrf, origin: APP_PUBLICO_ORIGEM });
  check('POST com cookie MAIS o header passa pelo guard',
    await passouPeloRbac(comToken, 'POST', '/equipment'), `HTTP ${comToken.status}`);

  const soBearer = await escrever({ authorization: `Bearer ${grant.access_token}` });
  check('Bearer dispensa o token anti-CSRF: o navegador nunca o anexa sozinho',
    await passouPeloRbac(soBearer, 'POST', '/equipment'), `HTTP ${soBearer.status}`);

  const leitura = await get(`${APP}/equipment`, appCookie);
  check('GET nao exige o header: metodo seguro nao muda estado',
    await passouPeloRbac(leitura, 'GET', '/equipment'), `HTTP ${leitura.status}`);

  console.log('\n=== refresh token vivo renova o access token morto, sem login ===');

  /* O cenario que importa: o access token venceu, o refresh token nao. Ninguem
   * deve ver tela de login. O teste envelhece o access token DENTRO do cookie,
   * sem tocar no refresh token, e confere que a requisicao seguinte passa. */
  const sessaoAtual = openCookie(env.COOKIE_SECRET, new RegExp(`${COOKIE_SESSAO}=([^;]+)`).exec(appCookie)[1]);

  const sessaoVencida = sealCookie(env.COOKIE_SECRET, {
    ...sessaoAtual,
    expiresAt: Math.floor(Date.now() / 1000) - 10,
  });
  const cookieVencido = appCookie.replace(new RegExp(`${COOKIE_SESSAO}=[^;]+`), `${COOKIE_SESSAO}=${sessaoVencida}`);

  const comTokenVencido = await get(`${APP}/equipment`, cookieVencido);
  check('access token vencido nao manda ninguem ao login',
    comTokenVencido.status !== 401 && comTokenVencido.status !== 302,
    `HTTP ${comTokenVencido.status}`);

  const reemitido = (comTokenVencido.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith(COOKIE_SESSAO));
  check('a resposta ja traz a sessao renovada', !!reemitido, reemitido ? 'app_session reescrito' : 'ausente');

  const sessaoNova = openCookie(env.COOKIE_SECRET, new RegExp(`${COOKIE_SESSAO}=([^;]+)`).exec(reemitido)[1]);
  check('o access token e outro, emitido na hora',
    sessaoNova.accessToken !== sessaoAtual.accessToken, 'token trocado');
  check('o refresh token rotacionou junto, como manda a RFC 9700 secao 4.14',
    sessaoNova.refreshToken !== sessaoAtual.refreshToken, 'familia avancou');
  check('a nova validade esta no futuro',
    sessaoNova.expiresAt > Math.floor(Date.now() / 1000), `${sessaoNova.expiresAt - Math.floor(Date.now() / 1000)}s`);
  check('o token anti-CSRF sobrevive a renovacao',
    sessaoNova.csrfToken === sessaoAtual.csrfToken, 'mesmo valor');

  /* O outro lado: refresh token morto tambem. Aí sim e login, e nao ha o que
   * fazer em silencio. */
  const tudoMorto = sealCookie(env.COOKIE_SECRET, {
    ...sessaoAtual,
    accessToken: sessaoAtual.accessToken,
    refreshToken: 'este-refresh-token-nao-existe-no-sso',
    expiresAt: Math.floor(Date.now() / 1000) - 10,
  });
  const semSaida = await fetch(`${APP}/equipment`, {
    headers: { cookie: `${COOKIE_SESSAO}=${tudoMorto}`, 'sec-fetch-dest': 'document', accept: 'text/html' },
    redirect: 'manual',
  });
  check('refresh token morto tambem: aí sim vai para o login',
    semSaida.status === 302 && (semSaida.headers.get('location') ?? '').includes('/auth/login'),
    `HTTP ${semSaida.status}`);

  // A renovacao trocou os tokens; segue com o cookie novo.
  appCookie = readCookies(comTokenVencido) || appCookie;

  console.log('\n=== sessao morta manda ao login e volta para onde a pessoa estava ===');

  /* O cenario: a pessoa esta em /accessories no front, o refresh token morre,
   * e a proxima chamada precisa relogar sem ela perder o lugar. */
  const TELA = `${APP_PUBLICO_ORIGEM}/accessories`;

  const chamadaDeApi = await fetch(`${APP}/equipment`, {
    headers: { referer: TELA, 'sec-fetch-dest': 'empty', accept: 'application/json' },
    redirect: 'manual',
  });
  const corpoApi = await chamadaDeApi.json().catch(() => null);

  check('chamada de API sem sessao devolve 401, nao 302',
    chamadaDeApi.status === 401, `HTTP ${chamadaDeApi.status}`);
  check('o corpo diz login_required, com nome estavel',
    corpoApi?.error === 'login_required', corpoApi?.error ?? 'sem error');
  check('o corpo traz o endereco do login',
    typeof corpoApi?.login_url === 'string' && corpoApi.login_url.startsWith(`${APP_PUBLICO}/auth/login`),
    corpoApi?.login_url ?? 'ausente');
  check('o returnTo sai do Referer: a TELA do front, nao a rota de API',
    corpoApi?.return_to === TELA, corpoApi?.return_to ?? 'ausente');
  check('o login_url ja carrega o returnTo pronto',
    (corpoApi?.login_url ?? '').includes(encodeURIComponent(TELA)), 'returnTo embutido');
  check('401 de sessao morta traz WWW-Authenticate (RFC 6750 secao 3)',
    !!chamadaDeApi.headers.get('www-authenticate'),
    chamadaDeApi.headers.get('www-authenticate') ?? 'ausente');

  const navegacao = await fetch(`${APP}/equipment`, {
    headers: { 'sec-fetch-dest': 'document', accept: 'text/html' },
    redirect: 'manual',
  });
  const paraOLogin = navegacao.headers.get('location') ?? '';

  check('navegacao de pagina sem sessao vira 302, nao 401',
    navegacao.status === 302, `HTTP ${navegacao.status}`);
  check('o 302 aponta para o login desta aplicacao',
    paraOLogin.startsWith(`${APP_PUBLICO}/auth/login`), paraOLogin);
  check('a navegacao volta para a propria URL pedida',
    paraOLogin.includes(encodeURIComponent('/api/equipment')), paraOLogin);

  // Referer de outro site nao vira destino: seria redirect aberto com passo extra.
  const refererHostil = await fetch(`${APP}/equipment`, {
    headers: { referer: 'https://phishing.example/colhe', accept: 'application/json' },
  });
  const corpoHostil = await refererHostil.json().catch(() => null);
  check('Referer de outro site nao vira returnTo',
    !(corpoHostil?.return_to ?? '').includes('phishing.example'),
    corpoHostil?.return_to ?? 'ausente');

  /* A volta completa: entrar pelo login_url com a sessao do SSO viva devolve a
   * pessoa exatamente a TELA de onde ela saiu. */
  const relogin = await fetch(comTransporte(corpoApi.login_url), {
    redirect: 'manual',
    headers: { cookie: `sso_session=${sealCookie(SSO_COOKIE_SECRET, { authSessionId: sessionId })}` },
  });
  const txRelogin = readCookies(relogin);
  const autorizaRelogin = await get(relogin.headers.get('location'),
    `sso_session=${sealCookie(SSO_COOKIE_SECRET, { authSessionId: sessionId })}`);
  const callbackRelogin = await get(comTransporte(autorizaRelogin.headers.get('location')), txRelogin);
  const corpoRelogin = await callbackRelogin.text();

  check('o relogin reemite a sessao da aplicacao',
    readCookies(callbackRelogin).includes(COOKIE_SESSAO), `HTTP ${callbackRelogin.status}`);
  check('e devolve a pessoa a TELA onde ela estava',
    corpoRelogin.includes(TELA), /url=([^"']+)/i.exec(corpoRelogin)?.[1] ?? 'sem destino');

  /* O relogin abriu uma SEGUNDA familia de refresh token para o mesmo usuario,
   * e ela ficaria viva ate expirar. Encerra aqui, senao a assercao de logout la
   * embaixo contaria essa sobra e acusaria revogacao incompleta. */
  const cookieRelogin = readCookies(callbackRelogin);
  const csrfRelogin = new RegExp(`${COOKIE_CSRF}=([^;]+)`).exec(cookieRelogin)?.[1] ?? '';
  const encerraRelogin = await fetch(`${APP}/auth/logout`, {
    method: 'POST',
    headers: { cookie: cookieRelogin, 'x-csrf-token': csrfRelogin },
  });
  check('a sessao aberta pelo relogin tambem e encerrada',
    encerraRelogin.status === 204, `HTTP ${encerraRelogin.status}`);

  console.log('\n=== returnTo nao vira redirect aberto ===');

  /* `returnTo` chega pela query string, entao e entrada do atacante. Sem
   * filtro, um link para /auth/login?returnTo=https://phishing.example sairia
   * de um dominio confiavel e encaminharia a vitima para fora. */
  const destinoDe = async (returnTo) => {
    const res = await fetch(`${APP}/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: 'manual',
      headers: { cookie: appCookie },
    });
    return res.headers.get('location') ?? '';
  };

  const proprio = APP_PUBLICO_ORIGEM;

  for (const hostil of [
    'https://phishing.example/colhe',
    '//phishing.example/colhe',
    '/\\phishing.example/colhe',
    'https://phishing.example\\@localhost:3000/',
  ]) {
    const destino = await destinoDe(hostil);
    const seguro = destino.startsWith('/') || destino.startsWith(proprio);
    check(`returnTo "${hostil}" nao leva para fora`, seguro, destino);
  }

  const interno = await destinoDe('/api/equipment');
  check('returnTo relativo da propria aplicacao e respeitado',
    interno === '/api/equipment', interno);

  console.log('\n=== regressao: bypass por regex no caminho ===');
  // A versao anterior montava new RegExp(req.path) e testava a permissao
  // contra ela, entao um caminho com metacaracteres casava com qualquer coisa.
  for (const evil of ['/.*', '/equipmen.', '/[a-z]*']) {
    const res = await get(`${APP}${evil}`, appCookie);
    check(`caminho "${evil}" nao vira padrao de autorizacao`,
      res.status === 404,
      `HTTP ${res.status}`);
  }

  console.log('\n=== logout revoga no servidor, nao so no navegador ===');
  const liveBefore = (
    await db.query(
      `SELECT count(*)::int AS n FROM "RefreshToken"
       WHERE "authSessionId" = $1 AND "revokedAt" IS NULL`,
      [sessionId],
    )
  ).rows[0].n;
  check('havia refresh token vivo antes do logout', liveBefore > 0, `${liveBefore}`);

  const logout = await fetch(`${APP}/auth/logout`, {
    method: 'POST',
    headers: { cookie: appCookie, 'x-csrf-token': csrf },
  });
  check('POST /auth/logout responde 204', logout.status === 204, `HTTP ${logout.status}`);

  const liveAfter = (
    await db.query(
      `SELECT count(*)::int AS n FROM "RefreshToken"
       WHERE "authSessionId" = $1 AND "revokedAt" IS NULL`,
      [sessionId],
    )
  ).rows[0].n;
  // Sem isto, quem tivesse copia do cookie continuaria renovando a sessao
  // para sempre: limpar cookie so apaga a copia do navegador.
  check('logout revogou a familia de refresh tokens no SSO (RFC 7009)',
    liveAfter === 0, `${liveAfter} vivo(s)`);

  const clearsCookie = (logout.headers.getSetCookie?.() ?? []).some(
    (c) => c.startsWith(COOKIE_SESSAO) && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c),
  );
  check('logout instrui o navegador a apagar o cookie', clearsCookie);

  /* O projeto KRLoc e real e fica. Saem o usuario da rodada, o operador de
   * teste, o papel desta rodada e as rotas que so ela precisou cadastrar, para
   * nao acumular acesso administrativo nem catalogo a cada execucao. */
  const removidos = await limparRodada();

  console.log(
    `\nlimpeza: ${removidos} usuario(s), o papel ${PAPEL} e ${rodada.rotas.length} rota(s) de teste removidos`,
  );

  await db.end();
  console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========\n`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERRO:', e);
  await limparRodada().catch((falha) => console.error('a limpeza tambem falhou:', falha.message));
  await db.end().catch(() => {});
  process.exit(1);
});
