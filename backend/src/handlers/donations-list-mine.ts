import { createDonationHandlersFromEnv } from '../donations/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createDonationHandlersFromEnv({ mode: 'read' });

export const handler = withLogging('DONATION_LIST_MINE', handlers.listMine);
