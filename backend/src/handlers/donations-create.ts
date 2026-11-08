import { createDonationHandlersFromEnv } from '../donations/wiring.js';

const handlers = createDonationHandlersFromEnv({ mode: 'create' });

export const handler = handlers.create;
