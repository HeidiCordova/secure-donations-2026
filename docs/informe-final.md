# Informe técnico — Secure Donations 2026

**Proyecto:** Secure Donations 2026 (AQP-SOLIDARIA)<br>
**Curso:** Tópicos Avanzados en Ingeniería de Software — EPIS, UNSA<br>
**Equipo:** Barbara Carrillo, Heidi Cordova, Maria Ezcurra y Rodrigo Veliz<br>
**Entorno:** AWS Academic, stage `academic`, región `us-east-2`<br>
**Fecha:** 9 de noviembre de 2026

## 1. Objetivo y alcance

Este informe presenta la arquitectura de seguridad y los resultados de las pruebas T01–T14 del prototipo académico AQP-SOLIDARIA. El objetivo es verificar que la autenticación, la autorización, la validación de negocio y el aislamiento de datos se apliquen en el backend en cada solicitud, no solo en la interfaz.

Las donaciones son intenciones y simulaciones: no se procesan pagos reales. Los resultados se basan en las evidencias del repositorio y en la ejecución del stage académico; no constituyen una certificación ni una evaluación independiente de cumplimiento.

## 2. Arquitectura Zero Trust

### 2.1 Componentes PE, PA y PEP

| Componente                         | Implementación                                                                    | Responsabilidad y límite                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PEP — Policy Enforcement Point** | API Gateway HTTP API con JWT authorizer y scopes por ruta                         | Verifica el token y aplica la decisión de acceso a la API antes de invocar Lambda. CloudFront entrega la SPA, pero no sustituye al PEP de la API.                                    |
| **PE — Policy Engine**             | Módulo `authz` en AWS Lambda (MVP)                                                | Evalúa grupo, scopes, propietario y estado del recurso para autorizar cada operación. Amazon Verified Permissions/Cedar es una extensión planteada, no el PE desplegado en este MVP. |
| **PA — Policy Administrator**      | Amazon Cognito, como componente del flujo de administración de identidad y sesión | Emite y administra el ciclo de los tokens y aplica MFA a los roles privilegiados. El prototipo no implementa un PA independiente que programe rutas de comunicación.                 |

Las decisiones usan claims de Cognito, el estado del recurso en DynamoDB y el stage. Los roles IAM por función limitan las operaciones de cada Lambda sobre los recursos de AWS.

### 2.2 Mapeo a los siete principios de NIST SP 800-207

| Principio                                                                         | Aplicación en el prototipo                                                                                                                                           | Evidencia / estado                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **1. Todos los recursos de datos y servicios se consideran recursos protegidos.** | Endpoints, funciones Lambda y tablas DynamoDB tienen políticas de acceso definidas; los recursos privados no se consideran confiables por estar dentro de la cuenta. | `design.md` §3–4; T03, T09, T10 y T12.                               |
| **2. Toda comunicación se protege independientemente de la ubicación de red.**    | HTTPS para CloudFront y API Gateway; la API valida tokens en el punto de entrada.                                                                                    | CA-NF01.1; configuración de CloudFront/API Gateway.                  |
| **3. El acceso se concede por sesión y por recurso.**                             | Access tokens de vida corta, scopes por ruta y comprobación de ownership usando el `sub` del token.                                                                  | T09, T11 y T13; T13 documenta la excepción hasta la expiración.      |
| **4. El acceso se determina por política dinámica.**                              | La autorización se evalúa en cada solicitud con identidad, grupo, scopes, propietario, estado del recurso y stage.                                                   | T03 y T12; `backend/src/authz/`.                                     |
| **5. Se monitorea la postura de seguridad de los activos.**                       | **Parcial:** hay CloudTrail, logs y revisión de dependencias, pero no evaluación de postura de dispositivo ni evaluación continua del riesgo de sesión.              | CA-NF07.2; limitación documentada en §5.                             |
| **6. La autenticación y autorización son estrictas antes de permitir el acceso.** | JWT authorizer, scopes, RBAC/ownership en backend y MFA TOTP para GESTOR/AUDITOR.                                                                                    | T02, T03, T11, T12 y T14.                                            |
| **7. Se recolecta información para mejorar la seguridad.**                        | Logs JSON, eventos de auditoría y CloudTrail permiten registrar y revisar actividad.                                                                                 | CA-NF07.2; evidencia de auditoría en `evidence/T01-T03-projects.md`. |

