import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { verifyToken, getPool } from '@maidlink/shared';
import { putSession } from '../lib/dynamo';
import { randomUUID } from 'crypto';

const LIFETIME_LIMIT = 2;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  // queryStringParameters is present on $connect but not in some @types/aws-lambda versions
  const params = (event as unknown as { queryStringParameters?: Record<string, string> }).queryStringParameters;
  const token  = params?.token;
  console.log('connect attempt', { hasToken: !!token, tokenLength: token?.length ?? 0 });
  if (!token) return { statusCode: 401, body: 'Missing token' };

  let auth: ReturnType<typeof verifyToken>;
  try {
    // verifyToken expects "Bearer <token>" format
    auth = verifyToken(`Bearer ${token}`);
  } catch (err) {
    console.error('token verify failed', (err as Error).message);
    return { statusCode: 401, body: 'Invalid token' };
  }

  // Rate limit: 2 lifetime live sessions per user (ADMIN exempt)
  if (!auth.roles.includes('ADMIN')) {
    const pool = getPool();
    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM estimator_analyses WHERE user_id = $1 AND source = 'live'`,
      [auth.sub],
    );
    if (parseInt(count, 10) >= LIFETIME_LIMIT) {
      return { statusCode: 403, body: 'Live analysis limit reached' };
    }
  }

  const connectionId = event.requestContext.connectionId;
  const now          = new Date();

  await putSession({
    connectionId,
    userId:              auth.sub,
    sessionId:           randomUUID(),
    rooms:               [],
    cleaningType:        'Standard Cleaning',
    bedrooms:            1,
    bathrooms:           1,
    sqftRange:           '500-1000',
    currentRoomIndex:    0,
    currentRoom:         '',
    roomSummaries:       [],
    conversationHistory: [],
    frameCount:          0,
    startedAt:           now.toISOString(),
    ttl:                 Math.floor(now.getTime() / 1000) + 7200, // 2-hour TTL
  });

  return { statusCode: 200, body: 'Connected' };
};
