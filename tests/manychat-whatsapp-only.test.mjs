import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['services/manychatService.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
});
const { findOsCreateSubscriber } = await import('data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('legacy registration creates WhatsApp only, even when CRM has email or SMS properties', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  // No live provider or guest is contacted by this regression test.
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return { json: async () => ({ status: 'success', data: { id: '123', name: 'Guest Example' } }) };
  };
  try {
    for (const phone of ['(91) 98204-1312', '+5591982041312']) {
      const result = await findOsCreateSubscriber({
        name: 'Guest Example', phone, email: 'fixture@example.invalid',
        has_opt_in_sms: true, has_opt_in_email: true, optin_sms: true,
      });
      assert.deepEqual(result, { id: '123', name: 'Guest Example' });
    }
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, '/api/send-manychat');
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.body, {
        endpoint: '/fb/subscriber/createSubscriber', method: 'POST',
        body: {
          first_name: 'Guest', last_name: 'Example',
          whatsapp_phone: '+5591982041312', consent_phrase: 'Reserva Hotel Solar',
        },
      });
      for (const key of ['phone', 'email', 'has_opt_in_sms', 'has_opt_in_email', 'optin_sms']) {
        assert.equal(key in call.body.body, false, `${key} must never enroll an extra channel`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
