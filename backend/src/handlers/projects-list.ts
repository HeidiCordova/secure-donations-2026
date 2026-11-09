import { createProjectHandlersFromEnv } from '../projects/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createProjectHandlersFromEnv({ writes: false });

export const handler = withLogging('PROJECT_LIST', handlers.list);
