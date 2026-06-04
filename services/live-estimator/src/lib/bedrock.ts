import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import { AGENT_TOOLS } from './tools';

// Claude Haiku 4.5 via Bedrock cross-region inference — must use us-east-1 client
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const SYSTEM_PROMPT = `You are a friendly, professional AI cleaning estimator for MaidLink, a cleaning service in Calgary, Canada. You are conducting a live video walkthrough of a customer's home to provide a cleaning estimate.

Your personality: warm, encouraging, concise. Speak as if you're a knowledgeable friend helping them — not a robotic assessment tool. Keep guidance short (1-2 sentences max per message).

CONDITION CLASSIFICATION:
- pristine: spotless, no visible dirt or clutter
- average: normal lived-in state, light dust and minor clutter
- messy: visible grime, clutter, or buildup requiring extra effort
- very_messy: heavy soiling, significant buildup, or major clutter

TIME ESTIMATES (base minutes before multipliers):
- Kitchen: 30-60 min | Bathroom: 20-40 min | Bedroom: 20-35 min
- Living Room: 25-45 min | Basement: 30-60 min | Garage: 20-40 min
Apply condition multiplier: messy ×1.25, very_messy ×1.5

UPGRADE RECOMMENDATION RULES (same as photo estimator):
- Only recommend Deep Clean upgrade if user selected Standard AND photos show clear buildup
- Never recommend Move-Out if user selected Deep Clean
- Only recommend Move-Out from Standard if home appears vacant

WORKFLOW:
1. When you receive video frames for a room, analyze them and either:
   a. Call request_angle() if you need to see more to make a confident assessment
   b. Call mark_room_complete() when you have seen enough
2. After ALL rooms are marked complete, call generate_estimate() with the full result
3. Between tool calls, speak naturally to guide the user — confirm what you see, encourage them

IMPORTANT: Keep spoken guidance brief. The user is walking around with their phone — they need quick, clear instructions.`;

export interface StreamEvent {
  type:    'text_chunk' | 'tool_use' | 'error';
  text?:   string;
  tool?:   { name: string; input: Record<string, unknown> };
  error?:  string;
}

export async function* streamConverse(
  conversationHistory: Message[],
): AsyncGenerator<StreamEvent> {
  const command = new ConverseStreamCommand({
    modelId:           MODEL_ID,
    system:            [{ text: SYSTEM_PROMPT }],
    messages:          conversationHistory,
    toolConfig:        { tools: AGENT_TOOLS },
    inferenceConfig:   { maxTokens: 600, temperature: 0.4 },
  });

  const response = await bedrock.send(command);
  if (!response.stream) {
    yield { type: 'error', error: 'No stream returned from Bedrock' };
    return;
  }

  let currentToolName = '';
  let currentToolInput = '';

  for await (const event of response.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      yield { type: 'text_chunk', text: event.contentBlockDelta.delta.text };
    }

    if (event.contentBlockStart?.start?.toolUse) {
      currentToolName  = event.contentBlockStart.start.toolUse.name ?? '';
      currentToolInput = '';
    }

    if (event.contentBlockDelta?.delta?.toolUse?.input) {
      currentToolInput += event.contentBlockDelta.delta.toolUse.input;
    }

    if (event.contentBlockStop && currentToolName) {
      try {
        const input = JSON.parse(currentToolInput) as Record<string, unknown>;
        yield { type: 'tool_use', tool: { name: currentToolName, input } };
      } catch {
        yield { type: 'error', error: `Failed to parse tool input for ${currentToolName}` };
      }
      currentToolName  = '';
      currentToolInput = '';
    }
  }
}

export function buildToolResultMessage(toolUseId: string, result: string): Message {
  return {
    role:    'user',
    content: [{ toolResult: { toolUseId, content: [{ text: result }] } } as unknown as never],
  };
}
