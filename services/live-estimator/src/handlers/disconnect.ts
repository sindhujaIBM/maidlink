import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { deleteSession } from '../lib/dynamo';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  await deleteSession(event.requestContext.connectionId);
  return { statusCode: 200, body: 'Disconnected' };
};
