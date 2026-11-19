# Decisiones de Producto, Arquitectura y Stack — AgenticF

> Registro de decisiones cerradas con el usuario durante el descubrimiento inicial (2026-11-19).

## 1. Visión y Principio Agentic-First
- **Producto:** Aplicación de finanzas personales **Web + Mobile (PWA)** diseñada como *agentic-first*.
- **Paridad Total UI ↔ Agente:** Todas las acciones de negocio pueden ejecutarse manualmente desde la interfaz o delegarse al agente interno mediante un botón siempre visible (**Chat de texto + Push-to-Talk por voz**).
- **Motor IA por Niveles:**
  1. **Base:** **Sign in with ChatGPT con *Plan Sharing*** (OAuth 2.0 + PKCE).
  2. **Fallback 1:** **API Key propia (BYOK)** de OpenAI o cualquier modelo compatible (cifrada con AES-256-GCM).
  3. **Fallback 2:** **Modo 100% manual** siempre funcional cuando no hay cuota, no hay IA configurada o no hay conexión.
- **Restricción de Dominio (Guardrails):** El agente **no puede utilizarse como chatbot genérico**, aunque use la suscripción de ChatGPT. Solo responde consultas financieras del usuario y propone o ejecuta acciones de la aplicación.
- **Confirmación y Deshacer (*Undo*):**
  - Antes de aplicar cambios, el agente presenta una alerta/tarjeta de confirmación en texto con el **impacto exacto** (p. ej. *"Nuevo ingreso: tu saldo pasará de 3.000,00 € a 5.000,00 € por pago de Y por trabajo X"*).
  - La confirmación previa es **desactivable** por el usuario en ajustes.
  - **Deshacer (*Undo*) global:** disponible tanto para cambios realizados por el agente como por el usuario manualmente.

## 2. Audiencia, Escala e Infraestructura
- **Escala inicial:** Empieza con 1 usuario para pruebas reales, pero nace pública, multiusuario y preparada desde el día 1 para **≥ 100 usuarios recurrentes**.
- **Arquitectura 100% Stateless:** El backend (`apps/api`) no mantiene estado local en disco; sesiones, credenciales cifradas, caché FX y locks de tareas (`PostgreSQL advisory locks`) residen en PostgreSQL.
- **Contenedores & Despliegue:**
  - **Docker** desde el principio (`compose.dev.yml` y `compose.nas.yml`).
  - Pruebas reales en NAS **Ugreen DXP2800** (con HTTPS vía Tailscale / Cloudflare Tunnel).
  - Preparada para migrar sin refactorizar código a **AWS** (S3 + CloudFront, App Runner / ECS / EKS, RDS) o **Vercel** (`apps/web`) + backend Docker, incorporando **Terraform** y/o **Kubernetes** en V2 si la escala lo justifica.

## 3. Alcance Funcional V1
- **Saldos:** Saldo total consolidado (en moneda principal), saldo por cuenta (banco, ahorro, crédito) y saldo en efectivo (*cash*).
- **Movimientos:** Ingresos (*Incomes*) y Gastos (*Expenses*) con tipo y categoría, además de **Transferencias entre cuentas propias** (sin distorsionar ingresos/gastos).
- **Recurrentes:** Ingresos y gastos recurrentes programados (nómina el día X, alquiler, suscripciones, etc.).
- **Multimoneda y Formato:**
  - Moneda principal configurable (p. ej. `EUR`, `USD`).
  - Cualquier cuenta o movimiento en divisa extranjera muestra **entre paréntesis su equivalente en la moneda principal** (ej.: `2.000,00 $ (1.819,32 €)`).
  - Separador de miles (`.` o `,`) y decimales (`,` o `.`) configurables por el usuario.
  - Tipos de cambio gratuitos diarios cacheados en backend y replicados offline (**Frankfurter API** + fallback **exchange-api**), más override manual por operación.
- **MultiHora & Multiidioma:**
  - Soporte completo de **zonas horarias** (corte de día exacto y disparo de recurrentes en la hora local del usuario).
  - **i18n** listo para múltiples idiomas, arrancando con **Español (`es`) e Inglés (`en`)**.
- **Analítica y Ahorro:** Cálculo de gasto e ingreso **diario, semanal, mensual, trimestral y anual**, junto con **cálculo de ahorro** neto y tasa de ahorro.
- **Inversiones (V1 manual/asistida):** Ver y modificar posiciones (crypto, acciones, ETFs, fondos, etc.) sin feeds de precios en tiempo real en V1.
- **Patrimonio Neto (*Net Worth*):** Activos no líquidos (casas, coches, cartas/coleccionables, etc.) y pasivos/deudas (hipotecas, préstamos) que suman/restan al patrimonio neto.
- **Exportaciones:** Exportación a **CSV** (cuentas, movimientos, inversiones y patrimonio).
- **Offline-First (PWA):** IndexedDB local (`Dexie.js`) + Cola de Comandos (`Outbox`) propia con sincronización automática e idempotente al recuperar conexión.

## 4. Autenticación
- Usuarios sin suscripción de ChatGPT pueden registrarse con **Email + Contraseña** (Argon2id + sesiones en PostgreSQL).
- Usuarios con ChatGPT pueden usar **Sign in with ChatGPT (Plan Sharing)** o vincular su cuenta Email+Password existente.
- Se omite login con Google por ahora para evitar confusión con el uso de Gemini.
- Arquitectura abierta para migrar/vincular en el futuro cuentas de Claude u otros proveedores por suscripción.

## 5. Stack Tecnológico (100% Gratuito / Open Source)
- **Monorepo:** `pnpm` + `Turborepo`, **100% TypeScript** estricto.
- **Frontend (`apps/web`):** React 19 + Vite + `vite-plugin-pwa` (Workbox) + Tailwind CSS v4 + shadcn/ui + Lucide + Recharts + TanStack Query + Dexie.js.
- **Dominio compartido (`packages/domain`):** Zod + `decimal.js` + CommandBus + Simulador de Impacto + i18n (`es`/`en`).
- **Backend (`apps/api`):** Node.js 22 LTS + Fastify + `@fastify/type-provider-zod` + Drizzle ORM + PostgreSQL 17 + `@node-rs/argon2` + Arctic (OAuth2/PKCE) + Vercel AI SDK (`ai`) + `croner` (con PostgreSQL advisory locks).
- **Voz Push-to-Talk:** `Web Speech API` nativa (0 €), con degradación limpia a chat de texto.
- **Calidad, Seguridad y Errores:** Biome, Vitest, Playwright, Lefthook (bloqueo pre-push), Sentry Developer / GlitchTip compatible (con *scrubbing* financiero), AES-256-GCM para secretos en BD, Gitleaks + `pnpm audit` + Semgrep OSS en GitHub Actions.
- **Metodología:** ODD + Conditional TDD en `C:\Users\teylo\ODD`.
