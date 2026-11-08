import { createProjectHandlersFromEnv } from '../projects/wiring.js';

const handlers = createProjectHandlersFromEnv({ writes: false });

export const handler = handlers.get;
