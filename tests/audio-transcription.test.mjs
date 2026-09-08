import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['utils/audioTranscription.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { isAudioInput, transcribeAudio } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const source = 'https://cdn.example.com/voice.ogg?signature=private-fixture';
const authorization = 'Bearer fixture-key';
const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), Buffer.from('OpusHead'), Buffer.alloc(40, 1)]);
const audio = () => new Response(ogg, { headers: { 'content-type': 'audio/ogg; codecs=opus' } });
const transcript = text => Response.json({ text });
const errorCode = code => error => {
  assert.equal(error.code, code);
  assert.equal(error.message, 'Não foi possível transcrever o áudio.');
  assert.doesNotMatch(error.message, /private-fixture|fixture-key/);
  return true;
};

test('reconhece somente URLs HTTPS de áudio, preservando mensagens e links de imagem/cardápio', () => {
  for (const ext of ['ogg', 'oga', 'opus', 'mp3', 'm4a', 'wav', 'webm', 'mp4']) assert.equal(isAudioInput(`https://cdn.example.com/voice.${ext}?token=fixture`), true, ext);
  for (const value of [null, {}, '', 'Quero o cardápio do Reserva Solar', 'https://cardapio.example.com/', 'https://cdn.example.com/photo.jpg', 'https://cdn.example.com/photo.jpg?audio=.ogg', 'Ouça https://cdn.example.com/voice.ogg', 'http://cdn.example.com/a.ogg', 'https://user:secret@cdn.example.com/a.ogg', 'https://cdn.example.com:8443/a.ogg']) assert.equal(isAudioInput(value), false, String(value));
});

test('baixa OGG e transcreve em português, sem repassar credencial ao CDN', async () => {
  const calls = [];
  const text = await transcribeAudio(source, authorization, { lookup, fetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? audio() : transcript('  Qual é o cardápio do Reserva Solar?  ');
  } });
  assert.equal(text, 'Qual é o cardápio do Reserva Solar?');
  assert.equal(calls[0].init.headers, undefined);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[1].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(calls[1].init.headers.Authorization, authorization);
  assert.equal(calls[1].init.redirect, 'error');
  assert.equal(calls[1].init.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(calls[1].init.body.get('language'), 'pt');
  const file = calls[1].init.body.get('file');
  assert.equal(file.name, 'audio.ogg');
  assert.equal(file.type, 'audio/ogg');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), ogg);
});

test('preserva contêiner/MIME de cada formato e normaliza apenas aliases Ogg', async () => {
  const wav = Buffer.alloc(64);
  wav.write('RIFF', 0); wav.writeUInt32LE(56, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(20, 40); wav[44] = 5;
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40, 1)]);
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(40, 1)]);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm'), Buffer.alloc(40, 1)]);
  for (const [extension, bytes, expectedExtension, mime] of [
    ['oga', ogg, 'ogg', 'audio/ogg'], ['opus', ogg, 'ogg', 'audio/ogg'],
    ['mp3', mp3, 'mp3', 'audio/mpeg'], ['m4a', mp4, 'm4a', 'audio/mp4'],
    ['mp4', mp4, 'mp4', 'audio/mp4'], ['webm', webm, 'webm', 'audio/webm'], ['wav', wav, 'wav', 'audio/wav'],
  ]) {
    let calls = 0;
    await transcribeAudio(`https://cdn.example.com/voice.${extension}`, authorization, { lookup, fetch: async (_url, init) => {
      if (++calls === 1) return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
      const file = init.body.get('file');
      assert.equal(file.type, mime);
      assert.equal(file.name, `audio.${expectedExtension}`);
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
      return transcript('Bom dia');
    } });
  }
  wav[44] = 0;
  await assert.rejects(transcribeAudio('https://cdn.example.com/silent.wav', authorization, { lookup, fetch: async () => new Response(wav) }), errorCode('INVALID_AUDIO'));
});

