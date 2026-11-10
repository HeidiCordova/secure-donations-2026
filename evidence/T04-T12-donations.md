# Evidencia T04–T07, T09 y T12 — módulo donations (stage academic)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: host del API reemplazado; el texto enmascara `donorSub` y no muestra tokens ni emails. La captura T05 aún requiere ocultar el `donorSub` y no debe publicarse en su estado actual.
Usuarios: `donante1` y `donante2` (grupo DONANTE), `gestor1` (grupo GESTOR).

## T05 — intención de donación válida (HU-05)

```text
POST /v1/donations  Idempotency-Key: <uuid-1>  {"projectId":"22a333fb-…","amountCents":5000}
HTTP/2 201
{"donationId":"5752b34a-8d41-46a0-9d79-53686bf46348","projectId":"22a333fb-9c6d-4c87-b01c-bc614313fd30","donorSub":"<sub-donante1>","amountCents":5000,"currency":"PEN","status":"PENDIENTE_SIMULACION",…}
```

Las estadísticas del proyecto siguen en `confirmedAmountCents: 0`: una intención no suma hasta confirmarse (HU-06).

## T06 — reintento con la misma clave y el mismo body (CA-05.4)

```text
HTTP/2 201
idempotent-replayed: true
{"donationId":"5752b34a-8d41-46a0-9d79-53686bf46348", …}   ← mismo donationId
```

## T07 — misma clave con otro body

```text
HTTP/2 409
{"code":"IDEMPOTENCY_MISMATCH","message":"La clave de idempotencia ya se usó con otra solicitud",…}
```

## Validación y estado del proyecto (CA-05.1, CA-05.2)

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Sin `Idempotency-Key` | 400 | 400 |
| T04: `amountCents: 50` (mínimo 100) | 400 | 400 |
| Campo extra `donorSub` en el body | 400 | 400 |
| Proyecto inexistente | 404 | 404 |
| Proyecto en BORRADOR | 409 | 409 |

## Concurrencia — 10 solicitudes simultáneas con la misma clave

```text
10 × HTTP 201
donaciones nuevas en el historial: 1
```

## T09 — donación ajena (anti-BOLA, CA-07.2)

```text
donante1 GET /v1/donations/5752b34a-…  → 200
donante2 GET /v1/donations/5752b34a-…  → 404
donante2 GET /v1/donations/me          → {"items":[]}
```

La captura válida de T09 debe corresponder a la solicitud con la variable `secondDonorAccessToken` resuelta y mostrar `404`. Una ejecución con la variable vacía que devuelve `401` no valida el control de ownership y no se usa como evidencia del resultado.

## T11 — ID token sin scopes y JWT alterado (CA-03.2, CA-NF02.1)

| Credencial usada como `Authorization` | Resultado observado |
|---|---|
| ID token con firma válida, sin los scopes de API | `403 Forbidden` |
| Access token con firma alterada | `401 Unauthorized` |

## T12 — un GESTOR no accede a historiales de donación

```text
gestor1 GET /v1/donations/me → 403
```
