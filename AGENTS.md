# 🤖 Instrucciones Obligatorias para Agentes — AgenticF

Este repositorio sigue **Organic Driven Development (ODD)** con **Conditional TDD**, gestionado a través del Vault de Obsidian **ODD** en:

> **`C:\Users\teylo\ODD`**

## Reglas Obligatorias antes de Modificar Código

1. **Lee el protocolo ODD primero:**
   - [ODD_Master_Protocol.md](file:///C:/Users/teylo/ODD/01_Rules/ODD_Master_Protocol.md)
   - [Conditional_TDD_Policy.md](file:///C:/Users/teylo/ODD/01_Rules/Conditional_TDD_Policy.md)
   - [System_Overview.md](file:///C:/Users/teylo/ODD/06_Architecture/System_Overview.md)
2. **Revisa el contexto del proyecto en el repositorio:**
   - [docs/DECISIONS.md](docs/DECISIONS.md) — Decisiones de producto, arquitectura, stack y seguridad cerradas.
   - [docs/ROADMAP_V1.md](docs/ROADMAP_V1.md) — Plan maestro de 6 Bloques y 16 Seeds para V1.
   - [docs/BACKLOG_V2.md](docs/BACKLOG_V2.md) — Backlog oficial V2 y ganchos de compatibilidad que V1 debe preservar.
   - [docs/ODD_WORKFLOW.md](docs/ODD_WORKFLOW.md) — Resumen operativo de los 4 ciclos ODD, verificación por niveles y protocolo ante conflictos de decisiones.
3. **Detección de conflictos con decisiones cerradas:**
   - Si una petición contradice una decisión de `docs/DECISIONS.md` o adelanta algo de `docs/BACKLOG_V2.md`, **avisa explícitamente al usuario antes de implementar**.
   - Si el usuario confirma el cambio, actualiza en el mismo paso `docs/DECISIONS.md`, el ADR en `C:\Users\teylo\ODD\06_Architecture\System_Overview.md` y, si aplica, `docs/ROADMAP_V1.md` / `docs/BACKLOG_V2.md`.
4. **Flujo de trabajo ODD:**
   - Para tareas medianas o grandes (**M / L**), usa `/odd-seed` creando/actualizando la nota correspondiente en `C:\Users\teylo\ODD\04_Seeds\YYYY-MM-DD_<seed>.md` usando `C:\Users\teylo\ODD\03_Templates\Seed_Spec_Template.md`.
   - Implementa tarea por tarea siguiendo `/odd-grow`.
   - **Strict TDD (`RED → GREEN → REFACTOR`)** obligatorio en lógica de dominio (`packages/domain`), cálculos financieros, validaciones, reglas de seguridad, guardrails del agente, endpoints API y reproducción de bugs.
   - Si una tarea no requiere TDD (Dockerfiles, config CI, estilos/UI pura sin lógica), declara explícitamente **`[TDD-SKIP]`** con su razón y su verificación alternativa.
   - Al terminar un Seed, ejecuta `/odd-prune` (si aplica) y `/odd-harvest`: verifica con tests reales, linter y typecheck, pega la evidencia en el Seed, cámbialo a `status: harvested` y actualiza `C:\Users\teylo\ODD\06_Architecture\System_Overview.md` y `docs/ROADMAP_V1.md`.
   - **Estrategia Git obligatoria:** Usa **1 rama por Bloque** (`block/XX-<nombre>`) y realiza **1 commit atómico por Seed** al cerrar `/odd-harvest` (`<type>(seed-XX): <resumen>`). Al terminar el último Seed del Bloque, haz `git push` y **crea la Pull Request directamente contra `main`**.
5. **Restricciones de Arquitectura y Calidad:**
   - Todo el código (frontend y backend) es **TypeScript estricto** y **100% gratuito/open-source**.
   - `apps/api` debe mantenerse **100% stateless** (cero estado persistente en disco local).
   - Nunca usar `number`/coma flotante para cálculos monetarios; usar `decimal.js` en `packages/domain` y `numeric(20, 8)` en PostgreSQL.
   - Toda mutación financiera pasa por el `CommandBus` para garantizar paridad UI ↔ Agente, simulación de impacto, cola offline `Outbox` y `Undo` global.
   - Prohibido marcar tareas como completadas sin evidencia real de tests/typecheck/build tras la última edición.
