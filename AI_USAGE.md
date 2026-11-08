# Declaración de uso de IA

Registro según design.md §10.

| Fecha      | Herramienta        | Participantes | Tareas asistidas                                         | Aportes IA                                                          | Validación humana                                                  | Limitaciones                                                                                       |
| ---------- | ------------------ | ------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 2026-11-07 | Claude (Anthropic) | Heidi         | Scaffolding del repo, CI y módulo `authz`                | Propuesta inicial de configuración y código (PR #1)                 | Revisado, ajustado y probado por Heidi (lint, typecheck, 13 tests) | Pasos de AWS contrastados con la documentación oficial                                             |
| 2026-11-07 | Claude (Anthropic) | Maria         | OpenAPI y esquemas Zod (HU-05, HU-08)                    | Propuesta de `docs/api.yaml`, `schemas.ts`, `validation.ts` y tests | Revisado y ejecutado por Maria (lint, typecheck, tests, build)     | Contrato a ajustar cuando exista la plantilla SAM                                                  |
| 2026-11-07 | Claude (Anthropic) | Maria         | Módulo projects y auditoría (HU-01, HU-02, HU-08, HU-09) | Handlers, repositorio DynamoDB, AuditEvents y 39 tests              | Revisado y ejecutado por Maria (lint, typecheck, 84 tests, build)  | Repositorio probado con cliente DynamoDB simulado; falta prueba contra AWS cuando estén las tablas |

Todo cambio asistido por IA entra por PR revisado por otro integrante.
