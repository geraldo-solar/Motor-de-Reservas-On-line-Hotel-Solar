# ManyChat audio smoke test

`public/audio-smoke-reserva-solar.wav` is synthetic Portuguese speech generated
locally with the macOS Luciana voice at 16 kHz PCM. It contains only:

> Olá. Qual é o cardápio do restaurante Reserva Solar?

No customer recording or personal information is used. The public fixture is
intended to verify the complete media download and real transcription provider
from ManyChat's External Request test without sending a WhatsApp message.

The existing `prepare` request to `/api/conversation-control` accepts the audio
URL in `user_message`. Configure its `Authorization: Bearer ...` header with the
dedicated OpenAI audio key. Text requests do not call the transcription provider.
Only the prepare request needs the key; later routes use the matching transient
transcript and never download the recording again.

For the smoke test, temporarily replace `user_message` with
`https://reservas.hotelsolar.tur.br/audio-smoke-reserva-solar.wav`, use empty state
and quote_state, and click Test Request. Expect HTTP 200,
`transcription_status: ok`, and the spoken restaurant question in context.
Restore the original request body/official ManyChat variables before saving.

Downloads plus transcription have a 7.5-second deadline and an 8 MiB size limit.
Failures produce a neutral request to resend/type, without reusing an older
message, starting a quote, or exposing provider errors. A real inbound WhatsApp
audio still verifies channel routing end-to-end after publication.
