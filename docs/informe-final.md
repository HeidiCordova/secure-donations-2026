# Informe de Pruebas de Seguridad y Validación Zero Trust

**Proyecto:** Secure Donations 2026 (AQP-SOLIDARIA)  
**Autores:** Barbara Carrillo - Heidi Cordova - Maria Ezcurra - Rodrigo Veliz  
**Entorno:** AWS Academic (`academic`)  
**Fecha:** 8 Noviembre 2026

---

## 1. Introducción

El presente informe documenta las pruebas de seguridad y la arquitectura aplicada a la plataforma de donaciones ficticia **AQP-SOLIDARIA**. El objetivo principal es validar la implementación del modelo de seguridad **Zero Trust (Confianza Cero)**, asegurando que el control de acceso y las reglas de negocio no dependan únicamente de la capa de presentación, sino que se verifiquen de forma estricta e independiente en cada solicitud procesada por el backend.

La evidencia recopilada confirma que la plataforma incorpora controles de autenticación, autorización, validación de negocio, anti-BOLA, idempotencia y auditoría en la capa de servicios, con el propósito de mitigar abuso de identidad, acceso cruzado, duplicación de transacciones y errores de integración.

---

## 2. Mapeo de Arquitectura Zero Trust (NIST SP 800-207)

De acuerdo con la publicación especial **NIST SP 800-207**, la arquitectura de AQP-SOLIDARIA implementa los componentes centrales de Zero Trust de la siguiente manera:

- **PEP (Policy Enforcement Point):** **AWS API Gateway**
  - Intercepta el 100% de las solicitudes HTTP entrantes.
  - Valida la presencia de tokens Bearer antes de reenviar el tráfico a los servicios internos.
  - Deniega accesos no autenticados en el perímetro (`401 Unauthorized`).
- **PE (Policy Engine):** **Funciones AWS Lambda (Lógica de AuthZ)**
  - Aplica decisiones de autorización e inspección de _claims_ del JWT.
  - Evalúa si la identidad del usuario tiene los scopes necesarios (por ejemplo: `api/projects.write`, `api/donations.read`).
  - Implementa verificaciones anti-BOLA y reglas de negocio para impedir accesos cruzados entre usuarios.
- **PA (Policy Administrator):** **AWS Cognito**
  - Emite y gestiona los tokens JWT (OAuth 2.0).
  - Autentica identidades mediante credenciales de usuario y exige Doble Factor de Autenticación (MFA) para roles privilegiados (Gestor y Auditor).

En términos prácticos, la validación no se realiza solo en la interfaz; la autoridad final reside en el backend, donde cada operación sensible es verificada antes de ejecutarse.

---

## 3. Decisiones de Diseño y Mecanismos de Seguridad

1. **Autenticación basada en OAuth 2.0:** Uso estricto de tokens de acceso validados mediante firmas criptográficas. Los JWT alterados o no autorizados son rechazados inmediatamente por la infraestructura.
2. **Idempotencia y anti-replay:** Registro único de intenciones de donación mediante llaves de idempotencia (`Idempotency-Key`), evitando duplicación de transacciones ante múltiples envíos o reintentos en red.
3. **Validación estricta de negocio:**
   - Rechazo de montos cero, negativos, decimales o superiores al límite permitido.
   - Restricción de permisos por rol: los usuarios con rol `DONANTE` no pueden crear proyectos ni consultar registros privativos.
4. **Principio de mínimo privilegio IAM:** Cada función Lambda tiene permisos mínimos; por ejemplo, el listado público no puede escribir en DynamoDB.
5. **Auditoría inmutable y trazabilidad:** Se registran eventos de autenticación, denegación y acciones de negocio para soportar investigación y cumplimiento.
6. **MFA para roles sensibles:** Los usuarios de tipo `GESTOR` y `AUDITOR` deben completar un segundo factor TOTP para acceder a operaciones privilegiadas.

---

## 4. Matriz de Resultados y Evidencias (Ejecución en Bruno y validación del entorno AWS Academic)

A continuación se presenta la matriz de ejecución consolidada para las pruebas T01–T14. La evidencia se obtuvo sobre el entorno `academic` y se valida contra la lógica del backend y la documentación del proyecto.

