import { signToken } from '../../../packages/shared/src/jwt';

/** Generate a valid HS256 JWT for use in integration tests. */
export function makeToken(
  userId: string,
  { email, roles }: { email?: string; roles?: string[] } = {},
): string {
  return signToken({
    sub:           userId,
    email:         email ?? `${userId.slice(0, 8)}@test.local`,
    roles:         roles ?? ['CUSTOMER'],
    maidStatus:    undefined,
    maidProfileId: undefined,
  });
}

/**
 * Builds a minimal APIGatewayProxyEvent-shaped object that Lambda handlers
 * accept. Type is `any` so callers aren't forced to install @types/aws-lambda
 * in the test helper itself — the handlers cast it appropriately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeEvent(opts: {
  method?:              string;
  pathParameters?:      Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?:                unknown;
  token?:               string;
} = {}): any {
  return {
    httpMethod:                      opts.method ?? 'POST',
    path:                            '/',
    resource:                        '',
    headers:                         opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
    multiValueHeaders:               {},
    pathParameters:                  opts.pathParameters  ?? null,
    queryStringParameters:           opts.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    body:                            opts.body !== undefined ? JSON.stringify(opts.body) : null,
    isBase64Encoded:                 false,
    stageVariables:                  null,
    requestContext:                  {} as any,   // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}
