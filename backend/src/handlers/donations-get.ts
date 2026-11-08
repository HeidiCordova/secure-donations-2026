import { createDonationHandlersFromEnv } from '../donations/wiring.js';

const handlers = createDonationHandlersFromEnv({ writes: false });

export const handler = handlers.get;
