import { TextToSpeech } from '../types.js';

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  model: string;
}

export class ElevenLabsTextToSpeech implements TextToSpeech {
  constructor(
    private readonly options: ElevenLabsOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async synthesize(text: string, signal?: AbortSignal): Promise<Buffer> {
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.options.voiceId)}` +
      '?output_format=mp3_44100_128';

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.options.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: this.options.model }),
      signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed with ${response.status}: ${details.slice(0, 200)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
