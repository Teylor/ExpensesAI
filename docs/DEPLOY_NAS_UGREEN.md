# Guía de Despliegue en NAS Ugreen DXP2800 (UGOS Pro) — AgenticF V1

> Stack 100% gratuito, open-source y *stateless* (`PostgreSQL 17` + `apps/api` Node 22 + `apps/web` PWA sobre Caddy 2).

## 1. Requisitos previos
- NAS **Ugreen DXP2800** con **Docker** instalado desde el Centro de Aplicaciones de UGOS Pro.
- Acceso SSH o el gestor de proyectos Docker Compose de UGOS Pro.
- **HTTPS obligatorio** para instalar la PWA en móvil, usar cookies `Secure` y activar la voz gratuita (`Web Speech API`):
  - **Opción recomendada (privada o pública sin abrir puertos del router):** **Tailscale Serve / Funnel** o **Cloudflare Tunnel (`cloudflared`)** apuntando a `http://localhost:8080`.

## 2. Configurar variables de entorno (`.env` en la raíz del proyecto)
Copia `.env.example` a `.env` y rellena los valores de producción (nunca subas `.env` a Git):

```env
POSTGRES_USER=agenticf
POSTGRES_PASSWORD=<contrasena-larga-generada>
POSTGRES_DB=agenticf
APP_HTTP_PORT=8080
SITE_ADDRESS=:80

# Debe coincidir con tu URL HTTPS de Tailscale o Cloudflare Tunnel
CORS_ORIGIN=https://finanzas.tu-dominio.com

# Clave maestra AES-256-GCM (mínimo 32 caracteres aleatorios) para cifrar tokens ChatGPT y API Keys BYOK
AI_VAULT_SECRET=<secreto-aleatorio-de-32-o-mas-caracteres>

# Opcional: Sentry Developer gratis o GlitchTip self-hosted
SENTRY_DSN=
SENTRY_ENVIRONMENT=nas
```

## 3. Levantar el stack y aplicar migraciones
Desde la raíz del repositorio en tu NAS:

```bash
docker compose -f docker/compose.nas.yml up -d --build
```

Aplica las migraciones Drizzle (la API las ejecuta automáticamente al arrancar cuando `AUTO_MIGRATE=true`, y también pueden lanzarse manualmente; tablas `users`, `sessions`, `accounts`, `categories`, `transactions`, `command_log`, `fx_rates`, `recurring_rules`, `investments`, `net_worth_items`, `ai_connections`, `ai_oauth_states`):

```bash
docker compose -f docker/compose.nas.yml exec api node apps/api/dist/db/migrate.js
```
*(O en desarrollo local con PostgreSQL levantado: `pnpm --filter @agenticf/api db:migrate`.)*

Comprueba salud del sistema:
- `GET http://<IP-NAS>:8080/health` → `{ "status": "ok", "stateless": true }`
- `GET http://<IP-NAS>:8080/ready` → `{ "status": "ready", "database": "up" }`

## 4. Copias de seguridad automáticas de PostgreSQL
Programa una tarea cron semanal/diaria en el NAS para volcar la base de datos:

```bash
docker exec expenses-ai-postgres-1 pg_dump -U agenticf agenticf | gzip > /volume1/backups/agenticf-$(date +%F).sql.gz
```

## 5. Migración futura a Cloud (V2-05 — AWS / Vercel / Kubernetes) sin tocar código
Porque `apps/api` es **100% stateless** (cero discos locales; sesiones, credenciales cifradas, caché FX y advisory locks viven en PostgreSQL):
- **Frontend (`apps/web`):** desplegable directamente en **Vercel** o **AWS S3 + CloudFront**.
- **Backend (`apps/api`):** la misma imagen `docker/api.Dockerfile` corre en **AWS App Runner / ECS Fargate / EKS** con **Amazon RDS PostgreSQL 17** y **Terraform**.
