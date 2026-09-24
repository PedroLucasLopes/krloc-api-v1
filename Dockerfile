# syntax=docker/dockerfile:1

# Contexto de build: ./krloc, e nada fora dele. A camada de autenticacao chega
# pelo npm, como @pedrolucaslopes/sso-client, e nao por pasta vizinha.
#
# O client do Prisma 7 e TypeScript puro compilado pelo tsc, e o acesso ao
# banco passa por @prisma/adapter-pg. Nao ha engine nativo nem wasm, entao
# alpine/musl e seguro e nao existe binaryTarget a declarar.

########################  build  #######################
FROM node:22-alpine AS build
WORKDIR /app

# @pedrolucaslopes/sso-client vem do GitHub Packages, que exige token ate para
# instalar. O .npmrc versionado so diz ONDE buscar e le o token do ambiente. O
# token entra como secret do BuildKit: existe durante o RUN e nao fica em
# camada nenhuma. ARG e ENV ficariam gravados na imagem.
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN npm ci

COPY . .
RUN npx prisma generate && npm run build

#######################  migrate  ######################
# Alvo separado porque `prisma migrate deploy` precisa do Prisma CLI, que e
# devDependency. Rode como job/one-shot, nunca no start do app: com mais de
# uma instancia, migrar no boot gera corrida entre replicas.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

#######################  runtime  ######################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini

# O .npmrc entra por bind mount, e nao por COPY: so existe durante a instalacao
# e nao chega a imagem final, nem como arquivo sem segredo.
COPY package.json package-lock.json ./
RUN --mount=type=bind,source=.npmrc,target=/app/.npmrc \
    --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN \
    npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist dist

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main"]
