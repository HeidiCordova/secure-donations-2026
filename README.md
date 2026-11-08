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

## MFA para roles privilegiados (CA-11.1)

En Cognito el MFA se configura por user pool, no por grupo. El pool está en `OPTIONAL`, con TOTP como único segundo factor (sin SMS), y se aplica este control compensatorio:

1. Cada usuario de GESTOR y AUDITOR registra una app autenticadora (TOTP) y la deja como método preferido; desde ahí Cognito le pide el código en cada inicio de sesión (T14).
2. `scripts/check-mfa.sh <user-pool-id>` verifica que todos los usuarios de GESTOR y AUDITOR tengan TOTP activo, y falla si alguno no lo tiene.
3. Enrolamiento temporal: el scope `aws.cognito.signin.user.admin` solo existe en el cliente mientras se enrola a alguien. Se abre con `sam deploy --parameter-overrides Stage=academic WebOrigin=<WebUrl> MfaEnrollment=open`; el usuario inicia sesión pidiendo ese scope y se ejecutan `associate-software-token` → `verify-software-token` → `set-user-mfa-preference`. Al terminar se cierra con un `sam deploy` normal (`MfaEnrollment=closed` por defecto). Cerrado, un access token robado no puede desactivar el MFA.
4. Riesgo residual: mientras el enrolamiento está abierto (minutos), un token con ese scope podría cambiar el MFA de su propio usuario. `check-mfa.sh` lo detectaría. La SPA nunca pide este scope.

## Despliegue

Desde AWS CloudShell (región `us-east-2`, SAM CLI preinstalado, sin llaves de acceso):

```bash
git clone -b main https://github.com/HeidiCordova/secure-donations-2026.git
cd secure-donations-2026/infra
cd secure-donations-2026
npm ci
cd infra
sam build
sam deploy

```

- Las Lambdas se compilan con `backend/Makefile` (esbuild) en lugar del builder esbuild de SAM, que falla con los workspaces de npm.
- Outputs del stack: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `CognitoDomain`.
- Usuarios de prueba: uno por rol, creados con `aws cognito-idp admin-create-user`. Las contraseñas no se guardan en el repositorio.

Verificación rápida:

```bash
curl -s $API/v1/health      # 200 {"status":"ok"}
curl -s -i $API/v1/whoami   # 401 sin token (T02)
```

## Limpieza

1. Vaciar el bucket de la web (si no, `sam delete` falla):

   ```bash
   WEB_BUCKET=$(aws cloudformation describe-stacks --stack-name aqp-solidaria-academic \
     --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" --output text)
   aws s3 rm "s3://$WEB_BUCKET" --recursive
   ```

2. Eliminar el stack:

   ```bash
   cd secure-donations-2026/infra
   sam delete --stack-name aqp-solidaria-academic --region us-east-2
   ```

3. Vaciar el bucket `aws-sam-cli-managed-default-*` y eliminar el stack `aws-sam-cli-managed-default`.
4. Verificar en Resource Explorer (tag `project=aqp-solidaria`) que no quedan recursos (CA-NF09.2).

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
