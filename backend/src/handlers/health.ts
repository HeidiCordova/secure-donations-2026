import { json, type HttpResponse } from '../shared/http.js';

/** GET /v1/health — ruta pública para verificar que el despliegue responde. */
export const handler = async (): Promise<HttpResponse> => json(200, { status: 'ok' });
