import { createDonationHandlersFromEnv } from '../donations/wiring.js';

const handlers = createDonationHandlersFromEnv({ mode: 'read' });

export const handler = handlers.get;
