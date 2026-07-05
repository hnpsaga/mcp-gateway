# MCP Gateway – Deployment Guide

> **Quick links**: [Docker Quick Start](#quick-start-docker) · [Docker Compose](#docker-compose-deployment) · [Reverse Proxy](#reverse-proxy-examples) · [Production Recommendations](#production-recommendations) · [Troubleshooting](#troubleshooting)

---

## Quick Start (Docker)

Get the gateway running in three commands:

```bash
# 1. Build the image
docker build -t mcp-gateway:latest .

# 2. Create a persistent data directory
mkdir -p ./data

# 3. Run the container
docker run -d \
  --name mcp-gateway \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -e NODE_ENV=production \
  -e AUTH_ENABLED=false \
  mcp-gateway:latest
```

Verify it is running:

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"mcp-gateway","version":"1.0.0","timestamp":"..."}
```

---

## Docker Deployment

### Building the Image

The `Dockerfile` uses a multi-stage build:

| Stage     | Base image       | Purpose                                                           |
| :-------- | :--------------- | :---------------------------------------------------------------- |
| `builder` | `node:22-alpine` | Installs all deps, compiles TypeScript, rebuilds native modules   |
| `runtime` | `node:22-alpine` | Minimal image: only `dist/`, prod `node_modules/`, `package.json` |

```bash
# Standard build
docker build -t mcp-gateway:latest .

# Build with a specific version tag
docker build -t mcp-gateway:1.0.0 .

# Build with build-cache (faster CI re-builds)
docker build --cache-from mcp-gateway:latest -t mcp-gateway:latest .
```

### Running the Container

**Minimal (no auth, no persistence):**

```bash
docker run -d -p 3000:3000 mcp-gateway:latest
```

**Production-ready (auth + persistent data):**

```bash
docker run -d \
  --name mcp-gateway \
  --restart unless-stopped \
  -p 3000:3000 \
  -v mcp-gateway-data:/app/data \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e LOG_LEVEL=info \
  -e AUTH_ENABLED=true \
  -e API_KEYS=sk-prod-$(openssl rand -hex 16) \
  mcp-gateway:latest
```

### Volumes

| Mount path in container | Purpose                        | Recommended host path or named volume |
| :---------------------- | :----------------------------- | :------------------------------------ |
| `/app/data`             | SQLite database (`*.db` files) | `mcp-gateway-data` (named volume)     |

> [!IMPORTANT]
> Always mount a persistent volume at `/app/data`. Without it, the database is lost when the container restarts.

### Environment Variables

See [`.env.example`](../.env.example) for the full reference. Key overrides for containers:

| Variable        | Container default | Notes                                    |
| :-------------- | :---------------- | :--------------------------------------- |
| `HOST`          | `0.0.0.0`         | Must be `0.0.0.0` inside containers      |
| `PORT`          | `3000`            | Must match the `-p` port mapping         |
| `DATABASE_PATH` | `/app/data`       | Change if you mount the volume elsewhere |
| `NODE_ENV`      | `production`      | Do not change for production deployments |

### Updating the Image

```bash
# Rebuild from updated source
docker build -t mcp-gateway:latest .

# Stop and recreate the container (data volume is preserved)
docker stop mcp-gateway
docker rm mcp-gateway
docker run -d \
  --name mcp-gateway \
  --restart unless-stopped \
  -p 3000:3000 \
  -v mcp-gateway-data:/app/data \
  mcp-gateway:latest
```

### Backing Up the Database

```bash
# Copy the database file from the named volume to the host
docker run --rm \
  -v mcp-gateway-data:/data \
  -v "$(pwd)/backups:/backup" \
  alpine \
  sh -c "cp /data/mcp-gateway.db /backup/mcp-gateway-$(date +%Y%m%d%H%M%S).db"
```

Schedule this with cron for automated daily backups:

```cron
0 2 * * * /usr/local/bin/mcp-gateway-backup.sh >> /var/log/mcp-backup.log 2>&1
```

---

## Docker Compose Deployment

`docker-compose.yml` is the recommended way to run MCP Gateway in production because it manages networking, volumes, and environment in a single declarative file.

### Prerequisites

- Docker Engine ≥ 24
- Docker Compose plugin (or `docker-compose` CLI ≥ v2)

### Start

```bash
# Build image and start in background
docker compose up -d --build

# View logs
docker compose logs -f mcp-gateway
```

### Shutdown

```bash
# Graceful stop (SIGTERM) – data is preserved
docker compose stop

# Remove containers (data volume is preserved)
docker compose down

# Remove containers AND data volume (destructive!)
docker compose down -v
```

### Updating

```bash
docker compose build --no-cache
docker compose up -d
```

### Persistence

The Compose file declares a named volume `mcp-gateway-data` mapped to `/app/data` inside the container. Data persists across container restarts and `docker compose down` (without `-v`).

To inspect the volume:

```bash
docker volume inspect mcp_gateway_mcp-gateway-data
```

### Environment Override

Create a `.env` file in the same directory as `docker-compose.yml` (copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env to enable auth, set API keys, etc.
```

