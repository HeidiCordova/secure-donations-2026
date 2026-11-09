# Informe de Pruebas de Seguridad y Validación Zero Trust

**Proyecto:** Secure Donations 2026 (AQP-SOLIDARIA)  
**Autores:** Barbara Carrillo - Heidi Cordova - Maria Ezcurra - Rodrigo Veliz
**Entorno:** AWS Academic (`academic`)  
**Fecha:** 8 Noviembre 2026

---

## 1. Introducción

El presente informe documenta las pruebas de seguridad y la arquitectura aplicadas a la plataforma de donaciones ficticia **AQP-SOLIDARIA**. El objetivo principal es validar la implementación del modelo de seguridad **Zero Trust (Confianza Cero)**, garantizando que el control de acceso y las reglas de negocio no dependan únicamente de la interfaz de usuario, sino que se verifiquen de forma estricta e independiente en cada solicitud procesada en el backend.

---

## 2. Mapeo de Arquitectura Zero Trust (NIST SP 800-207)

De acuerdo con la publicación especial **NIST SP 800-207**, la arquitectura de AQP-SOLIDARIA implementa los componentes centrales de Zero Trust de la siguiente manera:

- **PEP (Policy Enforcement Point):** **AWS API Gateway**
  - Intercepta el 100% de las solicitudes HTTP entrantes.
  - Valida la presencia de tokens Bearer antes de reenviar el tráfico a los servicios internos.
  - Deniega accesos no autenticados en el perímetro (`401 Unauthorized`).
- **PE (Policy Engine):** **Funciones AWS Lambda (Lógica de AuthZ)**
  - Aplica las decisiones de autorización e inspección de _claims_ del JWT.
  - Evalúa si la identidad del usuario tiene los scopes necesarios (ej. `api/projects.write`, `api/donations.read`).
  - Implementa verificaciones anti-BOLA y reglas de negocio para impedir accesos cruzados entre usuarios.
- **PA (Policy Administrator):** **AWS Cognito**
  - Emite y gestiona los tokens JWT (OAuth 2.0).
  - Autentica identidades mediante credenciales de usuario y exige Doble Factor de Autenticación (MFA) para roles privilegiados (Gestor y Auditor).

---

## 3. Decisiones de Diseño y Mecanismos de Seguridad

1. **Autenticación Basada en OAuth 2.0:** Uso estricto de tokens de acceso validados mediante firmas criptográficas. El envío de JWTs alterados es rechazado inmediatamente por la infraestructura.
2. **Idempotencia y Anti-Replay:** Registro único de intenciones de donación mediante llaves de idempotencia (`idempotencyKey`), evitando la duplicación de transacciones ante múltiples envíos o reintentos en red.
3. **Validación Estricta de Negocio:**
   - Rechazo de montos cero, negativos, decimales o superiores al límite permitido.
   - Restricción de permisos por rol: Los usuarios con rol `DONANTE` no pueden crear proyectos ni consultar registros privativos.

---

## 4. Matriz de Resultados y Evidencias (Ejecución en Bruno)

A continuación se detalla la matriz de ejecución ejecutada en el entorno AWS Academic:

| ID      | Nombre de la Prueba                  |  Código Obtenido   |  Resultado  | Observación de Validación Zero Trust                     |
| :------ | :----------------------------------- | :----------------: | :---------: | :------------------------------------------------------- |
| **T01** | Catálogo Público                     |      `200 OK`      |   PASSED    | Endpoint público sin restricción de token.               |
| **T02** | Sin token consulta historial         | `401 Unauthorized` |   PASSED    | PEP rechaza consulta privada sin token.                  |
| **T03** | Donante no crea proyectos            |  `403 Forbidden`   |   PASSED    | PE valida el rol del token e impide creación.            |
| **T04** | Monto cero                           | `400 Bad Request`  |   PASSED    | Validación de regla de negocio en backend.               |
| **T04** | Monto decimal                        | `400 Bad Request`  |   PASSED    | Estructura de datos inválida rechazada.                  |
| **T04** | Monto máximo excedido                | `400 Bad Request`  |   PASSED    | Límite superior de donación protegido.                   |
| **T05** | Crear intención de donación          |   `201 Created`    |   PASSED    | Creación válida y pendiente de cobro.                    |
| **T06** | Repetir clave y carga idénticas      |   `201 Created`    |   PASSED    | Idempotencia: devuelve la donación existente.            |
| **T07** | Reutilizar clave con carga distinta  |   `409 Conflict`   |   PASSED    | Idempotencia: detecta conflicto en la carga útil.        |
| **T09** | Consultar donación ajena             | `401 Unauthorized` | OBSERVACIÓN | El backend bloquea la donación ajena (esperado 403/404). |
| **T11** | ID token sin scopes                  | `401 Unauthorized` | OBSERVACIÓN | Se rechaza falta de scopes (esperado 403).               |
| **T11** | JWT alterado                         | `401 Unauthorized` |   PASSED    | Firma criptográfica inválida rechazada.                  |
| **T12** | Gestor no consulta historial donante | `401 Unauthorized` | OBSERVACIÓN | Bloqueo de aislamiento entre roles (esperado 403/404).   |

---

## 5. Uso de Inteligencia Artificial

Durante el desarrollo del laboratorio se utilizaron herramientas de IA para:

- Generación y ajuste de colecciones de pruebas automatizadas en Bruno.
- Asistencia en el diagnóstico de errores de políticas de ejecución en PowerShell y Git.
- Formateo y estructuración del informe según estándares NIST SP 800-207.

---

## 6. Conclusiones

- La plataforma **Secure Donations 2026** cumple satisfactoriamente los principios Zero Trust en el backend, garantizando que ninguna acción sensible sea ejecutada sin previa autenticación y autorización.
- Los mecanismos de idempotencia y validación de carga evitan estados inconsistentes en la base de datos ante errores de cliente o reintentos maliciosos.
