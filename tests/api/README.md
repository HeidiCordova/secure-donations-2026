# Pruebas de API (Barbara)

Colección [Bruno](https://www.usebruno.com/) con T01–T14 contra el stage `academic`.

- Un entorno por rol: `visitante`, `donante`, `donante2`, `gestor`, `auditor`.
- En `academic.bru`, `vars` contiene solo `baseUrl`; configura `cognitoDomain` y `clientId` como variables secretas locales de Bruno. No guardes sus valores en el repo.
- La colección usa OAuth2 Authorization Code + PKCE, callback `http://localhost:5173/callback` y envía el access token como Bearer. T01 no envía token; T03 hereda la autorización de colección.
- Los tokens y otros valores de entorno reales van en variables locales o GitHub Secrets, nunca en el repo.
