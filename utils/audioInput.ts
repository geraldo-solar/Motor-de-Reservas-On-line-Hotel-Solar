import { createHash } from 'node:crypto';

export const AUDIO_UNAVAILABLE = '[audio_nao_transcrito]';
export const AUDIO_RETRY = 'Não consegui entender esse áudio. Pode reenviar ou escrever a mensagem, por favor?';
export type AudioTurn = { source_hash: string; text: string; status: 'ok' | 'error'; created_at: number };
export const audioSourceHash = (value: string) => createHash('sha256').update(value.trim()).digest('hex');

export function readAudioTurn(value: unknown, now = Date.now()): AudioTurn | undefined {
  const audio = value as Partial<AudioTurn> | undefined;
  if (!audio || !/^[a-f0-9]{64}$/.test(audio.source_hash || '') ||
      !['ok', 'error'].includes(audio.status || '') || typeof audio.text !== 'string' ||
      !audio.text.trim() || audio.text.length > 2000 || !Number.isFinite(audio.created_at) ||
      now < audio.created_at! || now - audio.created_at! > 15 * 60000) return;
  return { source_hash: audio.source_hash!, text: audio.text, status: audio.status!, created_at: audio.created_at! };
}

// A transcription belongs to one incoming file, never to the next message.
// Only a hash of the temporary media URL is retained in the conversation state.
export function audioMessage(raw: string, state: any, now = Date.now()): string | undefined {
  const audio = readAudioTurn(state?.audio, now);
  if (audio?.source_hash !== audioSourceHash(raw)) return;
  return audio.status === 'ok' ? audio.text : AUDIO_UNAVAILABLE;
}
