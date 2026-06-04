import { PollyClient, SynthesizeSpeechCommand, Engine, OutputFormat, VoiceId } from '@aws-sdk/client-polly';

// Polly not available in ca-west-1 — use us-east-1 (same as SES)
const polly = new PollyClient({ region: 'us-east-1' });

export async function synthesizeSpeech(text: string): Promise<string> {
  const command = new SynthesizeSpeechCommand({
    Text:         text,
    Engine:       Engine.NEURAL,
    OutputFormat: OutputFormat.MP3,
    VoiceId:      VoiceId.Joanna,
  });

  const res = await polly.send(command);
  if (!res.AudioStream) throw new Error('Polly returned no audio stream');

  const chunks: Uint8Array[] = [];
  for await (const chunk of res.AudioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString('base64');
}
