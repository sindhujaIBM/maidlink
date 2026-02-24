import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyToken } from '../jwt';
import type { AuthContext } from '../types/api';
import { toErrorResponse, ForbiddenError } from '../errors';

type AuthenticatedHandler = (
  event: APIGatewayProxyEvent,
  auth: AuthContext
) => Promise<APIGatewayProxyResult>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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

      return await fn(event, auth);
    } catch (err) {
      return toErrorResponse(err);
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
