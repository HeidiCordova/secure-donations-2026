# Evidencia T10 — la Lambda de listado no puede escribir en DynamoDB (CA-NF03.1)

Fecha: 2026-11-08 · Región: us-east-2 · Ejecutado por: Heidi desde AWS CloudShell
Datos sanitizados: el account ID se reemplazó por `<account>`.

## Política del rol de `ListProjectsFunction` (generada por SAM)

```json
[
  {
    "Action": "dynamodb:Query",
    "Resource": "arn:aws:dynamodb:us-east-2:<account>:table/aqp-solidaria-academic-projects/index/status-createdAt",
    "Effect": "Allow"
  }
]
```

## Evaluación de la política (`aws iam simulate-custom-policy`)

```text
dynamodb:Query       allowed       ← índice status-createdAt
dynamodb:Query       implicitDeny  ← tabla aqp-solidaria-academic-projects
dynamodb:PutItem     implicitDeny  ← tabla aqp-solidaria-academic-projects
dynamodb:UpdateItem  implicitDeny  ← tabla aqp-solidaria-academic-projects
dynamodb:DeleteItem  implicitDeny  ← tabla aqp-solidaria-academic-projects
dynamodb:Scan        implicitDeny  ← tabla aqp-solidaria-academic-projects
```

Cualquier escritura desde esta función recibe `AccessDeniedException`, y el handler la convierte en un 500 genérico sin
detalles (cubierto por el test "un fallo interno responde 500 genérico sin detalles"). El listado real funciona (T01).

## Nota sobre `simulate-principal-policy`

En esta cuenta (AWS Free plan, nueva experiencia), `simulate-principal-policy` devuelve `explicitDeny` con
`AllowedByOrganizations: false` para todas las acciones, incluso para el `Query` que en producción sí funciona.
Ese deny viene de las políticas que AWS aplica a la organización del plan, no del rol, así que se evaluó solo la política
del rol con `simulate-custom-policy`.
