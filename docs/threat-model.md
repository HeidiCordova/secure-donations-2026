# Modelo de Amenazas (STRIDE) - Secure Donations 2026

## 1. Spoofing (Suplantación de Identidad)
* **Amenaza:** Un atacante suplanta la identidad de un donante o un gestor.
* **Mitigación:** Autenticación centralizada con Amazon Cognito usando flujo OAuth2 + PKCE. Uso de tokens JWT firmados digitalmente.

## 2. Tampering (Manipulación de Datos)
* **Amenaza:** Modificación del monto a donar (`amountCents`) durante la transmisión o alteración de tokens JWT.
* **Mitigación:** Encriptación TLS en tránsito (HTTPS). Validación estricta de esquemas Zod en backend (`amountCents` restringido entre 100 y 100000). Verificación de firma del JWT en API Gateway / Lambda Authorizer.

## 3. Repudiation (Repudio)
* **Amenaza:** Un gestor niega haber publicado un proyecto o modificado información sensible.
* **Mitigación:** Registro obligatorio de `AuditEvent` en logs/DynamoDB ante acciones críticas (crear/publicar proyecto, procesar donaciones).

## 4. Information Disclosure (Fuga de Información)
* **Amenaza:** Acceso no autorizado a donaciones privadas de otros usuarios (Vulnerabilidad BOLA / IDOR).
* **Mitigación:** Endpoint anti-BOLA `GET /v1/donations/{donationId}` que valida en backend que el `userId` del JWT coincida con el propietario del registro.

## 5. Denial of Service (Denegación de Servicio)
* **Amenaza:** Inundación de solicitudes para procesar la misma donación múltiples veces.
* **Mitigación:** Implementación del patrón de Idempotencia mediante el encabezado `Idempotency-Key` respaldado por DynamoDB con `TransactWriteItems`.

## 6. Elevation of Privilege (Elevación de Privilegios)
* **Amenaza:** Un donante común intenta crear o publicar proyectos (funcionalidad de Gestor).
* **Mitigación:** Control de acceso basado en roles (RBAC) validando los *groups/scopes* del token JWT en la capa de autorización.