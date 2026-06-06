FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/public ./packages/backend/public
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/packages/backend/migrations ./packages/backend/migrations
COPY --from=builder /app/packages/peggy-opensong/ ./packages/peggy-opensong/
COPY --from=builder /app/packages/peggy-chordpro/ ./packages/peggy-chordpro/
COPY --from=builder /app/packages/common/ ./packages/common/

RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME ["/data"]

RUN printf '#!/bin/sh\n\
set -e\n\
echo "Running better-auth schema migration..."\n\
npx auth@latest migrate\n\
echo "Starting synago..."\n\
exec node /app/packages/backend/dist/server.js\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
