import { createDonationHandlersFromEnv } from '../donations/wiring.js';

const handlers = createDonationHandlersFromEnv({ writes: true });

export const handler = handlers.create;