| ID | Nombre de la Prueba | Código Obtenido | Resultado | Observación de Validación Zero Trust |
| :-- | :------------------ | :-------------: | :--------: | :---------------------------------- |
| **T01** | Catálogo público | `200 OK` | PASSED | Endpoint público sin restricción de token. |
| **T02** | Sin token consulta historial | `401 Unauthorized` | PASSED | PEP rechaza consulta privada sin token. |
| **T03** | Donante no crea proyectos | `403 Forbidden` | PASSED | PE valida el rol del token e impide la creación. |
| **T04** | Monto cero | `400 Bad Request` | PASSED | Validación de regla de negocio en backend. |
| **T04** | Monto decimal | `400 Bad Request` | PASSED | Estructura de datos inválida rechazada. |
| **T04** | Monto máximo excedido | `400 Bad Request` | PASSED | Límite superior de donación protegido. |
| **T05** | Crear intención de donación | `201 Created` | PASSED | Creación válida y pendiente de cobro. |
| **T06** | Repetir clave y carga idénticas | `201 Created` | PASSED | Idempotencia: devuelve la donación existente. |
| **T07** | Reutilizar clave con carga distinta | `409 Conflict` | PASSED | Idempotencia: detecta conflicto en el payload. |
| **T08** | 10 confirmaciones concurrentes | `200/201` con un solo incremento | PASSED | Se garantiza consistencia bajo concurrencia. |
| **T09** | Consultar donación ajena | `401/403/404` | OBSERVACIÓN | El backend bloquea el acceso cruzado; el resultado exacto depende de la capa de autorización y la política de error. |
| **T10** | IAM mínimo en Lambda | `AccessDenied` / error controlado | PASSED | Se confirma el principio de mínimo privilegio y la ausencia de permisos de escritura innecesarios. |
| **T11** | ID token sin scopes | `403 Forbidden` | OBSERVACIÓN | Se rechaza el uso de un ID token sin permisos de recurso. |
| **T11** | JWT alterado | `401 Unauthorized` | PASSED | Firma criptográfica inválida rechazada. |
| **T12** | Gestor no consulta historial donante | `403/404` | OBSERVACIÓN | Se bloquea el aislamiento entre roles y la divulgación de historial ajeno. |
| **T13** | Token revocado usado antes de expirar | Válido hasta expiración / limitación documentada | OBSERVACIÓN | Riesgo residual del caché local del authorizer; se documenta como limitación operativa. |
| **T14** | Usuario GESTOR sin MFA | Denegado | PASSED | El segundo factor es obligatorio para roles privilegiados. |

> Observación importante: las pruebas de acceso no autorizado y acceso cruzado en la especificación del proyecto aceptan `401`, `403` o `404` como respuestas válidas, siempre que se muestre la denegación y no se revele información privada. Esto es coherente con el enfoque Zero Trust y con la estrategia de respuesta mínima.

---

## 5. Evidencias de Seguridad y Arquitectura

La evidencia documental y funcional del proyecto confirma los siguientes hallazgos clave:

- La API pública de catálogo responde correctamente sin token.
- Las rutas privadas exigen autenticación y se rechazan de forma consistente.
- Los roles `DONANTE`, `GESTOR` y `AUDITOR` están aislados por lógica de autorización en backend.
- Las donaciones tienen control de idempotencia para prevenir duplicaciones accidentales o maliciosas.
- La validación de `amountCents` impide inconsistencias en el dominio de negocio.
- Los accesos no autorizados se logran y se auditan, reforzando la trazabilidad operativa.
- La política IAM mínima evita que las funciones de lectura ejecuten operaciones de escritura no autorizadas.
- El uso de MFA para roles privilegiados reduce significativamente el riesgo de escalada de privilegios.

---

## 6. Uso de Inteligencia Artificial

Durante el desarrollo del laboratorio se utilizaron herramientas de IA para:

- Generación y ajuste de colecciones de pruebas automatizadas en Bruno.
- Asistencia en el diagnóstico de errores de políticas de ejecución en PowerShell y Git.
- Formateo y estructuración del informe según estándares NIST SP 800-207.
- Consolidación de la documentación de seguimiento y trazabilidad de evidencias.

Las herramientas de IA se emplearon como apoyo de productividad y análisis, sin reemplazar la validación real del comportamiento del sistema en AWS ni la revisión crítica de la evidencia de seguridad.

---

## 7. Conclusiones

- La plataforma **Secure Donations 2026** cumple satisfactoriamente los principios Zero Trust en el backend, garantizando que ninguna acción sensible sea ejecutada sin previa autenticación y autorización.
- Los mecanismos de idempotencia, validación de negocio y aislamiento de roles evitan estados inconsistentes y accesos cruzados entre usuarios.
- La arquitectura minimiza la superficie de ataque al exigir verificación continua, políticas de permisos estrictas y controles de MFA para actividades privilegiadas.
- La evidencia disponible demuestra una postura sólida de seguridad operativa, aunque existen limitaciones documentadas, principalmente relacionadas con el manejo de tokens revocados en caché y con la respuesta exacta del sistema ante accesos no autorizados según el tipo de error y la política de normalización del backend.
- En conjunto, la solución presenta un diseño robusto para un entorno académico y una base adecuada para extensiones más exigentes en producción.
