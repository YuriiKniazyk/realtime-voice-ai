export const STT_PROVIDER = Symbol('STT_PROVIDER');
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export interface AudioInput {
  data: Buffer;
  /** MIME type reported by the browser, e.g. "audio/webm;codecs=opus". */
  mimeType: string;
}

export interface SpeechToText {
  transcribe(audio: AudioInput, signal?: AbortSignal): Promise<string>;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LanguageModel {
  readonly name: string;
  /** Streams the assistant reply as text deltas. */
  streamReply(history: ChatTurn[], signal?: AbortSignal): AsyncIterable<string>;
}

export interface TextToSpeech {
  /** Returns the synthesized audio (MP3) for one chunk of text. */
  synthesize(text: string, signal?: AbortSignal): Promise<Buffer>;
}

export const SYSTEM_PROMPT = [
  'You are a friendly voice assistant. Your replies are converted to speech.',
  'Latency-sensitive; begin your visible answer immediately.',
  'Answer in the language the user speaks, in short conversational sentences.',
  'Do not use markdown, lists, emojis, code blocks or URLs: they cannot be spoken.',
].join(' ');
