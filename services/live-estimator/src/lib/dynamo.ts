import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ca-west-1' });
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.DYNAMO_TABLE!;

export interface RoomSummary {
  room:             string;
  condition:        string;
  estimatedMinutes: number;
  observations:     string;
  priorityTasks:    string[];
}

export interface ConversationMessage {
  role:    'user' | 'assistant';
  content: unknown[];
}

export interface LiveSession {
  connectionId:        string;
  userId:              string;
  sessionId:           string;
  rooms:               string[];
  cleaningType:        string;
  bedrooms:            number;
  bathrooms:           number;
  sqftRange:           string;
  currentRoomIndex:    number;  // kept for compat; use currentRoom for active room name
  currentRoom:         string;
  roomSummaries:       RoomSummary[];
  conversationHistory: ConversationMessage[];
  frameCount:          number;
  startedAt:           string;
  ttl:                 number;
}

export async function getSession(connectionId: string): Promise<LiveSession | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { connectionId } }));
  return (res.Item as LiveSession) ?? null;
}

export async function putSession(session: LiveSession): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: session }));
}

export async function updateSession(
  connectionId: string,
  updates: Partial<Omit<LiveSession, 'connectionId'>>,
): Promise<void> {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;

  const expNames: Record<string, string>  = {};
  const expValues: Record<string, unknown> = {};
  const setParts: string[] = [];

  for (const [k, v] of entries) {
    expNames[`#${k}`]  = k;
    expValues[`:${k}`] = v;
    setParts.push(`#${k} = :${k}`);
  }

  await ddb.send(new UpdateCommand({
    TableName:                 TABLE,
    Key:                       { connectionId },
    UpdateExpression:          `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames:  expNames,
    ExpressionAttributeValues: expValues,
  }));
}

export async function deleteSession(connectionId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { connectionId } }));
}