Docker Compose automatically loads `.env` and merges it with the `environment:` section in `docker-compose.yml`.

---

## Reverse Proxy Examples

Running MCP Gateway behind a reverse proxy provides TLS termination, load balancing, and additional security.

### Nginx

```nginx
upstream mcp_gateway {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name gateway.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gateway.example.com;

    ssl_certificate     /etc/ssl/certs/gateway.crt;
    ssl_certificate_key /etc/ssl/private/gateway.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    nosniff always;
    add_header X-Frame-Options           DENY always;

    location / {
        proxy_pass         http://mcp_gateway;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       "upgrade";
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Health check endpoint – no auth required
    location = /health {
        proxy_pass http://mcp_gateway/health;
    }
}
```

### Traefik (Docker labels)

Add labels to the `mcp-gateway` service in `docker-compose.yml`:

```yaml
labels:
  - 'traefik.enable=true'
  - 'traefik.http.routers.mcp-gateway.rule=Host(`gateway.example.com`)'
  - 'traefik.http.routers.mcp-gateway.entrypoints=websecure'
  - 'traefik.http.routers.mcp-gateway.tls.certresolver=letsencrypt'
  - 'traefik.http.services.mcp-gateway.loadbalancer.server.port=3000'
  - 'traefik.http.routers.mcp-gateway.middlewares=secure-headers@file'
```

Then in your Traefik `dynamic.yml`:

```yaml
http:
  middlewares:
    secure-headers:
      headers:
        stsSeconds: 63072000
        stsIncludeSubdomains: true
        stsPreload: true
        contentTypeNosniff: true
        frameDeny: true
```

---

## Production Recommendations

### Resource Limits

Set resource limits in `docker-compose.yml` to prevent runaway processes:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 128M
```

### Backups

- Run automated daily backups of the `/app/data` directory.
- Store backups off-host (S3, GCS, or similar).
- Periodically test restores.
- SQLite WAL mode (`DATABASE_WAL_MODE=true`) is recommended for consistency.

### Logging

- Keep `LOG_PRETTY=false` and `LOG_STRUCTURED=true` in production to produce JSON logs consumable by log aggregators (Loki, Elasticsearch, CloudWatch).
- Use `LOG_LEVEL=warn` or `LOG_LEVEL=error` under high traffic to reduce I/O.
- Ship container stdout/stderr to a centralized log system.

### Monitoring

- Prometheus metrics are available at `GET /metrics` (enabled by default).
- Scrape `/metrics` with a Prometheus instance or compatible agent.
- Alert on HTTP error rates (`http_requests_total{status=~"5.."}`) and latency percentiles.
- Use `/ready` as the liveness/readiness probe in Kubernetes.

### Security

- **Enable auth**: Set `AUTH_ENABLED=true` and provide strong `API_KEYS` in production.
- **Rotate keys** regularly and use comma-separated multiple keys for zero-downtime rotation.
- **TLS**: Always serve behind a reverse proxy that terminates TLS.
- **Non-root**: The container already runs as user `mcpgateway` (UID 1001).
- **Read-only root filesystem**: Consider `--read-only` with a tmpfs for `/tmp`.
- **Swagger**: Set `AUTH_SWAGGER_AUTHENTICATE=true` to protect the API docs.
- **Network isolation**: Use a private Docker network; expose only port 3000.

### Upgrades

1. Pull or rebuild the new image.
2. Test the new image in a staging environment.
3. Backup the database (`/app/data`).
4. Replace the container: `docker compose up -d --build`.
5. Verify health: `curl http://localhost:3000/health`.

---

## Troubleshooting

### Container exits immediately

Check logs:

```bash
docker logs mcp-gateway
```

Common causes:

- Invalid environment variable (Zod validation failure on startup).
- Permissions issue on `/app/data` – ensure the volume is writable by UID 1001.

### Health check failing

```bash
# Test inside the container
docker exec mcp-gateway node -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(console.log)"
```

### Database locked

Symptoms: `SQLITE_BUSY` errors in logs.

- Increase `DATABASE_BUSY_TIMEOUT` (e.g., `DATABASE_BUSY_TIMEOUT=10000`).
- Ensure only one container writes to the database at a time.
- Enable WAL mode: `DATABASE_WAL_MODE=true`.

### Port already in use

```bash
# Find and kill the conflicting process
lsof -ti :3000 | xargs kill -9

# Or run on a different port
docker run -p 3001:3000 mcp-gateway:latest
```

### SIGTERM not working / container not shutting down gracefully

The `Dockerfile` uses `ENTRYPOINT ["node"]` so Node.js is PID 1 and receives signals directly. If you override the entrypoint, ensure the process receives SIGTERM. The application handles SIGTERM via its graceful-shutdown logic in `src/server.ts`.

### OTel traces not appearing

- Confirm `OTEL_ENABLED=true`.
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector URL.
- Check the collector is reachable from inside the container (use the Docker network service name, not `localhost`).
