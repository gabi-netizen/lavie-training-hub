// Test Deepgram transcription with the actual audio URL
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DeepgramClient } = require('@deepgram/sdk');

const apiKey = process.env.DEEPGRAM_API_KEY;
console.log('DEEPGRAM_API_KEY set:', !!apiKey, '| Length:', apiKey?.length);

const deepgram = new DeepgramClient({ apiKey });

// Test with a real audio URL from the DB
const audioUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663435925457/SE3FVyjnhToTwUpMie8Tvm/call-recordings/moa0wnpf-Paige_Taylor_-_Janive_Sanderson_-_22-04-2026_-_12.46_Closed_call_check_for_complience.wav';

console.log('Fetching audio...');
const audioRes = await fetch(audioUrl);
console.log('Audio fetch status:', audioRes.status, '| Content-Type:', audioRes.headers.get('content-type'));
const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
console.log('Audio buffer size:', audioBuffer.length, 'bytes');

console.log('Sending to Deepgram...');
try {
  const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
    model: 'nova-2',
    punctuate: true,
    language: 'en',
    mimetype: 'audio/wav',
  });
  console.log('Deepgram response metadata:', JSON.stringify(response?.metadata ?? {}).slice(0, 200));
  const transcript = response?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  console.log('Transcript preview:', transcript.slice(0, 200));
} catch (err) {
  console.error('Deepgram error:', err.message ?? err);
  if (err.body) console.error('Error body:', JSON.stringify(err.body));
  if (err.statusCode) console.error('Status code:', err.statusCode);
}
