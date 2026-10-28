
# Multi-stage production Dockerfile for Warrant Studio API
# Monorepo workspace build with a minimal, non-root runtime image.

# ==============================================================================
# Stage 1: Base Runtime Environment
# ==============================================================================
FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ==============================================================================
# Stage 2: Deterministic Workspace Dependencies
# ==============================================================================
FROM base AS deps

COPY package.json package-lock.json ./

# Copy every workspace manifest required by npm workspaces.
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/test-fixtures/package.json ./packages/test-fixtures/package.json

RUN npm ci

# ==============================================================================
# Stage 3: Build Shared Packages and API
# ==============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules

COPY package.json package-lock.json tsconfig.base.json ./

# Include all workspace sources needed by the API build.
COPY packages/contracts ./packages/contracts
COPY packages/domain ./packages/domain
COPY packages/test-fixtures ./packages/test-fixtures
COPY apps/api ./apps/api

# Build dependencies before the API that imports them.
RUN npm run build --workspace=@warrant/contracts \
    && npm run build --workspace=@warrant/domain \
    && npm run build --workspace=@warrant/test-fixtures \
    && npm run build --workspace=@warrant/api

# ==============================================================================
# Stage 4: Production Dependencies
# ==============================================================================
FROM base AS prod-deps

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/test-fixtures/package.json ./packages/test-fixtures/package.json

COPY --from=deps /app/node_modules ./node_modules

RUN npm prune --omit=dev

# ==============================================================================
# Stage 5: Production Runner
# ==============================================================================
FROM base AS runner

ENV NODE_ENV=production \
    PORT=10000 \
    HOST=0.0.0.0

# Install runtime dependencies without root privileges.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Compiled shared workspace packages.
COPY --from=builder --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist

COPY --from=builder --chown=node:node /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=builder --chown=node:node /app/packages/domain/dist ./packages/domain/dist

COPY --from=builder --chown=node:node /app/packages/test-fixtures/package.json ./packages/test-fixtures/package.json
COPY --from=builder --chown=node:node /app/packages/test-fixtures/dist ./packages/test-fixtures/dist

# Compiled API.
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node

EXPOSE 10000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/api/dist/server.js"]

