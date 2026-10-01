import {
  AudioInput,
  ChatTurn,
  LanguageModel,
  SpeechToText,
  TextToSpeech,
} from '../providers/types.js';
import { SentenceChunker } from './sentence-chunker.js';

export interface TurnMetrics {
  /** Speech-to-text duration. */
  sttMs: number;
  /** From the end of STT to the first LLM token. */
  llmFirstTokenMs: number;
  /** From the end of the user's speech to the first playable audio. The number users feel. */
  firstAudioMs: number;
  totalMs: number;
}

export type PipelineEvent =
  | { type: 'transcript'; text: string }
  | { type: 'reply_delta'; text: string }
  | { type: 'audio'; seq: number; text: string; data: string }
  | { type: 'metrics'; metrics: TurnMetrics }
  | { type: 'done' };

export type Emit = (event: PipelineEvent) => void;

/**
 * One conversational turn: STT → streaming LLM → sentence chunking → TTS.
 *
 * The latency wins come from overlapping the stages: TTS for a sentence
 * starts while the LLM is still writing the next one, and every chunk is
 * synthesized in parallel but delivered to the client strictly in order.
 */
export class VoicePipeline {
  constructor(
    private readonly stt: SpeechToText,
    private readonly llm: LanguageModel,
    private readonly tts: TextToSpeech,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Runs one turn and appends it to `history` once the reply is complete. */
  async runTurn(
    audio: AudioInput,
    history: ChatTurn[],
    emit: Emit,
    signal?: AbortSignal,
  ): Promise<void> {
    const start = this.now();

    const transcript = await this.stt.transcribe(audio, signal);
    const sttDone = this.now();
    emit({ type: 'transcript', text: transcript });
    if (!transcript) {
      emit({ type: 'done' });
      return;
    }

    const turnHistory: ChatTurn[] = [...history, { role: 'user', content: transcript }];
    const chunker = new SentenceChunker();
    let reply = '';
    let firstTokenAt: number | undefined;
    let firstAudioAt: number | undefined;
    let seq = 0;

    // Chunks are synthesized concurrently; this chain only orders delivery.
    let delivery: Promise<void> = Promise.resolve();
    const speak = (text: string) => {
      const audioPromise = this.tts.synthesize(text, signal);
      audioPromise.catch(() => undefined); // surfaced by the await below
      const chunkSeq = seq++;
      delivery = delivery.then(async () => {
        const data = await audioPromise;
        firstAudioAt ??= this.now();
        emit({ type: 'audio', seq: chunkSeq, text, data: data.toString('base64') });
      });
    };

    for await (const delta of this.llm.streamReply(turnHistory, signal)) {
      firstTokenAt ??= this.now();
      reply += delta;
      emit({ type: 'reply_delta', text: delta });
      chunker.push(delta).forEach(speak);
    }
    chunker.flush().forEach(speak);
    await delivery;

    history.push({ role: 'user', content: transcript }, { role: 'assistant', content: reply });

    const end = this.now();
    emit({
      type: 'metrics',
      metrics: {
        sttMs: Math.round(sttDone - start),
        llmFirstTokenMs: Math.round((firstTokenAt ?? end) - sttDone),
        firstAudioMs: Math.round((firstAudioAt ?? end) - start),
        totalMs: Math.round(end - start),
      },
    });
    emit({ type: 'done' });
  }
}
