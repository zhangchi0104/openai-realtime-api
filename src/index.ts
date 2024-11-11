/** @format */

import { OpenAIRealtimeClient, RealtimeModels } from './client';
async function main() {
  const client = new OpenAIRealtimeClient(
    process.env.OPENAI_API_KEY || '',
    RealtimeModels.GPT_4O_REALTIME
  );
  const resp = await client.connect();
  console.log({ resp });
  console.time('sendAudio');
  await client.sendAudio('input3.wav');
  console.timeEnd('sendAudio');
  process.exit(0);
}
main();
