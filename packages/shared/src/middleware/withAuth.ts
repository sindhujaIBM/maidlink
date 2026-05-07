import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyToken } from '../jwt';
import type { AuthContext } from '../types/api';
import { toErrorResponse, ForbiddenError } from '../errors';

type AuthenticatedHandler = (
  event: APIGatewayProxyEvent,
  auth: AuthContext
) => Promise<APIGatewayProxyResult>;

const ALLOWED_ORIGINS = new Set([
  'https://maidlink.ca',
  'https://www.maidlink.ca',
  'http://localhost:5173',
]);

export function corsOrigin(event: { headers?: Record<string, string | undefined> | null }): string {
  const origin = event.headers?.origin ?? event.headers?.Origin ?? '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://maidlink.ca';
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://maidlink.ca',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
};

/**
 * Middleware wrapper that verifies the JWT from the Authorization header
 * and injects an AuthContext into the handler.
 *
 * Usage:
 *   export const handler = withAuth(async (event, auth) => { ... });
 *
 * Role guard:
 *   export const handler = withAuth(async (event, auth) => { ... }, ['ADMIN']);
 */
export function withAuth(
  fn: AuthenticatedHandler,
  requiredRoles?: string[]
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const origin = corsOrigin(event);
    try {
      const payload = verifyToken(event.headers?.Authorization || event.headers?.authorization);

      const auth: AuthContext = {
        userId:        payload.sub,
        email:         payload.email,
        roles:         payload.roles,
        maidStatus:    payload.maidStatus,
        maidProfileId: payload.maidProfileId,
      };

      // Optional role guard
      if (requiredRoles && requiredRoles.length > 0) {
        const hasRole = requiredRoles.some(r => auth.roles.includes(r));
        if (!hasRole) {
          throw new ForbiddenError(`Requires one of: ${requiredRoles.join(', ')}`);
        }
      }

      const result = await fn(event, auth);
      return { ...result, headers: { ...result.headers, 'Access-Control-Allow-Origin': origin } };
    } catch (err) {
      return toErrorResponse(err, origin);
    }
  };
}

/** Helper: standard 200 JSON response with CORS headers */
export function ok<T>(data: T): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ data }),
  };
}

/** Helper: 201 Created JSON response */
export function created<T>(data: T): APIGatewayProxyResult {
  return {
    statusCode: 201,
    headers: CORS_HEADERS,
    body: JSON.stringify({ data }),
  };
}

/** Helper: 204 No Content */
export function noContent(): APIGatewayProxyResult {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}
