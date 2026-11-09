import { createProjectHandlersFromEnv } from '../projects/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createProjectHandlersFromEnv({ writes: true });

export const handler = withLogging('PROJECT_PUBLISH', handlers.publish);
