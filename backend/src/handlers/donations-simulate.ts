import { createDonationHandlersFromEnv } from '../donations/wiring.js';

const handlers = createDonationHandlersFromEnv({ mode: 'simulate' });

export const handler = handlers.simulate;
