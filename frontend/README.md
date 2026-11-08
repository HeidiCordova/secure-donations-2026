# AQP-SOLIDARIA — Frontend

SPA de React, TypeScript, Vite y Tailwind CSS para consultar los proyectos solidarios y autenticarse con Amazon Cognito mediante OIDC Authorization Code + PKCE. Los tokens de usuario se mantienen en memoria y el estado temporal del flujo OIDC usa `sessionStorage`.

## Requisitos

- Node.js compatible con Vite 8.
- npm.
- URL de la API y una aplicación cliente de Cognito configuradas para el flujo Authorization Code, con las URI de retorno y cierre de sesión autorizadas.

## Configuración

1. Copia `.env.example` a `.env.local`.
2. Completa las variables:

| Variable                 | Descripción                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`           | URL base HTTPS de la API, sin `/` final.                                                            |
| `VITE_COGNITO_AUTHORITY` | Emisor OIDC del User Pool, por ejemplo `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>`. |
| `VITE_COGNITO_DOMAIN`    | Dominio Hosted UI de Cognito, con o sin `https://`.                                                 |
| `VITE_COGNITO_CLIENT_ID` | ID de la aplicación cliente pública del SPA.                                                        |
| `VITE_REDIRECT_URI`      | URI de retorno OIDC registrada en Cognito (por ejemplo `http://localhost:5173/callback`).           |
| `VITE_LOGOUT_URI`        | URI posterior al cierre de sesión registrada en Cognito (por ejemplo `http://localhost:5173/`).     |
| `VITE_SCOPES`            | Scopes OIDC separados por espacios; normalmente `openid email profile`.                             |

No agregues secretos ni credenciales AWS a las variables del frontend. Las variables `VITE_*` se incorporan al bundle del navegador.

## Ejecución y validación

Desde esta carpeta:

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

`npm run dev` inicia el servidor local de Vite; `npm run typecheck` valida TypeScript sin emitir archivos y `npm run build` ejecuta la compilación de TypeScript y genera el bundle en `dist/`.
