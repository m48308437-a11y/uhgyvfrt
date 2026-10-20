import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presign } from '../server/lib/s3.js';

// بردار تست رسمی AWS: «Authenticating Requests: Using Query Parameters» (مثال GET test.txt)
test('امضای SigV4 با بردار تست رسمی AWS مطابقت دارد', () => {
  const url = presign(
    { endpoint: 'https://s3.amazonaws.com', region: 'us-east-1', bucket: 'examplebucket', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', forcePathStyle: false },
    { method: 'GET', key: 'test.txt', expires: 86400, now: new Date('2013-05-24T00:00:00Z') },
  );
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), url);
});
