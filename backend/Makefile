# Usa el esbuild local fijado en package-lock (requiere `npm ci` antes de `sam build`).
.RECIPEPREFIX = >
ESBUILD = npx --no esbuild
# El banner define `require` dentro del bundle ESM: el SDK de AWS lo usa para cargar node:https.
ESBUILD_FLAGS = --bundle --platform=node --target=es2023 --format=esm --sourcemap \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

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

build-CreateDonationFunction:
> $(ESBUILD) src/handlers/donations-create.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/donations-create.mjs

build-ListMyDonationsFunction:
> $(ESBUILD) src/handlers/donations-list-mine.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/donations-list-mine.mjs

build-GetDonationFunction:
> $(ESBUILD) src/handlers/donations-get.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/donations-get.mjs

build-SimulateDonationFunction:
> $(ESBUILD) src/handlers/donations-simulate.ts $(ESBUILD_FLAGS) --outfile=$(ARTIFACTS_DIR)/donations-simulate.mjs