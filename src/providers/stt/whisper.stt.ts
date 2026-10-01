import OpenAI, { toFile } from 'openai';
import { AudioInput, SpeechToText } from '../types.js';

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export class WhisperSpeechToText implements SpeechToText {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async transcribe(audio: AudioInput, signal?: AbortSignal): Promise<string> {
    const baseType = audio.mimeType.split(';')[0].trim();
    const file = await toFile(audio.data, `speech.${EXTENSIONS[baseType] ?? 'webm'}`, {
      type: baseType,
    });
    const result = await this.client.audio.transcriptions.create(
      { file, model: this.model },
      { signal },
    );
    return result.text.trim();
  }
}
