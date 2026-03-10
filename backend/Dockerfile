FROM node:22-slim AS builder

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace manifests for dependency caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY backend/ backend/

RUN pnpm --filter personal-avatar-backend run build
RUN pnpm --filter personal-avatar-backend deploy --prod --legacy /prod

FROM node:22-slim

WORKDIR /app
COPY --from=builder --chown=node:node /prod/node_modules ./node_modules
COPY --from=builder --chown=node:node /prod/package.json ./
COPY --from=builder --chown=node:node /app/backend/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r => { if (!r.ok) throw r })" || exit 1
CMD ["node", "dist/src/main"]
