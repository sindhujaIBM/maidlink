import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

let _client: ApiGatewayManagementApiClient | null = null;

function getClient(endpoint: string) {
  if (!_client) {
    _client = new ApiGatewayManagementApiClient({ endpoint, region: 'ca-west-1' });
  }
  return _client;
}

export async function pushToConnection(
  connectionId: string,
  endpoint: string,
  data: unknown,
): Promise<void> {
  const client = getClient(endpoint);
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data:         Buffer.from(JSON.stringify(data)),
  }));
}
