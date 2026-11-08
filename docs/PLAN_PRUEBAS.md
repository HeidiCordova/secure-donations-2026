# Plan de Pruebas (T01 – T14) - Secure Donations 2026

| ID | Nombre de la Prueba | Tipo / Caso de Uso | Resultado Esperado | Procedimiento / Comando |
|---|---|---|---|---|
| **T01** | Catálogo público | GET /v1/projects | Retorna HTTP 200 y lista de proyectos con estado PUBLICADO. | Consultar endpoint público sin cabecera Authorization. |
| **T02** | Acceso sin autenticación | GET /v1/donations | Retorna HTTP 401 Unauthorized. | Consultar endpoint protegido sin token Bearer. |
| **T03** | Creación de proyecto (Gestor) | POST /v1/projects | Retorna HTTP 201 Created y proyecto en estado BORRADOR. | Enviar body con datos válidos usando token de GESTOR. |
| **T04** | Creación de intención de donación | POST /v1/donations | Retorna HTTP 201 Created, ID de donación e Idempotency-Key. | Enviar `amountCents` entre 100 y 100000 con token de DONANTE. |
| **T05** | Validación de montos límites | POST /v1/donations | Retorna HTTP 400 Bad Request si `amountCents` < 100 o > 100000. | Probar enviando amountCents = 50 y 200000. |
| **T06** | Control de Idempotencia | POST /v1/donations | Retorna el mismo objeto creado sin duplicar en la BD. | Enviar dos peticiones consecutivas con el mismo header `Idempotency-Key`. |
| **T07** | Simulación de pago | POST /v1/donations/simulate | Cambia el estado de la donación a CONFIRMADA. | Enviar webhook/simulación con la transacción de pago simulada. |
| **T08** | Control de acceso por rol (RBAC) | POST /v1/projects | Retorna HTTP 403 Forbidden para rol DONANTE. | Intentar crear un proyecto usando token de DONANTE. |
| **T09** | Protección Anti-BOLA | GET /v1/donations/{id} | Retorna HTTP 403 / 404 al consultar donación de otro usuario. | Consultar ID de donación ajena con token de donante2. |
| **T10** | Publicación de proyecto | PATCH /v1/projects/{id}/publish | Estado cambia a PUBLICADO; 409 Conflict si ya estaba publicado. | Ejecutar como GESTOR sobre un proyecto en BORRADOR. |
| **T11** | Token JWT adulterado/invalido | GET /v1/donations | Retorna HTTP 401 Unauthorized. | Enviar header Authorization con firma de token alterada. |
| **T12** | Consulta de Métricas/Stats | GET /v1/projects/{id}/stats | Retorna HTTP 200 con total recaudado de donaciones confirmadas. | Consultar estadísticas de un proyecto activo. |
| **T13** | Registro de Auditoría (AuditEvent) | DynamoDB / Logs | Evento registrado en auditoría al crear y publicar proyectos. | Verificar inserción de logs/eventos tras acciones críticas. |
| **T14** | Verificación MFA | Cognito Auth | Requiere desafío de segundo factor para GESTOR y AUDITOR. | Iniciar sesión con credenciales de usuario gestor1. |