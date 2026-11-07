# Frontend (Rodrigo)

Crear aquí la SPA:

```bash
cd frontend
npm create vite@latest . -- --template react-ts
```

Después:

1. Agregar `"frontend"` a `workspaces` en el `package.json` de la raíz.
2. Dar al `package.json` del frontend los scripts `typecheck`, `test` y `build` para que el CI los ejecute.
3. Tokens solo en memoria (`oidc-client-ts` con `InMemoryWebStorage`), nunca `localStorage` (CA-NF11.1).
4. Prohibido Bootstrap; usar Tailwind CSS 4.
