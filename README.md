# Plataforma de Donaciones Seguras — AQP-SOLIDARIA

Prototipo académico (Guía 04, Tópicos Avanzados en Ingeniería de Software — EPIS, UNSA) de una plataforma de **donaciones simuladas** con modelo de seguridad **Zero Trust** (NIST SP 800-207). No procesa pagos reales ni almacena datos de tarjeta.

- Especificación: [requirements.md](./requirements.md)
- Diseño: [design.md](./design.md)
- Declaración de uso de IA: [AI_USAGE.md](./AI_USAGE.md)

## Equipo

| Integrante | Rol                                     |
| ---------- | --------------------------------------- |
| Heidi      | Infraestructura, identidad y Zero Trust |
| Maria      | Backend de dominio                      |
| Rodrigo    | Frontend y accesibilidad                |
| Barbara    | Pruebas y documentación                 |

## Estructura

```text
frontend/        SPA React + Vite + Tailwind (Rodrigo)
backend/         Lambdas Node.js 24: projects, donations, authz, audit, shared
infra/           Plantilla AWS SAM (stage academic)
policies/        Políticas Cedar (extensión HU-12)
docs/            OpenAPI 3.1, threat model, mapeo NIST
tests/api/       Colección Bruno T01–T14
evidence/        Capturas sanitizadas y reportes de pruebas
```

## Requisitos locales

- Node.js 24 (ver `.nvmrc`) y npm 10+

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Cuenta AWS y restricciones

- **Tipo de cuenta:** AWS Free plan con la nueva experiencia de AWS (proyectos y AWS Builder ID). No existe usuario root; el acceso del dueño está protegido con MFA TOTP.
- **Región:** `us-east-2` (Ohio), asignada automáticamente por la cuenta según la información de contacto y no modificable. Se cumple el requisito de una sola región (CA-NF09.1); el design.md recomienda `us-east-1`, pero no es obligatorio.
- **Presupuesto:** alerta de AWS Budgets "Zero-Spend Budget" configurada.
- **Credenciales:** sin access keys de larga duración. Los despliegues se ejecutan desde AWS CloudShell (credenciales temporales; SAM CLI preinstalado).
- **Equipo en AWS:** la nueva experiencia no permite usuarios IAM con acceso a consola y da acceso de administrador a todo miembro invitado. Por mínimo privilegio solo se invita a quien lo necesita; el resto trabaja contra la URL del API. Ver informe (adaptación de CA-NF03.3).

**Fuentes (documentación oficial de AWS):**

- [Comparación de tipos de registro](https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html): en la nueva experiencia no se crea usuario root, los usuarios IAM son solo para acceso programático y la región se asigna automáticamente sin poder cambiarse.
- [Servicios soportados en la nueva experiencia](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html): Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront, CloudWatch, CloudFormation, IAM, CloudTrail, Verified Permissions y Budgets están en el Free Tier.
- [Registro de MFA en AWS Settings](https://docs.aws.amazon.com/accounts/latest/reference/register-mfa-devices.html): MFA TOTP sobre el AWS Builder ID.
- Evidencia: [`evidence/cuenta-aws/`](./evidence/cuenta-aws/)

## Despliegue

_Pendiente (día 2): `sam build` y `sam deploy` desde CloudShell._

## Limpieza

_Pendiente: `sam delete`, vaciado de buckets y verificación de recursos._

## Decisiones de versiones

| Herramienta | Versión | Motivo                                                                                                                                                                    |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript  | 6.0.3   | La última estable es 7.0.x, pero `typescript-eslint` 8.72 solo soporta `typescript >=4.8.4 <6.1.0`. Se fija la 6.0.x para mantener lint y typecheck en CI (design.md §2). |
| ESLint      | 10.14.0 | Compatible con `typescript-eslint` 8.72.                                                                                                                                  |
| Vitest      | 5.1.0   | Requiere Node `^22.12 \|\| ^24`.                                                                                                                                          |
| Node.js     | 24      | Runtime `nodejs24.x` de Lambda.                                                                                                                                           |

## Reglas del repositorio

- `main` protegida: PR obligatorio con 1 aprobación de otro integrante, sin force push.
- Nada de llaves, tokens, contraseñas, `.env` ni datos personales reales.
- Todo cambio asistido por IA se registra en `AI_USAGE.md`.

> Prototipo académico. Un despliegue real exigiría evaluación legal peruana (Ley N.º 29733), PSP, antifraude y revisión de cumplimiento.
