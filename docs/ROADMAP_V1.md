# Plan Maestro V1 — 6 Bloques y 16 Seeds ODD

> Cada Seed se gestiona en `C:\Users\teylo\ODD\04_Seeds\` siguiendo el ciclo `/odd-seed` → `/odd-grow` → `/odd-prune` → `/odd-harvest`.
> Las funcionalidades diferidas a V2 se mantienen trazadas en [BACKLOG_V2.md](./BACKLOG_V2.md) desde el Bloque 1.

---

## Bloque 1: Cimientos, Metodología ODD, Infraestructura Stateless y Backlog V2

### Seed 01 — Bootstrap ODD, Monorepo TypeScript, Roadmap V1 y Backlog V2
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** `[TDD-SKIP]` (configuración, documentación y esqueleto de workspaces; verificado con `pnpm install`, `pnpm build` y `pnpm typecheck`).
- **Alcance:**
  - Vincular `AGENTS.md`, `CLAUDE.md` y `.agent/rules/odd.md` a `C:\Users\teylo\ODD`.
  - Documentar `docs/DECISIONS.md`, `docs/ROADMAP_V1.md` y `docs/BACKLOG_V2.md`, y actualizar `C:\Users\teylo\ODD\06_Architecture\System_Overview.md`.
  - Inicializar Git + `pnpm` workspaces + `Turborepo` (`packages/domain`, `apps/api`, `apps/web`).

### Seed 02 — Quality Gates, Lefthook Pre-Push & Seguridad en CI
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** `[TDD-SKIP]` en configs + test canario en Vitest y validación real de hooks/CI.
- **Alcance:**
  - Biome (lint + format), Vitest workspace, Lefthook `pre-push` bloqueante (`typecheck` + `lint` + `test` + `gitleaks`).
  - Workflow GitHub Actions (`pnpm audit`, Gitleaks, Semgrep OSS).

### Seed 03 — Docker Stateless + PostgreSQL 17 + Drizzle ORM + Sentry
- **Estado:** ✅ Harvested *(cerrado con evidencia — Bloque 1 completado)*
- **Modo TDD:** **Strict TDD** en `/health`, `/ready` y filtro de *scrubbing* de datos financieros/secretos en Sentry; `[TDD-SKIP]` en Dockerfiles/compose.
- **Alcance:**
  - `docker/compose.dev.yml` y base `docker/compose.nas.yml` (Caddy proxy).
  - Servidor Fastify stateless, conexión Drizzle ORM a Postgres 17, migraciones iniciales y Sentry backend/frontend.

---

## Bloque 2: Núcleo de Dominio Financiero, Multimoneda, MultiHora e i18n

### Seed 04 — Motor de Dinero (`decimal.js`), Formateo Configurable (`.` / `,`) y Paréntesis Multimoneda
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **100% Strict TDD**.
- **Alcance:**
  - Aritmética decimal exacta en `packages/domain` (0 floats).
  - Formateador configurable (`.` / `,`) y renderizado dual `2.000,00 $ (1.819,32 €)` para divisas distintas a la principal (JPY 0 dec., EUR/USD 2 dec., crypto hasta 8 dec.).

### Seed 05 — Motor MultiHora (Timezones) + i18n (`ES` / `EN`)
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Conversión determinista UTC ↔ `localDate` según zona horaria del usuario (incluyendo cambios horario/DST).
  - Infraestructura multiidioma preparada con diccionarios completos `es` y `en` compartidos.

### Seed 06 — Servicio Gratuito de Divisas (FX Engine + Cache Offline/BD)
- **Estado:** ✅ Harvested *(cerrado con evidencia — Bloque 2 completado)*
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Adaptador `Frankfurter API` (BCE) + fallback `exchange-api` (CDN).
  - Tabla `fx_rates`, job diario con `PostgreSQL advisory lock` y endpoint para cachear tasas en IndexedDB offline.

---

## Bloque 3: Identidad, Seguridad de Credenciales y Motor de Comandos + Undo

### Seed 07 — Autenticación Email+Password, Sesiones Stateless & Preferencias
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Registro/login con `@node-rs/argon2`, cookies `HttpOnly` con sesión en PostgreSQL, rate-limit en endpoints sensibles.
  - Preferencias de usuario (moneda principal, timezone, idioma `es`/`en`, formato `.`/`,`, confirmación previa del agente ON/OFF).

### Seed 08 — Motor de Comandos (`CommandBus`), Simulador de Impacto & `Undo` Global
- **Estado:** ✅ Harvested *(cerrado con evidencia — Bloque 3 completado)*
- **Modo TDD:** **100% Strict TDD**.
- **Alcance:**
  - Contrato único de Comandos Zod compartidos UI ↔ Agente, idempotencia por `commandId` (UUIDv7) en `command_log`.
  - `simulateCommandImpact(state, command)` y comando `command.undo` reversible para acciones manuales y del agente.

---

## Bloque 4: Core Financiero V1 (Cuentas, Movimientos, Offline-First y Recurrentes)

### Seed 09 — Cuentas (Bancos, Efectivo, Ahorro, Crédito) & Saldos Consolidados
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - CRUD de cuentas en cualquier moneda, cálculo de **Saldo por Cuenta**, **Saldo en Efectivo** y **Saldo Total** en moneda principal (con paréntesis multimoneda).

### Seed 10 — Ingresos, Gastos, Categorías & Transferencias entre Cuentas
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Gestión de ingresos/gastos con tipo y categoría, transferencias entre cuentas propias (sin inflar gastos ni ingresos).
  - Campos `source` (`manual | agent | recurring | csv_import | bank_sync`) y `externalId` preparados para V2 + botón de Undo inmediato.

### Seed 11 — PWA Offline-First: IndexedDB (`Dexie.js`) + Cola `Outbox` & Sincronización
- **Estado:** ✅ Harvested *(cerrado con evidencia)*
- **Modo TDD:** **Strict TDD** en la máquina de estados de la cola `Outbox`.
- **Alcance:**
  - `vite-plugin-pwa` (Workbox), almacenamiento local `Dexie.js`, ejecución optimista de comandos manuales offline y sync idempotente al reconectar.

### Seed 12 — Gastos e Ingresos Recurrentes (Nóminas, Suscripciones, Alquiler)
- **Estado:** ⚪ Pendiente
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Reglas recurrentes (diaria, semanal, mensual día X, trimestral, anual) respetando zona horaria (incl. meses de 28/30/31 días).
  - Worker scheduler con `PostgreSQL advisory lock` e historial reversible con Undo.

---

## Bloque 5: Analítica, Ahorro, Inversiones, Patrimonio y Exportación

### Seed 13 — Analítica (Diario, Semanal, Mensual, Trimestral, Anual) & Cálculo de Ahorro
- **Estado:** ⚪ Pendiente
- **Modo TDD:** **100% Strict TDD**.
- **Alcance:**
  - Motor de agregación por periodos (diario, semanal, mensual, trimestral, anual) en moneda principal.
  - Cálculo de ahorro neto y tasa de ahorro (%), gráficos en Recharts.

### Seed 14 — Inversiones (V1 Manual/Asistida), Patrimonio Neto (Activos + Pasivos) & Export CSV
- **Estado:** ⚪ Pendiente
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - Registro/edición de inversiones (crypto, acciones, ETFs, fondos) sin feed en vivo en V1.
  - Patrimonio neto: activos no líquidos (casas, coches, cartas/coleccionables) menos pasivos/deudas (hipotecas, préstamos).
  - Exportación completa a CSV respetando idioma y formato `.`/`,` del usuario.

---

## Bloque 6: Agente Financiero (Plan Sharing + BYOK + Push-to-Talk + Guardrails) y Despliegue NAS

### Seed 15 — Conectores IA (*Sign in with ChatGPT Plan Sharing* + BYOK Cifrado) & Orquestador del Agente con Guardrails
- **Estado:** ⚪ Pendiente
- **Modo TDD:** **Strict TDD**.
- **Alcance:**
  - OAuth 2.0 + PKCE con **Sign in with ChatGPT (Plan Sharing)** (login directo o vinculación desde Email+Password).
  - Almacén cifrado AES-256-GCM para BYOK multi-modelo (fallback automático si falla/agota cuota).
  - Orquestador con Vercel AI SDK conectado al `CommandBus` y **Guardrail estricto**: rechaza uso como chatbot generalista y genera propuesta de confirmación con impacto exacto (o ejecuta directo si está desactivada).

### Seed 16 — UI Omnicanal (Botón Siempre Visible Chat + Push-to-Talk Gratis), E2E Playwright & Pack NAS Ugreen DXP2800
- **Estado:** ⚪ Pendiente
- **Modo TDD:** E2E Playwright en flujos críticos; `[TDD-SKIP]` en estilos finales y guía de despliegue.
- **Alcance:**
  - Botón flotante siempre visible con Chat + **Push-to-Talk (`Web Speech API` ES/EN)**.
  - Tarjeta de confirmación de impacto exacto + botón de Undo tras ejecución.
  - Suite Playwright E2E y `docker/compose.nas.yml` + guía paso a paso para **Ugreen DXP2800** (HTTPS con Tailscale / Cloudflare Tunnel).
