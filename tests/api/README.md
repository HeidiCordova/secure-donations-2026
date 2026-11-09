# Pruebas de API (Barbara)

Colección [Bruno](https://www.usebruno.com/) contra el stage `academic`. Las pruebas Bruno están definidas en la colección; sus resultados y capturas aún requieren ejecución local con credenciales válidas.

Comprobación HTTP sin credenciales ejecutada el 2026-11-08: T01 respondió `200` con 3 proyectos; T02 respondió `401`. Estos smoke checks no ejecutan el script de Bruno ni reemplazan sus capturas.

## Variables y tokens

- En el entorno `academic`, `vars` mantiene únicamente `baseUrl`.
- Configura `cognitoDomain` (URL HTTPS completa) y `clientId` como secretos locales de Bruno.
- Configura `donorAccessToken`, `secondDonorAccessToken`, `gestorAccessToken`, `idToken` y `tamperedAccessToken` en la sección **Secrets** del entorno. No los pegues en archivos `.bru`, variables normales, capturas, logs o commits.
- Usa tokens de prueba, de corta duración y del mismo app client. El token de DONANTE debe incluir `api/donations.write`, `api/donations.read` y `api/projects.write`; el de GESTOR debe incluir `api/donations.read`. El token alterado se prepara localmente modificando un access token de prueba y se almacena solo como secreto local.
- La configuración OAuth2 de colección sigue disponible para iniciar sesión con Authorization Code + PKCE, callback `http://localhost:5173/callback` y access token. Las solicitudes con distintos roles usan los secretos de token anteriores.

## Orden de ejecución

1. Ejecuta T01 para guardar el `projectId` del primer proyecto publicado en una variable Bruno de ejecución. El stage debe tener al menos un proyecto publicado para probar donaciones.
2. Ejecuta T02 y T03, luego los tres casos T04.
3. Ejecuta T05 una vez; guarda el `donationId` de la respuesta en una variable Bruno de ejecución.
4. Ejecuta T06 y T07 con el mismo DONANTE, proyecto, clave UUID y contenido inicial de T05.
5. Ejecuta T09 usando un segundo DONANTE distinto; consulta el `donationId` guardado por T05.
6. Ejecuta T11-ID-token y T11-JWT-alterado, y finalmente T12 con el token de GESTOR.

T06 espera `201`, `idempotent-replayed: true` y el mismo `donationId`; T07 espera `409`. T09 y T12 aceptan `403` o `404`, sin devolver datos de la donación ajena. La validación del ID token espera `403` (firma válida, sin scopes); el token alterado y la llamada sin token esperan `401`.

## Evidencia

No se han generado capturas de las pruebas T02–T12. Después de ejecutarlas, guarda evidencias sanitizadas bajo `evidence/` y anota el resultado observado en [la matriz de trazabilidad](../../docs/traceability.md). El token y datos personales deben ocultarse antes de capturar o integrar al informe.
