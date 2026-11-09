import { createDonationHandlersFromEnv } from '../donations/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createDonationHandlersFromEnv({ mode: 'create' });

export const handler = withLogging('DONATION_CREATE', handlers.create);
