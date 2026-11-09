# Evidencia T08 — 10 confirmaciones concurrentes, un solo incremento (HU-06)

Fecha: 2026-11-08 · Región: us-east-2 · Stage: academic · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: host del API reemplazado; no se muestran tokens, sub ni emails.

## T08 — misma donación confirmada 10 veces en paralelo (CA-06.2, RNF-HU-04)

Donación de S/ 25,00 (`amountCents: 2500`) en estado PENDIENTE_SIMULACION; 10 solicitudes simultáneas
`POST /v1/donations/{id}/simulate {"outcome":"CONFIRMADA_SIMULADA"}` lanzadas con `xargs -P10`.

```text
      1 200
      9 409
confirmedAmountCents antes=0 después=2500
```

Solo la primera transición tiene éxito: el update condicionado (`status = PENDIENTE_SIMULACION AND donorSub = :sub`),
el `ADD confirmedAmountCents` y el AuditEvent van en un único `TransactWriteItems`.

## Casos complementarios

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Rechazar una donación pendiente (CA-06.3) | 200, el total no cambia | 200; 2500 → 2500 |
| Confirmar una donación ya confirmada | 409 | 409 |
| `outcome` inválido (`PAGADA`) | 400 | 400 |
| Ruta sin token | 401 | 401 |
