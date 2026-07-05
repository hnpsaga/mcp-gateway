# syntax=docker/dockerfile:1.4
###############################################################################
# Stage 1: Builder
###############################################################################
FROM node:22-alpine AS builder

# Install build tools needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /build

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY drizzle.config.ts ./

# Build TypeScript
RUN pnpm build

# Copy SQL migration files into dist/ – tsc does not copy .sql assets.
# At runtime, database.ts resolves the migrations folder relative to
# import.meta.dirname which points to dist/persistence/.
RUN cp -r src/persistence/migrations dist/persistence/migrations

# Strip the `prepare` lifecycle script (husky) from package.json before pruning.
# Both pnpm install --prod and pnpm prune --prod still fire lifecycle hooks;
# removing the script from the manifest is the definitive fix.
RUN npm pkg delete scripts.prepare

# Prune devDependencies — now safe since prepare no longer invokes husky.
RUN pnpm prune --prod

###############################################################################
# Stage 2: Runtime
###############################################################################
FROM node:22-alpine AS runtime

# OCI labels
LABEL org.opencontainers.image.title="MCP Gateway" \
      org.opencontainers.image.description="Lightweight self-hosted REST gateway for managing MCP servers" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="MCP Gateway" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/your-org/mcp-gateway" \
      org.opencontainers.image.documentation="https://github.com/your-org/mcp-gateway/blob/main/docs/Deployment.md"

# Create a non-root user
RUN addgroup -g 1001 -S mcpgateway && \
    adduser -u 1001 -S mcpgateway -G mcpgateway

WORKDIR /app

# Copy only what is needed at runtime
COPY --from=builder --chown=mcpgateway:mcpgateway /build/dist/ ./dist/
COPY --from=builder --chown=mcpgateway:mcpgateway /build/node_modules/ ./node_modules/
COPY --from=builder --chown=mcpgateway:mcpgateway /build/package.json ./package.json

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown mcpgateway:mcpgateway /app/data

# Switch to non-root user
USER mcpgateway

# Runtime environment defaults (override at run-time via env vars / docker-compose)
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data \
    DATABASE_FILENAME=mcp-gateway.db \
    LOG_LEVEL=info \
    LOG_PRETTY=false \
    LOG_STRUCTURED=true \
    METRICS_ENABLED=true \
    OTEL_ENABLED=false

EXPOSE 3000

# Healthcheck using Node's built-in fetch (Node 22+)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use ENTRYPOINT + CMD pattern so SIGTERM is sent to node directly (PID 1)
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
