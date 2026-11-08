import { getPrincipal, requireScope, type JwtAuthorizedEvent } from '../authz/principal.js';
import { errorResponse, json, type HttpResponse } from '../shared/http.js';

export interface WhoAmIEvent extends JwtAuthorizedEvent {
  requestContext: JwtAuthorizedEvent['requestContext'] & { requestId: string };
}

/**
 * GET /v1/whoami — ruta protegida de prueba (T02, T11).
 * Devuelve solo la identidad derivada de claims verificados; nunca el token.
 */
export const handler = async (event: WhoAmIEvent): Promise<HttpResponse> => {
  const requestId = event.requestContext.requestId;
  try {
    const principal = getPrincipal(event);
    requireScope(principal, 'api/donations.read');
    return json(200, { sub: principal.sub, groups: principal.groups, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
};