El mapeo refleja los controles implementados y sus límites; no implica que la arquitectura satisfaga íntegramente todos los objetivos de una ZTA de producción.

## 3. Controles de seguridad

- **Autenticación:** OAuth 2.0/OIDC con Cognito. API Gateway valida los access tokens; las rutas protegidas requieren scopes. Un token alterado se rechaza.
- **Autorización:** roles y ownership se verifican en Lambda. La UI oculta acciones según el rol solo por usabilidad; no es un control de seguridad.
- **Integridad de donaciones:** importes enteros en céntimos de PEN, límites y estado del proyecto validados en servidor.
- **Idempotencia:** clave por donante y operación; el mismo payload obtiene el mismo resultado y una clave reutilizada con payload diferente produce conflicto.
- **Concurrencia:** las transiciones de simulación y el incremento del acumulado usan operaciones transaccionales y condiciones para evitar doble contabilización.
- **Mínimo privilegio:** roles IAM separados por función; la función de listado tiene Query sobre el índice requerido y no permisos de escritura.
- **Auditoría:** logs estructurados y eventos de auditoría sin tokens ni cuerpos sensibles.

## 4. Matriz de pruebas y resultados

Los detalles de ejecución están en los documentos de [evidence/](../evidence/). Para T09, el registro escrito reporta `404`, pero la captura actualmente guardada muestra `401` porque Bruno no resolvió una variable. Esa captura no valida autorización y queda pendiente reemplazarla con una solicitud autenticada que muestre el `404`.

| ID      | Prueba                                                            | Resultado observado                                                             | Estado / evidencia                                                                                     |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **T01** | Catálogo público sin token                                        | `200 OK`                                                                        | PASSED — `evidence/T01-T03-projects.md`                                                                |
| **T02** | Consultar historial sin token                                     | `401 Unauthorized`                                                              | PASSED — `evidence/T02-evidencia.jpg`                                                                  |
| **T03** | Donante intenta crear proyecto                                    | `403 Forbidden`                                                                 | PASSED — `evidence/T01-T03-projects.md`                                                                |
| **T04** | Monto no permitido (cero/mínimo, decimal o máximo excedido)       | `400 Bad Request`                                                               | PASSED — `evidence/T04-T12-donations.md`                                                               |
| **T05** | Crear intención válida                                            | `201 Created`, `PENDIENTE_SIMULACION`, sin cargo                                | PASSED — `evidence/T04-T12-donations.md`; la captura requiere ocultar el `donorSub` antes de incluirse |
| **T06** | Repetir clave y payload idénticos                                 | `201`; mismo `donationId`, una sola donación                                    | PASSED — `evidence/T04-T12-donations.md`                                                               |
| **T07** | Repetir clave con payload distinto                                | `409 Conflict`                                                                  | PASSED — `evidence/T04-T12-donations.md`                                                               |
| **T08** | Diez confirmaciones concurrentes de la misma donación             | 1 respuesta `200`, 9 respuestas `409`; incremento único de 2500 céntimos        | PASSED — `evidence/T08-confirmaciones-concurrentes.md`                                                 |
| **T09** | Donante consulta una donación ajena                               | `404 Not Found`; la respuesta no revela la donación                             | CAPTURA PENDIENTE — `evidence/T04-T12-donations.md`; la imagen actual no es evidencia válida           |
| **T10** | Lambda de listado intenta escribir en DynamoDB                    | Escrituras denegadas; Query solo en el índice autorizado                        | PASSED — `evidence/T10-iam-minimo.md`                                                                  |
| **T11** | Usar ID token y JWT alterado en la API                            | ID token: `403 Forbidden` por falta de scopes; JWT alterado: `401 Unauthorized` | PASSED — `evidence/T02-T11-HU10-logs.md`, `docs/PLAN_PRUEBAS.md`                                       |
| **T12** | Gestor consulta historial de donaciones                           | `403 Forbidden`                                                                 | PASSED — `evidence/T04-T12-donations.md`                                                               |
| **T13** | Usar access token tras revocar la sesión y antes de su expiración | `200 OK` hasta expirar                                                          | PASSED; limitación documentada — `evidence/T13-token-revocado.md`                                      |
| **T14** | GESTOR sin segundo factor válido                                  | No se emiten tokens; MFA TOTP requerido                                         | PASSED — `evidence/T14-mfa.md`                                                                         |

