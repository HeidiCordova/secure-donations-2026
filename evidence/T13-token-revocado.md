# Evidencia T13 — token revocado usado antes de expirar (limitación documentada)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: no se muestran tokens, sub ni emails.

```text
--- antes de revocar
GET /v1/donations/me (access token de donante1) → 200
$ aws cognito-idp admin-user-global-sign-out --user-pool-id <pool> --username <sub-donante1>
sesión revocada
--- después de revocar (mismo access token)
GET /v1/donations/me → 200
```

## Interpretación

`GlobalSignOut` revoca los refresh tokens, así que el usuario no puede renovar su sesión, pero el access token ya emitido sigue
siendo aceptado hasta que expira: el JWT authorizer de API Gateway valida firma, emisor, audiencia, vencimiento y scopes,
y no consulta a Cognito si el token fue revocado.

**Mitigación:** el access token dura 15 minutos (ventana máxima de exposición), y el refresh token queda revocado al
instante. Una verificación en línea por solicitud agregaría latencia y costo, y se descarta para este alcance.
