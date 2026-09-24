const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const {
  ensureProjectUser,
  mintAdminToken,
  purgeTestUsers,
} = require('@pedrolucaslopes/sso-client/testing');

const APP_DIR = path.resolve(__dirname, '..');

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

const env = {
  ...readEnv(path.join(APP_DIR, '.env.docker')),         // identidade do krloc
  ...readEnv(path.join(APP_DIR, '.env.test')),           // credenciais do SSO alvo
  ...process.env,
};

const missing = [
  'APP_TEST_BASE_URL',
  'SSO_TEST_DATABASE_URL',
  'SSO_TEST_COOKIE_SECRET',
].filter(
  (varName) => !env[varName],
);

if (missing.length) {
  console.error(
    `\nFaltam ${missing.join(' e ')}.\n\n` +
      'Copie krloc/.env.test.example para krloc/.env.test e preencha com os\n' +
      'dados do SSO contra o qual este teste roda.\n',
  );
  process.exit(1);
}

const SSO_COOKIE_SECRET = env.SSO_TEST_COOKIE_SECRET;

const PREFIX =
  env.APP_COOKIE_PREFIX ||
  crypto.createHash('sha256').update(env.APP_CLIENT_ID).digest('hex').slice(0, 8);
const COOKIE_SESSION = `${PREFIX}_session`;
const COOKIE_TX = `${PREFIX}_tx`;
const COOKIE_CSRF = `${PREFIX}_csrf`;

const SSO_DB = env.SSO_TEST_DATABASE_URL.replace('host.docker.internal', '127.0.0.1');

const SSO = env.SSO_ISSUER.replace(/\/+$/, '');
const APP_PUBLIC = env.APP_BASE_URL.replace(/\/+$/, '');
const APP_PUBLIC_ORIGIN = new URL(APP_PUBLIC).origin;
const APP = env.APP_TEST_BASE_URL.replace(/\/+$/, '');

const withTransport = (url) =>
  String(url).replace(APP_PUBLIC_ORIGIN, new URL(APP).origin);
const admin = { 'content-type': 'application/json' };

const OPERATOR = 'e2e-krloc-operador@exemplo.com';

const db = new Client({ connectionString: SSO_DB });

const run = { emails: [OPERATOR], roleId: null, emptyRoleId: null, routes: [] };

