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

build-ListProjectsFunction:
> $(ESBUILD) src/handlers/projects-list.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/projects-list.mjs

build-GetProjectFunction:
> $(ESBUILD) src/handlers/projects-get.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/projects-get.mjs

build-ProjectStatsFunction:
> $(ESBUILD) src/handlers/projects-stats.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/projects-stats.mjs

build-CreateProjectFunction:
> $(ESBUILD) src/handlers/projects-create.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/projects-create.mjs

build-PublishProjectFunction:
> $(ESBUILD) src/handlers/projects-publish.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/projects-publish.mjs