## 5. Limitaciones conocidas

1. **Revocación de access tokens (T13):** el JWT authorizer valida el token localmente y no consulta a Cognito por cada solicitud. Un access token ya emitido puede seguir siendo válido hasta su expiración aunque se revoque la sesión; los refresh tokens sí quedan revocados. La mitigación aplicada es una vida de access token de 15 minutos. La evidencia T13 confirma el comportamiento.
2. **Sin postura de dispositivo ni evaluación continua:** el prototipo no evalúa postura del dispositivo ni riesgo de sesión de forma continua. Estas capacidades quedan fuera del alcance y del plan académico usado.
3. **HTTP API sin WAF:** AWS WAF no se asocia directamente a API Gateway HTTP API. Una necesidad de WAF requeriría proteger la API mediante CloudFront o evaluar REST API, con el costo y cambios correspondientes.
4. **Cuenta AWS compartida:** el equipo utiliza una cuenta compartida. El aislamiento entre integrantes depende de las identidades IAM, MFA, los permisos asignados y la disciplina operativa del equipo.

## 6. Prototipo académico y protección de datos

AQP-SOLIDARIA es un **prototipo académico** con donaciones simuladas: no procesa pagos reales ni está autorizado para recaudar fondos. Las pruebas deben usar identidades y datos ficticios; las capturas se sanitizan antes de incorporarlas al repositorio.

Este trabajo no constituye una evaluación de cumplimiento de la **Ley N.º 29733, Ley de Protección de Datos Personales**, su reglamento, PCI DSS ni otras obligaciones aplicables. Un despliegue real en Perú requeriría, antes de tratar datos personales o recaudar fondos, determinar las responsabilidades y bases legales, informar a los titulares, atender sus derechos, proteger los datos y obtener revisión legal y de seguridad especializada.

## 7. Declaración de uso de IA

| Campo de `design.md` §10 | Declaración                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Herramienta/modelo**   | Copilot SDK en VS Code. El modelo y su versión no se muestran en el contexto de esta sesión.                                                                                                                                        |
| **Participantes**        | Heidi Cordova, con asistencia de IA.                                                                                                                                                                                                |
| **Tareas asistidas**     | Contrastar el borrador con `requirements.md` y `design.md`; corregir la matriz T01–T14 y actualizar la documentación de evidencias.                                                                                                 |
| **Aportes IA**           | Redacción y edición de `docs/informe-final.md`, `docs/PLAN_PRUEBAS.md`, `evidence/README.md` y `evidence/T04-T12-donations.md`; cambios por presentar mediante PR.                                                                  |
| **Validación humana**    | Contraste de las afirmaciones con las guías y evidencias existentes. La discrepancia de T09 fue detectada; la captura nueva, la sanitización de T05 y la revisión final por otra persona siguen pendientes.                         |
| **Limitaciones**         | La IA no ejecuta despliegues ni verifica directamente la cuenta AWS. No se le proporcionan credenciales o tokens. La versión del modelo no está disponible y los resultados se limitan a las evidencias revisables del repositorio. |

El equipo conserva la responsabilidad de revisar el contenido, validar los resultados y explicar las decisiones técnicas.

## 8. Conclusiones

Las pruebas documentadas muestran que la API aplica autenticación, autorización por rol y propietario, validación de negocio, idempotencia y privilegio mínimo en los casos probados. T08 demuestra una sola transición efectiva bajo concurrencia y T13 explicita la ventana de validez del access token revocado. La implementación se considera apropiada para el alcance académico descrito, con las limitaciones de §5 y sin atribuirse cumplimiento integral de Zero Trust o de normativa de producción.

## 9. Referencias

- NIST SP 800-207, _Zero Trust Architecture_: <https://csrc.nist.gov/pubs/sp/800/207/final>
- NIST SP 800-207A, _A Zero Trust Architecture Model for Access Control in Cloud-Native Applications in Multi-Cloud Environments_: <https://csrc.nist.gov/pubs/sp/800/207/a/final>
- CISA, _Zero Trust Maturity Model v2.0_: <https://www.cisa.gov/resources-tools/resources/zero-trust-maturity-model>
- API Gateway HTTP API JWT authorizers: <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html>
- Amazon Cognito token revocation: <https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html>
- Ley N.º 29733, Ley de Protección de Datos Personales, Perú.
