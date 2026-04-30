FROM node:22-slim AS base
WORKDIR /app

RUN corepack enable

COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/github-data/package.json packages/github-data/
COPY packages/persistence/package.json packages/persistence/
COPY packages/stats/package.json packages/stats/
RUN npm install --frozen-lockfile

COPY packages/github-data/ packages/github-data/
COPY packages/persistence/ packages/persistence/
COPY packages/stats/ packages/stats/
COPY packages/server/ packages/server/

RUN npm run build

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