async function cleanRun() {
  const users = await purgeTestUsers(db, run.emails);

  for (const id of [run.roleId, run.emptyRoleId].filter(Boolean)) {
    await db.query('DELETE FROM "Permission" WHERE "roleId" = $1', [id]);
    await db.query('DELETE FROM "Role" WHERE id = $1', [id]);
  }

  if (run.routes.length) {
    await db.query('DELETE FROM "Permission" WHERE "routeId" = ANY($1)', [run.routes]);
    await db.query('DELETE FROM "Route" WHERE id = ANY($1)', [run.routes]);
  }

  return users;
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FALHA'} | ${name}${detail ? ` -> ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

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

const deniedByGuard = async (res, method, routePath) =>
  res.status === 404 &&
  (await res.clone().json().catch(() => null))?.message ===
    `Cannot ${method} ${new URL(APP).pathname}${routePath}`;

const passedRbac = async (res, method, routePath) =>
  res.status !== 401 && res.status !== 403 && !(await deniedByGuard(res, method, routePath));

(async () => {
  await db.connect();

  await ensureProjectUser(db, { projectName: 'SSO', email: OPERATOR, name: 'E2E KRLoc', role: 'SUPERADMIN' });
  const operator = await mintAdminToken(db, {
    issuer: SSO, cookieSecret: SSO_COOKIE_SECRET, email: OPERATOR,
  });
  admin.authorization = `Bearer ${operator.token}`;

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

  const ssoApi = async (method, route, body) => {
    const res = await fetch(`${SSO}${route}`, {
      method, headers: admin, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  const krlocRoute = async (method, routePath) => {
    const existing = (await db.query(
      'SELECT id FROM "Route" WHERE "projectId" = $1 AND path = $2 AND method = $3::"Method"',
      [project.id, routePath, method],
    )).rows[0];

    if (existing) return existing.id;

    const created = await ssoApi('POST', '/route', { projectId: project.id, path: routePath, method });

    if (created.status !== 201) throw new Error(`o SSO nao cadastrou ${method} ${routePath}: HTTP ${created.status}`);

    run.routes.push(created.json.id);
    return created.json.id;
  };

  const ROLE = `E2E_KRLOC_${tag.toUpperCase()}`;
  const role = await ssoApi('POST', '/role', { projectId: project.id, name: ROLE });
  run.roleId = role.json?.id ?? null;
  check(`papel customizado ${ROLE} criado no krloc`, role.status === 201, `HTTP ${role.status}`);

  const grants = async (method, routePath) => {
    const granted = await ssoApi('POST', '/permission', {
      roleId: role.json.id, routeId: await krlocRoute(method, routePath),
    });

    if (granted.status !== 201) throw new Error(`o SSO nao concedeu ${method} ${routePath}: HTTP ${granted.status}`);
  };

  const GRANTED = [['GET', '/equipment'], ['GET', '/equipment/:id'], ['POST', '/equipment']];

  for (const [method, routePath] of GRANTED) await grants(method, routePath);

  run.emails.push(`krloc-${tag}@exemplo.com`);

  const user = await (
    await fetch(`${SSO}/user`, {
      method: 'POST', headers: admin,
      body: JSON.stringify({ name: `Teste ${tag}`, email: `krloc-${tag}@exemplo.com` }),
    })
  ).json();

  const membership = await ssoApi('POST', '/projectuser', { userId: user.id, projectId: project.id, roleId: role.json.id });
  check(`usuario associado ao krloc com o papel ${ROLE}`, membership.status === 201, `HTTP ${membership.status}`);

  const sessionId = crypto.randomUUID();
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
    authorized.status === 302 && callbackUrl?.startsWith(`${APP_PUBLIC}/auth/callback`),
    `HTTP ${authorized.status}`);

  const callback = await get(withTransport(callbackUrl), txCookie);
  let appCookie = readCookies(callback);
  const bodyCallback = await callback.clone().text();
  check('callback troca o code e cria a sessao', callback.status === 200, `HTTP ${callback.status}`);
  check('callback devolve documento da propria origem, nao 302',
    /http-equiv="refresh"/i.test(bodyCallback),
    callback.headers.get('content-type') ?? 'sem content-type');
  const destinationBounce = /url=([^"']+)/i.exec(bodyCallback)?.[1] ?? '';
  check('o bounce so aponta para a propria origem, nunca para outro site',
    destinationBounce.startsWith('/') || new URL(destinationBounce).origin === APP_PUBLIC_ORIGIN,
    destinationBounce);
  check('cookie de sessao do app foi emitido', appCookie.includes(COOKIE_SESSION));

  const sessionCookies = (callback.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(COOKIE_SESSION));
  check('cookie de sessao e HttpOnly', /HttpOnly/i.test(sessionCookies ?? ''));

  check('o cookie leva prefixo desta aplicacao, nao um nome generico',
    COOKIE_SESSION !== 'app_session' && (sessionCookies ?? '').startsWith(COOKIE_SESSION),
    COOKIE_SESSION);
  const cookieValue = (sessionCookies ?? '').split(';')[0].split('=').slice(1).join('=');

  check('nenhum token no cookie em claro',
    cookieValue.split('.').every((chunk) => !chunk.startsWith('eyJ')),
    'conteudo cifrado');

  check('cookie de sessao cabe no limite de 4096 bytes do navegador',
    cookieValue.length < 4096, `${cookieValue.length} bytes`);
  check('cookie com folga de pelo menos 25%',
    cookieValue.length < 3072, `${cookieValue.length} de 4096`);

  console.log('\n=== rotas com sessao ===');
  const me = await get(`${APP}/auth/me`, appCookie);
  const identity = me.ok ? await me.json() : null;
  check('GET /auth/me devolve a identidade', me.status === 200 && identity?.email === `krloc-${tag}@exemplo.com`,
    identity?.email ?? `HTTP ${me.status}`);
  check('as permissoes do papel chegaram ao app, e so elas',
    identity?.permissions?.length === GRANTED.length,
    `${identity?.permissions?.length ?? 0} permissoes`);

  const equipment = await get(`${APP}/equipment`, appCookie);
  check('GET /equipment com sessao passa pelo RBAC',
    await passedRbac(equipment, 'GET', '/equipment'),
    `HTTP ${equipment.status} (404 do controller = sem dados, mas autorizado)`);

  const ZERO = '00000000-0000-4000-8000-000000000000';
  const byId = await get(`${APP}/equipment/${ZERO}`, appCookie);
  check('rota com :id casa com a permissao parametrizada',
    await passedRbac(byId, 'GET', `/equipment/${ZERO}`), `HTTP ${byId.status}`);

  const bodyById = await byId.clone().json().catch(() => null);
  check('registro que nao existe vem com codigo, e nao com frase',
    byId.status === 404 && bodyById?.error === 'equipment_not_found' && bodyById?.statusCode === 404,
    `HTTP ${byId.status} ${bodyById?.error}`);

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
  check('refresh_token NAO e entregue ao cliente', !('refresh_token' in (grant ?? {})));

  const bearer = { Authorization: `Bearer ${grant.access_token}` };

  console.log('\n=== Authorization: Bearer, sem cookie nenhum ===');
  const viaBearer = await fetch(`${APP}/equipment`, { headers: bearer, redirect: 'manual' });
  check('GET /equipment so com Bearer passa pelo RBAC',
    await passedRbac(viaBearer, 'GET', '/equipment'),
    `HTTP ${viaBearer.status} (404 do controller = sem dados, mas autorizado)`);

  const meBearer = await fetch(`${APP}/auth/me`, { headers: bearer });
  const idBearer = meBearer.ok ? await meBearer.json() : null;
  check('identidade resolvida a partir do Bearer',
    idBearer?.email === `krloc-${tag}@exemplo.com`, idBearer?.email ?? `HTTP ${meBearer.status}`);

  const bad = await fetch(`${APP}/equipment`, { headers: { Authorization: 'Bearer nao.e.um.jwt' } });
  const badBody = await bad.clone().json().catch(() => null);
  check('Bearer invalido devolve 401 com invalid_token (RFC 6750 secao 3.1)',
    bad.status === 401 && badBody?.error === 'invalid_token', `HTTP ${bad.status} ${badBody?.error}`);

  const withNothing = await fetch(`${APP}/equipment`);
  check('sem cookie e sem Bearer devolve 401', withNothing.status === 401, `HTTP ${withNothing.status}`);

  console.log('\n=== sem permissao, a rota responde como se nao existisse (RFC 9110 secao 15.5.4) ===');

  const deniedRes = await get(`${APP}/accessory/${ZERO}`, appCookie);
  const deniedBody = await deniedRes.clone().json().catch(() => null);
  const missing = await get(`${APP}/nao-existe-${tag}`, appCookie);
  const missingBody = await missing.json().catch(() => null);

  check('rota que o papel nao alcanca devolve 404', deniedRes.status === 404, `HTTP ${deniedRes.status}`);
  check('o 404 da rota negada e igual ao de um caminho que nao existe',
    (await deniedByGuard(deniedRes, 'GET', `/accessory/${ZERO}`))
      && missing.status === 404
      && missingBody?.message === `Cannot GET ${new URL(APP).pathname}/nao-existe-${tag}`
      && deniedBody?.error === missingBody?.error,
    `${deniedBody?.message} | ${missingBody?.message}`);
  check('o 404 da rota negada nao anuncia como se autentica',
    !deniedRes.headers.get('www-authenticate'), deniedRes.headers.get('www-authenticate') ?? 'sem WWW-Authenticate');

  const deniedByBearer = await fetch(`${APP}/accessory/${ZERO}`, { headers: bearer });
  check('pelo Bearer, a rota negada tambem responde 404',
    await deniedByGuard(deniedByBearer, 'GET', `/accessory/${ZERO}`), `HTTP ${deniedByBearer.status}`);

  await grants('GET', '/accessory/:id');
  await new Promise((resolve) => setTimeout(resolve, 5500));

  const justGranted = await get(`${APP}/accessory/${ZERO}`, appCookie);
  check('permissao concedida no SSO vale na requisicao seguinte, sem novo login',
    await passedRbac(justGranted, 'GET', `/accessory/${ZERO}`), `HTTP ${justGranted.status}`);

  console.log('\n=== papel trocado no SSO chega sem novo login (introspeccao, RFC 7662) ===');

  const EMPTY_ROLE = `E2E_VAZIO_${tag.toUpperCase()}`;
  const emptyRole = await ssoApi('POST', '/role', { projectId: project.id, name: EMPTY_ROLE });
  run.emptyRoleId = emptyRole.json?.id ?? null;
  const swapped = await ssoApi('PUT', `/projectuser/${project.id}/${user.id}`, { roleId: emptyRole.json?.id });
  check(`papel da pessoa trocado no SSO para ${EMPTY_ROLE}, que nao alcanca nada`,
    swapped.status === 200, `HTTP ${swapped.status}`);

  const meAfterSwap = await get(`${APP}/auth/me`, appCookie);
  const swappedIdentity = meAfterSwap.ok ? await meAfterSwap.json() : null;
  check('GET /auth/me ja traz o papel novo, sem novo login',
    JSON.stringify(swappedIdentity?.roles) === JSON.stringify([EMPTY_ROLE])
      && swappedIdentity?.permissions?.length === 0,
    `${JSON.stringify(swappedIdentity?.roles)} com ${swappedIdentity?.permissions?.length} permissao(oes)`);

  const renewedCookie = readCookies(meAfterSwap);
  check('a aplicacao pediu um token novo ao SSO e o devolveu na mesma resposta',
    renewedCookie.includes(COOKIE_SESSION), renewedCookie ? 'cookie de sessao novo' : 'sem Set-Cookie');
  appCookie = renewedCookie || appCookie;

  const equipmentAfterSwap = await get(`${APP}/equipment`, appCookie);
  check('o papel novo ja decide: a rota que o antigo alcancava responde 404',
    await deniedByGuard(equipmentAfterSwap, 'GET', '/equipment'), `HTTP ${equipmentAfterSwap.status}`);

  const bearerAfterSwap = await fetch(`${APP}/equipment`, { headers: bearer });
  check('pelo Bearer emitido antes da troca tambem vale o papel de agora',
    await deniedByGuard(bearerAfterSwap, 'GET', '/equipment'), `HTTP ${bearerAfterSwap.status}`);

  await ssoApi('PUT', `/projectuser/${project.id}/${user.id}`, { roleId: role.json.id });
  const meBack = await get(`${APP}/auth/me`, appCookie);
  const identityBack = meBack.ok ? await meBack.json() : null;
  appCookie = readCookies(meBack) || appCookie;
  check('devolvido o papel, a sessao volta a alcancar o que ele concede, ainda sem novo login',
    JSON.stringify(identityBack?.roles) === JSON.stringify([ROLE]), JSON.stringify(identityBack?.roles));

  const tokenBack = await get(`${APP}/auth/token`, appCookie);
  const grantBack = tokenBack.ok ? await tokenBack.json() : null;
  appCookie = readCookies(tokenBack) || appCookie;
  bearer.Authorization = `Bearer ${grantBack?.access_token}`;
  check('GET /auth/token entrega um token com o papel de agora', !!grantBack?.access_token,
    `HTTP ${tokenBack.status}`);

  console.log('\n=== o guard hidrata o Authorization a partir da sessao ===');
  const homeCookie = await get(`${APP}/home`, appCookie);
  const sessionCookie = homeCookie.ok ? await homeCookie.json() : null;
  check('GET /home so com cookie responde 200', homeCookie.status === 200, `HTTP ${homeCookie.status}`);
  check('o handler recebeu o access token', sessionCookie?.tokenAvailable === true);
  check('Authorization: Bearer chegou preenchido ao handler',
    sessionCookie?.authorizationHeader === true);
  check('identidade correta na resposta', sessionCookie?.user?.email === `krloc-${tag}@exemplo.com`,
    sessionCookie?.user?.email);

  const homeBearer = await fetch(`${APP}/home`, { headers: bearer });
  const sessionBearer = homeBearer.ok ? await homeBearer.json() : null;
  check('mesma resposta quando o cliente envia Bearer',
    sessionBearer?.authorizationHeader === true && sessionBearer?.tokenAvailable === true,
    `HTTP ${homeBearer.status}`);
  check('os dois caminhos resolvem o mesmo usuario',
    sessionBearer?.user?.id === sessionCookie?.user?.id);

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

  const write = (headers) =>
    fetch(`${APP}/equipment`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

  const code = async (res) => (await res.clone().json().catch(() => null))?.error;

  const noToken = await write({ cookie: appCookie });
  check('POST so com cookie, sem o header, devolve 403 com csrf_token_invalid',
    noToken.status === 403 && await code(noToken) === 'csrf_token_invalid', `HTTP ${noToken.status}`);

  const wrongToken = await write({ cookie: appCookie, 'x-csrf-token': 'a'.repeat(csrf.length) });
  check('POST com token anti-CSRF errado devolve 403 com csrf_token_invalid',
    wrongToken.status === 403 && await code(wrongToken) === 'csrf_token_invalid', `HTTP ${wrongToken.status}`);

  const strangeOrigin = await write({
    cookie: appCookie, 'x-csrf-token': csrf, origin: 'https://site-do-atacante.example',
  });
  check('Origin de outro site e recusado mesmo com o token certo, com origin_not_allowed',
    strangeOrigin.status === 403 && await code(strangeOrigin) === 'origin_not_allowed',
    `HTTP ${strangeOrigin.status}`);
  check('a recusa de origem nao repete a origem recebida',
    !(await strangeOrigin.clone().text()).includes('site-do-atacante'));

  const withToken = await write({ cookie: appCookie, 'x-csrf-token': csrf, origin: APP_PUBLIC_ORIGIN });
  check('POST com cookie MAIS o header passa pelo guard',
    await passedRbac(withToken, 'POST', '/equipment'), `HTTP ${withToken.status}`);

  const refusal = await withToken.clone().json().catch(() => null);
  check('corpo recusado vem como validation_failed, com o codigo de cada campo',
    withToken.status === 400 && refusal?.error === 'validation_failed'
      && refusal?.fields?.some((f) => f.field === 'name' && typeof f.error === 'string'),
    `${refusal?.error} ${JSON.stringify(refusal?.fields?.map((f) => `${f.field}:${f.error}`))}`);

  const bearerOnly = await write({ authorization: bearer.Authorization });
  check('Bearer dispensa o token anti-CSRF: o navegador nunca o anexa sozinho',
    await passedRbac(bearerOnly, 'POST', '/equipment'), `HTTP ${bearerOnly.status}`);

  const read = await get(`${APP}/equipment`, appCookie);
  check('GET nao exige o header: metodo seguro nao muda estado',
    await passedRbac(read, 'GET', '/equipment'), `HTTP ${read.status}`);

  console.log('\n=== refresh token vivo renova o access token morto, sem login ===');

  const currentSession = openCookie(env.COOKIE_SECRET, new RegExp(`${COOKIE_SESSION}=([^;]+)`).exec(appCookie)[1]);

  const expiredSession = sealCookie(env.COOKIE_SECRET, {
    ...currentSession,
    expiresAt: Math.floor(Date.now() / 1000) - 10,
  });
  const expiredCookie = appCookie.replace(new RegExp(`${COOKIE_SESSION}=[^;]+`), `${COOKIE_SESSION}=${expiredSession}`);

  const withExpiredToken = await get(`${APP}/equipment`, expiredCookie);
  check('access token vencido nao manda ninguem ao login',
    withExpiredToken.status !== 401 && withExpiredToken.status !== 302,
    `HTTP ${withExpiredToken.status}`);

  const reissued = (withExpiredToken.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith(COOKIE_SESSION));
  check('a resposta ja traz a sessao renovada', !!reissued, reissued ? 'app_session reescrito' : 'ausente');

  const newSession = openCookie(env.COOKIE_SECRET, new RegExp(`${COOKIE_SESSION}=([^;]+)`).exec(reissued)[1]);
  check('o access token e outro, emitido na hora',
    newSession.accessToken !== currentSession.accessToken, 'token trocado');
  check('o refresh token rotacionou junto, como manda a RFC 9700 secao 4.14',
    newSession.refreshToken !== currentSession.refreshToken, 'familia avancou');
  check('a nova validade esta no futuro',
    newSession.expiresAt > Math.floor(Date.now() / 1000), `${newSession.expiresAt - Math.floor(Date.now() / 1000)}s`);
  check('o token anti-CSRF sobrevive a renovacao',
    newSession.csrfToken === currentSession.csrfToken, 'mesmo valor');

  const allDead = sealCookie(env.COOKIE_SECRET, {
    ...currentSession,
    accessToken: currentSession.accessToken,
    refreshToken: 'este-refresh-token-nao-existe-no-sso',
    expiresAt: Math.floor(Date.now() / 1000) - 10,
  });
  const noOutput = await fetch(`${APP}/equipment`, {
    headers: { cookie: `${COOKIE_SESSION}=${allDead}`, 'sec-fetch-dest': 'document', accept: 'text/html' },
    redirect: 'manual',
  });
  check('refresh token morto tambem: aí sim vai para o login',
    noOutput.status === 302 && (noOutput.headers.get('location') ?? '').includes('/auth/login'),
    `HTTP ${noOutput.status}`);

  appCookie = readCookies(withExpiredToken) || appCookie;

  console.log('\n=== sessao morta manda ao login e volta para onde a pessoa estava ===');

  const SCREEN = `${APP_PUBLIC_ORIGIN}/accessories`;

  const apiCall = await fetch(`${APP}/equipment`, {
    headers: { referer: SCREEN, 'sec-fetch-dest': 'empty', accept: 'application/json' },
    redirect: 'manual',
  });
  const apiBody = await apiCall.json().catch(() => null);

  check('chamada de API sem sessao devolve 401, nao 302',
    apiCall.status === 401, `HTTP ${apiCall.status}`);
  check('o corpo diz login_required, com nome estavel',
    apiBody?.error === 'login_required', apiBody?.error ?? 'sem error');
  check('o corpo traz o endereco do login',
    typeof apiBody?.login_url === 'string' && apiBody.login_url.startsWith(`${APP_PUBLIC}/auth/login`),
    apiBody?.login_url ?? 'ausente');
  check('o returnTo sai do Referer: a TELA do front, nao a rota de API',
    apiBody?.return_to === SCREEN, apiBody?.return_to ?? 'ausente');
  check('o login_url ja carrega o returnTo pronto',
    (apiBody?.login_url ?? '').includes(encodeURIComponent(SCREEN)), 'returnTo embutido');
  check('401 de sessao morta traz WWW-Authenticate (RFC 6750 secao 3)',
    !!apiCall.headers.get('www-authenticate'),
    apiCall.headers.get('www-authenticate') ?? 'ausente');

  const navigation = await fetch(`${APP}/equipment`, {
    headers: { 'sec-fetch-dest': 'document', accept: 'text/html' },
    redirect: 'manual',
  });
  const toLogin = navigation.headers.get('location') ?? '';

  check('navegacao de pagina sem sessao vira 302, nao 401',
    navigation.status === 302, `HTTP ${navigation.status}`);
  check('o 302 aponta para o login desta aplicacao',
    toLogin.startsWith(`${APP_PUBLIC}/auth/login`), toLogin);
  check('a navegacao volta para a propria URL pedida',
    toLogin.includes(encodeURIComponent('/api/equipment')), toLogin);

  const hostileReferer = await fetch(`${APP}/equipment`, {
    headers: { referer: 'https://phishing.example/colhe', accept: 'application/json' },
  });
  const hostileBody = await hostileReferer.json().catch(() => null);
  check('Referer de outro site nao vira returnTo',
    !(hostileBody?.return_to ?? '').includes('phishing.example'),
    hostileBody?.return_to ?? 'ausente');

  const relogin = await fetch(withTransport(apiBody.login_url), {
    redirect: 'manual',
    headers: { cookie: `sso_session=${sealCookie(SSO_COOKIE_SECRET, { authSessionId: sessionId })}` },
  });
  const txRelogin = readCookies(relogin);
  const allowsRelogin = await get(relogin.headers.get('location'),
    `sso_session=${sealCookie(SSO_COOKIE_SECRET, { authSessionId: sessionId })}`);
  const callbackRelogin = await get(withTransport(allowsRelogin.headers.get('location')), txRelogin);
  const bodyRelogin = await callbackRelogin.text();

  check('o relogin reemite a sessao da aplicacao',
    readCookies(callbackRelogin).includes(COOKIE_SESSION), `HTTP ${callbackRelogin.status}`);
  check('e devolve a pessoa a TELA onde ela estava',
    bodyRelogin.includes(SCREEN), /url=([^"']+)/i.exec(bodyRelogin)?.[1] ?? 'sem destino');

  const cookieRelogin = readCookies(callbackRelogin);
  const csrfRelogin = new RegExp(`${COOKIE_CSRF}=([^;]+)`).exec(cookieRelogin)?.[1] ?? '';
  const endsRelogin = await fetch(`${APP}/auth/logout`, {
    method: 'POST',
    headers: { cookie: cookieRelogin, 'x-csrf-token': csrfRelogin },
  });
  check('a sessao aberta pelo relogin tambem e encerrada',
    endsRelogin.status === 204, `HTTP ${endsRelogin.status}`);

  console.log('\n=== returnTo nao vira redirect aberto ===');

  const destinationOf = async (returnTo) => {
    const res = await fetch(`${APP}/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: 'manual',
      headers: { cookie: appCookie },
    });
    return res.headers.get('location') ?? '';
  };

  const own = APP_PUBLIC_ORIGIN;

  for (const hostile of [
    'https://phishing.example/colhe',
    '//phishing.example/colhe',
    '/\\phishing.example/colhe',
    'https://phishing.example\\@localhost:3000/',
  ]) {
    const destination = await destinationOf(hostile);
    const safe = destination.startsWith('/') || destination.startsWith(own);
    check(`returnTo "${hostile}" nao leva para fora`, safe, destination);
  }

  const internal = await destinationOf('/api/equipment');
  check('returnTo relativo da propria aplicacao e respeitado',
    internal === '/api/equipment', internal);

  console.log('\n=== regressao: bypass por regex no caminho ===');
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
  check('logout revogou a familia de refresh tokens no SSO (RFC 7009)',
    liveAfter === 0, `${liveAfter} vivo(s)`);

  const clearsCookie = (logout.headers.getSetCookie?.() ?? []).some(
    (c) => c.startsWith(COOKIE_SESSION) && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c),
  );
  check('logout instrui o navegador a apagar o cookie', clearsCookie);

  const cookieCopy = await get(`${APP}/auth/me`, appCookie);
  check('uma copia do cookie de antes do logout deixa de abrir a API na hora',
    cookieCopy.status === 401, `HTTP ${cookieCopy.status}`);

  const removed = await cleanRun();

  console.log(
    `\nlimpeza: ${removed} usuario(s), o papel ${ROLE} e ${run.routes.length} rota(s) de teste removidos`,
  );

  await db.end();
  console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========\n`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERRO:', e);
  await cleanRun().catch((failure) => console.error('a limpeza tambem falhou:', failure.message));
  await db.end().catch(() => {});
  process.exit(1);
});
