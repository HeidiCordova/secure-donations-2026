# Evidencia T14 — MFA TOTP para GESTOR y AUDITOR (CA-11.1)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: los identificadores de usuario (`sub`) están enmascarados. El secreto TOTP no se muestra.

## Control compensatorio: antes del enrolamiento

```text
$ scripts/check-mfa.sh <user-pool-id>
FALLA GESTOR  <sub-gestor1>  sin MFA TOTP
FALLA AUDITOR <sub-auditor1> sin MFA TOTP
exit=1
```

## Enrolamiento

Para cada usuario: `associate-software-token` → registro del secreto en la app autenticadora → `verify-software-token` (Status SUCCESS) → `set-user-mfa-preference` (TOTP habilitado y preferido).

## Control compensatorio: después del enrolamiento

```text
$ scripts/check-mfa.sh <user-pool-id>
OK    GESTOR  <sub-gestor1>  con MFA TOTP
OK    AUDITOR <sub-auditor1> con MFA TOTP
exit=0
```

## Inicio de sesión con segundo factor

Al iniciar sesión como gestor1, después de la contraseña, Cognito pide el código TOTP de 6 dígitos (captura `T14-login-totp.png`, con el número de cuenta oculto).
## Sin segundo factor no hay tokens

Con un código TOTP incorrecto, Cognito muestra el error y no redirige al `/callback`: no se emite authorization code ni tokens (`T14-totp-incorrecto.png`).

## Scope de enrolamiento cerrado

Después del enrolamiento, el cliente ya no tiene `aws.cognito.signin.user.admin` (`MfaEnrollment=closed`):

```text
$ aws cognito-idp describe-user-pool-client ... --query UserPoolClient.AllowedOAuthScopes
["openid","email","api/projects.write","api/donations.write","api/donations.read","api/audit.read"]
```
