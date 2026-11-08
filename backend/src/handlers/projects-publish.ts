import { createProjectHandlersFromEnv } from '../projects/wiring.js';

const handlers = createProjectHandlersFromEnv({ writes: true });

export const handler = handlers.publish;
