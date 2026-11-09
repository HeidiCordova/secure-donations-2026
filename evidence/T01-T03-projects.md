# Evidencia T01 y T03 — módulo projects (stage academic)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: host del API reemplazado; no se muestran tokens, `sub` ni emails.
`API=https://<api-id>.execute-api.us-east-2.amazonaws.com/academic`

## T01 — catálogo público sin autenticación (HU-01)

```text
$ curl -s -i "$API/v1/projects"
HTTP/2 200
{"items":[]}
```

## T03 — un DONANTE no puede crear proyectos (CA-04.1)

El token del donante incluye el scope `api/projects.write`, así que el PEP (API Gateway) lo deja pasar.
El PE (Lambda, módulo `authz`) lo rechaza por no pertenecer al grupo GESTOR.

```text
$ curl -s -i -X POST "$API/v1/projects" -H "Authorization: Bearer $DONANTE" -d "$BODY"
HTTP/2 403
{"code":"FORBIDDEN","message":"No tiene permisos para esta operación","requestId":"Ghcuxhp7iYcEMEQ="}
```

## Flujo complementario (HU-02, HU-08, HU-09)

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| POST sin token | 401 | 401 |
| GESTOR crea proyecto | 201, BORRADOR, monto confirmado 0 | 201, BORRADOR, 0 |
| Catálogo con solo un BORRADOR | lista vacía | `{"items":[]}` |
| Detalle de un BORRADOR | 404 | 404 |
| Publicar | 200 | 200 |
| Publicar de nuevo | 409 | 409 |
| Catálogo después de publicar | aparece PUBLICADO | aparece PUBLICADO |
| Stats | solo agregados | `{"goalAmountCents":500000,"confirmedAmountCents":0,"currency":"PEN"}` |

## Auditoría (CA-08.3, CA-10.2)

Actor seudonimizado; sin `sub`, emails, tokens ni cuerpos de solicitud.

```text
| 2026-11-08T13:10:29.111Z | PROJECT_CREATE  | DENIED   | actor_cc7243d8c9b86d05 |
| 2026-11-08T13:10:29.631Z | PROJECT_CREATE  | SUCCESS  | actor_c9041b20fb5c7865 |
| 2026-11-08T13:10:32.153Z | PROJECT_PUBLISH | SUCCESS  | actor_c9041b20fb5c7865 |
| 2026-11-08T13:10:32.815Z | PROJECT_PUBLISH | CONFLICT | actor_c9041b20fb5c7865 |
```
