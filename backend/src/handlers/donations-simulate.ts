import { createDonationHandlersFromEnv } from '../donations/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createDonationHandlersFromEnv({ mode: 'simulate' });

export const handler = withLogging('DONATION_SIMULATE', handlers.simulate);
