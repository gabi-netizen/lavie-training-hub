// Test script to check what URL storageGet returns and if it's accessible
import { createRequire } from 'module';

const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;
const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;

console.log('forgeApiUrl:', forgeApiUrl ? forgeApiUrl.slice(0, 50) + '...' : 'NOT SET');
console.log('forgeApiKey set:', !!forgeApiKey);

if (!forgeApiUrl || !forgeApiKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const baseUrl = forgeApiUrl.endsWith('/') ? forgeApiUrl : forgeApiUrl + '/';
const testKey = 'test-audio/test.mp3';

// Test the downloadUrl endpoint
const downloadApiUrl = new URL('v1/storage/downloadUrl', baseUrl);
downloadApiUrl.searchParams.set('path', testKey);

console.log('\nCalling downloadUrl endpoint:', downloadApiUrl.toString());
const response = await fetch(downloadApiUrl.toString(), {
  method: 'GET',
  headers: { Authorization: `Bearer ${forgeApiKey}` }
});
console.log('Response status:', response.status);
const body = await response.json();
console.log('Response body:', JSON.stringify(body));

if (body.url) {
  console.log('\nTesting if URL is accessible without auth...');
  const testFetch = await fetch(body.url);
  console.log('Direct fetch status:', testFetch.status);
}
