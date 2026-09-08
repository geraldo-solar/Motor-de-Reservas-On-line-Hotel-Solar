import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 7500;
const OPENAI_TRANSCRIPTIONS = 'https://api.openai.com/v1/audio/transcriptions';
const AUDIO_EXTENSION = /\.(ogg|oga|opus|mp3|m4a|wav|webm|mp4)$/i;
type Address = { address: string; family: number };
export type AudioTranscriptionDependencies = {
  fetch?: typeof fetch;
  lookup?: (hostname: string, options: { all: true }) => Promise<Address[]>;
  /** Tests may shorten the deadline; production can never exceed 7.5 seconds. */
  timeoutMs?: number;
};
export class AudioTranscriptionError extends Error {
  constructor(public readonly code: string) {
    super('Não foi possível transcrever o áudio.');
    this.name = 'AudioTranscriptionError';
  }
}
const fail = (code: string): never => { throw new AudioTranscriptionError(code); };

function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (!url.hostname || url.hash) return null;
    return url;
  } catch { return null; }
}

/** Only an entire audio URL is an attachment; prose, menu links and images stay text. */
export function isAudioInput(value: unknown): boolean {
  const url = parseUrl(value);
  return !!url && AUDIO_EXTENSION.test(url.pathname);
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  // Only native global unicast. This also rejects mapped IPv4, NAT64, ULA,
  // multicast, loopback and link-local addresses, including metadata endpoints.
  const first = Number.parseInt(address.split(':')[0], 16);
  const second = Number.parseInt(address.split(':')[1] || '0', 16);
  return first >= 0x2000 && first < 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

async function publicAddresses(url: URL, lookup: NonNullable<AudioTranscriptionDependencies['lookup']>): Promise<Address[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) fail('INVALID_AUDIO_URL');
  return addresses;
}

