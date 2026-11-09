import { createAuditHandlersFromEnv } from '../audit/wiring.js';
import { withLogging } from '../shared/logger.js';

const handlers = createAuditHandlersFromEnv();

export const handler = withLogging('AUDIT_LIST', handlers.list);