test('valida novamente cada redirecionamento e bloqueia DNS privado ou misto antes do download', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::', '2001:db8::1']) {
    let downloads = 0;
    await assert.rejects(transcribeAudio(source, authorization, {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }],
      fetch: async () => { downloads++; return audio(); },
    }), errorCode('INVALID_AUDIO_URL'));
    assert.equal(downloads, 0, address);
  }
  const seen = [];
  await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async url => {
    seen.push(url);
    return new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/metadata.ogg' } });
  } }), errorCode('INVALID_AUDIO_URL'));
  assert.equal(seen.length, 1);
});

test('segue redirecionamento público com limite e sem enviar Authorization', async () => {
  const hosts = [];
  const calls = [];
  const result = await transcribeAudio(source, authorization, {
    lookup: async host => { hosts.push(host); return lookup(); },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response(null, { status: 307, headers: { location: 'https://media.example.com/signed-download?id=fixture' } });
      return calls.length === 2 ? audio() : transcript('Bom dia');
    },
  });
  assert.equal(result, 'Bom dia');
  assert.deepEqual(hosts, ['cdn.example.com', 'media.example.com']);
  assert.equal(calls[1].init.headers, undefined);
  let requests = 0;
  await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: source } });
  } }), errorCode('AUDIO_DOWNLOAD_FAILED'));
  assert.equal(requests, 4);
});

test('limita o áudio a 8 MiB tanto pelo cabeçalho quanto durante o streaming', async () => {
  for (const response of [
    new Response(ogg, { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } })),
  ]) {
    let calls = 0;
    await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => { calls++; return response; } }), errorCode('AUDIO_TOO_LARGE'));
    assert.equal(calls, 1);
  }
});

test('rejeita HTML disfarçado, assinatura inválida, áudio vazio e resposta sem fala', async () => {
  for (const response of [new Response('<html>access denied</html>', { headers: { 'content-type': 'text/html' } }), new Response(Buffer.alloc(64), { headers: { 'content-type': 'audio/ogg' } }), new Response(new Uint8Array())]) {
    let calls = 0;
    await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => { calls++; return response; } }), errorCode('INVALID_AUDIO'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => ++calls === 1 ? audio() : transcript('   ') }), errorCode('EMPTY_TRANSCRIPTION'));
});

test('falhas de download e OpenAI retornam erros genéricos sem expor conteúdo externo', async () => {
  await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => new Response('private-fixture', { status: 403 }) }), errorCode('AUDIO_DOWNLOAD_FAILED'));
  let calls = 0;
  await assert.rejects(transcribeAudio(source, authorization, { lookup, fetch: async () => ++calls === 1 ? audio() : new Response('fixture-key', { status: 401 }) }), errorCode('TRANSCRIPTION_FAILED'));
  await assert.rejects(transcribeAudio(source, authorization, { lookup: async () => { throw new Error(source); } }), errorCode('TRANSCRIPTION_FAILED'));
  await assert.rejects(transcribeAudio(source, '', { lookup }), errorCode('MISSING_AUTHORIZATION'));
});

test('um prazo total abrange DNS, download, streaming e transcrição, mesmo se a dependência não respeitar abort', async () => {
  for (const stage of ['dns', 'download', 'body', 'transcription']) {
    let calls = 0;
    let signal;
    const started = Date.now();
    await assert.rejects(transcribeAudio(source, authorization, {
      timeoutMs: 25,
      lookup: stage === 'dns' ? () => new Promise(() => {}) : lookup,
      fetch: async (_url, init) => {
        signal = init.signal;
        calls++;
        if (stage === 'download' || (stage === 'transcription' && calls === 2)) return new Promise(() => {});
        if (stage === 'body') return new Response(new ReadableStream({ start() {} }));
        return audio();
      },
    }), errorCode('TRANSCRIPTION_TIMEOUT'));
    assert.ok(Date.now() - started < 250, stage);
    if (signal) assert.equal(signal.aborted, true);
  }
});
