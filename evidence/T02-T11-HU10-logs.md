# Evidencia T02, T11, HU-10 y observabilidad (stage academic)

Fecha: 2026-11-09 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: no se muestran tokens, `sub` ni emails. Usuarios: `donante1` (DONANTE) y `auditor1` (AUDITOR, con MFA TOTP).

## T02 — ruta privada sin token (CA-03.2)

```text
GET /v1/donations/me (sin Authorization) → 401
```

## T11 — tokens inválidos o del tipo equivocado (CA-03.3)

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| ID token válido de donante1 (firmado por Cognito, pero sin scopes) | 403 | 403 |
| Access token con el payload editado: `cognito:groups` DONANTE → GESTOR y scope `api/projects.write` agregado (`POST /v1/projects`) | 401 | 401 |
| Access token con la firma modificada | 401 | 401 |
| Control: el mismo access token sin modificar | 200 | 200 |

Intentar escalar privilegios editando el token falla: el JWT authorizer de API Gateway (PEP) verifica la firma RS256
con las claves públicas (JWKS) del user pool antes de mirar los grupos o scopes.

> Nota metodológica: cambiar solo el último carácter de la firma puede no alterarla, porque en base64url ese carácter
> incluye bits de relleno que se descartan al decodificar. Por eso la firma se modifica en el medio y se falsifica el payload.

## CA-NF10.1 — la respuesta no expone el `sub` del donante

```text
POST /v1/donations → 201
{"donationId":"2b056337-…","projectId":"97bbc5e1-…","amountCents":1500,"currency":"PEN","status":"PENDIENTE_SIMULACION",…}
```

Sin `donorSub` en la respuesta (#23).

## HU-10 — consulta de auditoría solo para AUDITOR (CA-10.1, CA-10.2)

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Sin token | 401 | 401 |
| DONANTE con token válido | 403 | 403 |
| AUDITOR con un tipo de evento inválido (`type=HACK`) | 400 | 400 |
| AUDITOR (`type=DONATION_CREATE&limit=3`) | 200 | 200 |

```json
{
  "items": [
    {
      "eventId": "4731b594-145d-45fc-9c7b-e4d74bc76ec5",
      "timestamp": "2026-11-10T02:26:10.326Z",
      "requestId": "GmkORhiuiYcEJaQ=",
      "actorRef": "actor_e4947bdb4f8d8545",
      "action": "DONATION_CREATE",
      "resourceRef": "donation:2b056337-d700-401e-937d-c8735b4a6f6a",
      "outcome": "SUCCESS"
    }
  ],
  "nextToken": "…"
}
```

Solo los 7 campos del contrato y el actor seudonimizado; paginado con `nextToken`.

## CA-NF07.1 / CA-NF07.2 — un log JSON por request (CloudWatch Logs Insights)

```text
fields @timestamp, action, statusCode, outcome, durationMs, errorCode | filter ispresent(action) | sort @timestamp desc

2026-11-10 02:26:11.612  AUDIT_LIST          200  SUCCESS  381
2026-11-10 02:26:11.106  AUDIT_LIST          400  INVALID   40  VALIDATION_ERROR
2026-11-10 02:26:10.404  DONATION_CREATE     201  SUCCESS  602
2026-11-10 02:26:09.191  DONATION_LIST_MINE  200  SUCCESS  311
2026-11-10 02:26:08.249  PROJECT_LIST        200  SUCCESS  239
```

Los rechazos 401 y 403 del PEP no llegan a la Lambda: los corta API Gateway antes de invocarla.

## CA-NF01.2 — los logs no contienen secretos

```text
fields @message | filter @message like /eyJ/ or @message like /donorSub/
(0 resultados)
```
