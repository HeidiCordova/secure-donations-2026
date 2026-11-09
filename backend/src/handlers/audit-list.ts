import { createAuditHandlersFromEnv } from '../audit/wiring.js';

const handlers = createAuditHandlersFromEnv();

export const handler = handlers.list;
