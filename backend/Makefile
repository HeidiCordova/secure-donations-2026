# Build de las Lambdas para AWS SAM (BuildMethod: makefile).
# Se usa en lugar del builder esbuild de SAM para evitar su `npm install`
# dentro del monorepo con workspaces (falla con "reading 'edgesOut'").
.RECIPEPREFIX = >
# Usa el esbuild local fijado en package-lock (requiere `npm ci` antes de `sam build`).
.RECIPEPREFIX = >
ESBUILD = npx --no esbuild
ESBUILD_FLAGS = --bundle --platform=node --target=es2023 --format=esm --sourcemap

build-HealthFunction:
> $(ESBUILD) src/handlers/health.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/health.mjs

build-WhoAmIFunction:
> $(ESBUILD) src/handlers/whoami.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/whoami.mjs
