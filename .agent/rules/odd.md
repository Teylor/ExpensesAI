# Regla de Workspace: ODD + Conditional TDD (`C:\Users\teylo\ODD`)

Todo agente que trabaje en `c:\Users\teylo\Desktop\AgenticF` debe seguir el protocolo **Organic Driven Development (ODD)** del vault `C:\Users\teylo\ODD`:

1. Antes de editar código, leer `AGENTS.md`, `C:\Users\teylo\ODD\01_Rules\ODD_Master_Protocol.md`, `C:\Users\teylo\ODD\01_Rules\Conditional_TDD_Policy.md` y `C:\Users\teylo\ODD\06_Architecture\System_Overview.md`.
2. Consultar `docs/DECISIONS.md`, `docs/ROADMAP_V1.md` y `docs/BACKLOG_V2.md` para respetar el alcance V1 y los puntos de extensión V2.
3. Trabajar por Seeds en `C:\Users\teylo\ODD\04_Seeds\` (`/odd-seed` → `/odd-grow` → `/odd-prune` → `/odd-harvest`).
4. Aplicar **Strict TDD** (`RED → GREEN → REFACTOR`) por defecto en dominio, cálculos de dinero/divisas/zonas horarias, seguridad, comandos y APIs; declarar `[TDD-SKIP]` explícito con verificación alternativa solo en configuración, infraestructura o UI visual pura.
5. Mantener la arquitectura **100% stateless**, TypeScript estricto y comandos unificados UI ↔ Agente.
