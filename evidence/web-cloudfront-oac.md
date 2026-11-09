# Evidencia — SPA en S3 privado + CloudFront con OAC y cabeceras de seguridad (RNF-HU-01, RNF-HU-11)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: el account ID del dominio de Cognito se reemplazó por `<account>`.

## Despliegue

```text
$ scripts/deploy-web.sh /tmp/web
upload: index.html to s3://aqp-solidaria-academic-webbucket-<id>/index.html
Desplegado en https://dna6huvee0ra8.cloudfront.net
```

## Cabeceras de seguridad (Response Headers Policy de CloudFront)

```text
$ curl -sI https://dna6huvee0ra8.cloudfront.net/
HTTP/2 200
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://aqp-solidaria-academic-<account>.auth.us-east-2.amazoncognito.com; connect-src 'self' https://<api-id>.execute-api.us-east-2.amazonaws.com https://aqp-solidaria-academic-<account>.auth.us-east-2.amazoncognito.com https://cognito-idp.us-east-2.amazonaws.com
x-content-type-options: nosniff
strict-transport-security: max-age=31536000; includeSubDomains
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

## Rutas de la SPA y bucket privado

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Ruta del router (`/proyecto/123`) vía CloudFront | 200 (devuelve `index.html`) | 200 |
| Acceso directo al bucket S3 | 403 (solo CloudFront lee, mediante OAC) | 403 Forbidden |