/** Pin the validated DNS result; a second system lookup could otherwise rebind to a private IP. */
function downloadPinned(url: URL, addresses: Address[], signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const address = addresses.find(item => item.family === 4) || addresses[0];
    const req = httpsRequest(url, {
      method: 'GET', signal, agent: false,
      headers: { Accept: 'audio/*, application/ogg, application/octet-stream', 'Accept-Encoding': 'identity' },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, incoming => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const status = incoming.statusCode || 502;
      const emptyBody = [204, 205, 304].includes(status);
      if (emptyBody) incoming.resume();
      resolve(new Response(emptyBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function boundedBody(response: Response, maxBytes: number, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const advertised = Number(response.headers.get('content-length'));
  if (advertised > maxBytes) {
    void response.body?.cancel().catch(() => {});
    fail(code);
  }
  if (!response.body) fail('INVALID_AUDIO');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        fail(code);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function audioFile(bytes: Uint8Array, extension: string): { mime: string; extension: string } {
  if (bytes.length < 32) fail('INVALID_AUDIO');
  const ascii = (start: number, length: number) => Buffer.from(bytes.subarray(start, start + length)).toString('latin1');
  if (['ogg', 'oga', 'opus'].includes(extension)) {
    const head = ascii(0, Math.min(bytes.length, 65536));
    if (ascii(0, 4) !== 'OggS' || (!head.includes('OpusHead') && !head.includes('\x01vorbis'))) fail('INVALID_AUDIO');
    // .oga and .opus are Ogg aliases; the API documents the .ogg filename extension.
    return { mime: 'audio/ogg', extension: 'ogg' };
  }
  if (extension === 'mp3') {
    if (ascii(0, 3) !== 'ID3' && !(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) fail('INVALID_AUDIO');
    return { mime: 'audio/mpeg', extension };
  }
  if (extension === 'm4a' || extension === 'mp4') {
    if (ascii(4, 4) !== 'ftyp') fail('INVALID_AUDIO');
    return { mime: 'audio/mp4', extension };
  }
  if (extension === 'webm') {
    if (ascii(0, 4) !== '\x1a\x45\xdf\xa3' || !ascii(0, Math.min(bytes.length, 4096)).includes('webm')) fail('INVALID_AUDIO');
    return { mime: 'audio/webm', extension };
  }
  if (extension === 'wav') {
    if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') fail('INVALID_AUDIO');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pcm = false, bits = 0, hasData = false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (start + size > bytes.length) fail('INVALID_AUDIO');
      if (ascii(offset, 4) === 'fmt ' && size >= 16) {
        pcm = view.getUint16(start, true) === 1;
        bits = view.getUint16(start + 14, true);
      }
      if (ascii(offset, 4) === 'data') {
        hasData = size > 0;
        if (!hasData || (pcm && bytes.subarray(start, start + size).every(b => b === (bits === 8 ? 128 : 0)))) fail('INVALID_AUDIO');
      }
      offset = start + size + (size % 2);
    }
    if (!hasData) fail('INVALID_AUDIO');
    return { mime: 'audio/wav', extension };
  }
  return fail('INVALID_AUDIO');
}

/** Download and transcription share one deadline, leaving time for ManyChat's 10-second response. */
export async function transcribeAudio(urlValue: string, authorization: string, deps: AudioTranscriptionDependencies = {}): Promise<string> {
  if (!isAudioInput(urlValue)) fail('INVALID_AUDIO_URL');
  if (!/^Bearer\s+\S+$/i.test(authorization || '')) fail('MISSING_AUTHORIZATION');
  const original = parseUrl(urlValue)!;
  const extension = AUDIO_EXTENSION.exec(original.pathname)![1].toLowerCase();
  const signalController = new AbortController();
  const configuredTimeout = deps.timeoutMs ?? TOTAL_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(TOTAL_TIMEOUT_MS, Math.max(1, configuredTimeout)) : TOTAL_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AudioTranscriptionError('TRANSCRIPTION_TIMEOUT'));
      signalController.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let url = original;
      let response: Response | undefined;
      for (let redirect = 0; redirect <= 3; redirect++) {
        const addresses = await publicAddresses(url, deps.lookup || dnsLookup);
        signalController.signal.throwIfAborted();
        response = deps.fetch
          ? await deps.fetch(url.toString(), { method: 'GET', redirect: 'manual', signal: signalController.signal })
          : await downloadPinned(url, addresses, signalController.signal);
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        void response.body?.cancel().catch(() => {});
        const location = response.headers.get('location');
        if (!location || redirect === 3) fail('AUDIO_DOWNLOAD_FAILED');
        const next = parseUrl(new URL(location, url).toString());
        if (!next) fail('INVALID_AUDIO_URL');
        url = next;
      }
      if (!response?.ok) fail('AUDIO_DOWNLOAD_FAILED');
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith('audio/') && !['application/ogg', 'application/octet-stream', 'binary/octet-stream', 'video/mp4', 'video/webm'].includes(contentType)) fail('INVALID_AUDIO');
      const bytes = await boundedBody(response, MAX_AUDIO_BYTES, 'AUDIO_TOO_LARGE');
      const file = audioFile(bytes, extension);
      signalController.signal.throwIfAborted();
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: file.mime }), `audio.${file.extension}`);
      form.append('model', 'gpt-4o-mini-transcribe');
      form.append('language', 'pt');
      form.append('response_format', 'json');
      form.append('prompt', 'Transcreva apenas as palavras faladas. Não invente texto para silêncio, ruídos ou música.');
      const transcription = await (deps.fetch || fetch)(OPENAI_TRANSCRIPTIONS, {
        method: 'POST', redirect: 'error', signal: signalController.signal,
        headers: { Authorization: authorization }, body: form,
      });
      if (!transcription.ok) {
        void transcription.body?.cancel().catch(() => {});
        fail('TRANSCRIPTION_FAILED');
      }
      const data = JSON.parse(new TextDecoder().decode(await boundedBody(transcription, 65536, 'TRANSCRIPTION_FAILED')));
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!text) fail('EMPTY_TRANSCRIPTION');
      return text;
    })()]);
  } catch (error) {
    if (error instanceof AudioTranscriptionError) throw error;
    throw new AudioTranscriptionError(signalController.signal.aborted ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED');
  } finally {
    clearTimeout(timer!);
    signalController.abort();
  }
}
