import { createHash } from 'node:crypto';
import type { AttachmentKind } from './attachmentAnalysis.js';

// Attachment contents, provider summaries and signed media URLs are never
// conversational facts. Only this short-lived classification crosses HTTP steps.
export type AttachmentTurn = { source_hash: string; kind: AttachmentKind; created_at: number };
export const attachmentSourceHash = (value: string) => createHash('sha256').update(value.trim()).digest('hex');

export function readAttachmentTurn(value: unknown, now = Date.now()): AttachmentTurn | undefined {
  const attachment = value as Partial<AttachmentTurn> | undefined;
  if (!attachment || !/^[a-f0-9]{64}$/.test(attachment.source_hash || '') ||
      !['payment_receipt', 'other', 'unreadable'].includes(attachment.kind || '') ||
      !Number.isFinite(attachment.created_at) || now < attachment.created_at! ||
      now - attachment.created_at! > 15 * 60000) return;
  return { source_hash: attachment.source_hash!, kind: attachment.kind!, created_at: attachment.created_at! };
}

export function attachmentForMessage(raw: string, state: any, now = Date.now()): AttachmentTurn | undefined {
  const attachment = readAttachmentTurn(state?.attachment, now);
  return attachment?.source_hash === attachmentSourceHash(raw) ? attachment : undefined;
}

export const attachmentDecision = (kind: AttachmentKind) => kind === 'payment_receipt' ? 'ANEXO_FINANCEIRO' : 'ANEXO_SETOR';
export const attachmentContextMessage = (kind: AttachmentKind) => kind === 'payment_receipt'
  ? '[Cliente enviou um possível comprovante de pagamento; recebimento financeiro não conferido.]'
  : '[Cliente enviou um anexo para análise humana.]';

// These are pending response templates. The native flow must assign/notify the
// responsible team before sending them. Returning them is not a delivery receipt.
export const attachmentAnswer = (kind: AttachmentKind) => kind === 'payment_receipt'
  ? 'Recebi seu comprovante. Estou encaminhando à nossa equipe para conferência e, após confirmação, lançamento do pagamento na reserva. Em breve retornaremos por aqui.'
  : 'Recebi seu anexo. Estou encaminhando ao setor responsável para análise. Em breve retornaremos por aqui.';

// The media/package fallback cannot execute the native handoff itself, so it
// must never report an assignment as completed (or even in progress).
export const attachmentReceivedMessage = (kind: AttachmentKind) => kind === 'payment_receipt'
  ? 'Recebi seu comprovante. O pagamento ainda precisa de conferência pelo financeiro antes do lançamento na reserva.'
  : 'Recebi seu anexo. Ele precisa de análise do setor responsável.';
