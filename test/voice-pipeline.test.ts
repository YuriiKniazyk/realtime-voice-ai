import { describe, expect, it } from 'vitest';
import {
  ChatTurn,
  LanguageModel,
  SpeechToText,
  TextToSpeech,
} from '../src/providers/types.js';
import { PipelineEvent, VoicePipeline } from '../src/voice/voice-pipeline.js';

const audio = { data: Buffer.from('fake-audio'), mimeType: 'audio/webm' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeStt = (text: string): SpeechToText => ({ transcribe: async () => text });

const fakeLlm = (deltas: string[], seen?: ChatTurn[][]): LanguageModel => ({
  name: 'fake',
  async *streamReply(history) {
    seen?.push(structuredClone(history));
    for (const delta of deltas) yield delta;
  },
});

/** TTS whose latency depends on the text, to prove delivery order is kept. */
const fakeTts = (delays: Record<string, number> = {}, started: string[] = []): TextToSpeech => ({
  async synthesize(text) {
    started.push(text);
    await sleep(delays[text] ?? 1);
    return Buffer.from(`mp3:${text}`);
  },
});

async function run(pipeline: VoicePipeline, history: ChatTurn[] = []) {
  const events: PipelineEvent[] = [];
  await pipeline.runTurn(audio, history, (event) => events.push(event));
  return events;
}

describe('VoicePipeline', () => {
  it('runs STT, streams the reply and speaks it sentence by sentence', async () => {
    const pipeline = new VoicePipeline(
      fakeStt('What is the capital of France?'),
      fakeLlm(['The capital of France ', 'is Paris. It is ', 'a beautiful city.']),
      fakeTts(),
    );

    const events = await run(pipeline);

    expect(events[0]).toEqual({ type: 'transcript', text: 'What is the capital of France?' });
    const audioEvents = events.filter((e) => e.type === 'audio');
    expect(audioEvents.map((e) => e.text)).toEqual([
      'The capital of France is Paris.',
      'It is a beautiful city.',
    ]);
    expect(Buffer.from(audioEvents[0].data, 'base64').toString()).toBe(
      'mp3:The capital of France is Paris.',
    );
    expect(events.at(-2)?.type).toBe('metrics');
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('synthesizes chunks in parallel but delivers them in order', async () => {
    const started: string[] = [];
    const pipeline = new VoicePipeline(
      fakeStt('Tell me something'),
      fakeLlm(['First sentence is slow to say. ', 'Second sentence is quick to say.']),
      // The first chunk takes much longer than the second one.
      fakeTts({ 'First sentence is slow to say.': 40, 'Second sentence is quick to say.': 1 }, started),
    );

    const events = await run(pipeline);

    expect(started).toHaveLength(2);
    const audioEvents = events.filter((e) => e.type === 'audio');
    expect(audioEvents.map((e) => e.seq)).toEqual([0, 1]);
    expect(audioEvents.map((e) => e.text)).toEqual([
      'First sentence is slow to say.',
      'Second sentence is quick to say.',
    ]);
  });

  it('starts TTS before the LLM has finished the reply', async () => {
    const timeline: string[] = [];
    const llm: LanguageModel = {
      name: 'slow',
      async *streamReply() {
        yield 'Here is the first sentence. ';
        await sleep(30);
        timeline.push('llm:last-delta');
        yield 'And here is the second one.';
      },
    };
    const tts: TextToSpeech = {
      async synthesize(text) {
        timeline.push(`tts:${text}`);
        return Buffer.from(text);
      },
    };

    await run(new VoicePipeline(fakeStt('hi there'), llm, tts));

    expect(timeline[0]).toBe('tts:Here is the first sentence.');
    expect(timeline[1]).toBe('llm:last-delta');
  });

  it('keeps conversation history across turns', async () => {
    const seen: ChatTurn[][] = [];
    const history: ChatTurn[] = [];
    const pipeline = new VoicePipeline(
      fakeStt('Hello'),
      fakeLlm(['Hi! How can I help you today?'], seen),
      fakeTts(),
    );

    await run(pipeline, history);
    await run(pipeline, history);

    expect(seen[1]).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help you today?' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(history).toHaveLength(4);
  });

  it('skips the LLM when nothing was said', async () => {
    const seen: ChatTurn[][] = [];
    const pipeline = new VoicePipeline(fakeStt(''), fakeLlm(['unused'], seen), fakeTts());

    const events = await run(pipeline);

    expect(seen).toHaveLength(0);
    expect(events).toEqual([{ type: 'transcript', text: '' }, { type: 'done' }]);
  });

  it('reports latency metrics for every stage', async () => {
    let t = 0;
    const clock = () => (t += 100);
    const pipeline = new VoicePipeline(
      fakeStt('Hi'),
      fakeLlm(['Hello, nice to meet you today. ']),
      fakeTts(),
      clock,
    );

    const events = await run(pipeline);
    const metrics = events.find((e) => e.type === 'metrics');

    expect(metrics?.metrics).toEqual({ sttMs: 100, llmFirstTokenMs: 100, firstAudioMs: 300, totalMs: 400 });
  });

  it('propagates TTS failures and does not record a half-finished turn', async () => {
    const history: ChatTurn[] = [];
    const pipeline = new VoicePipeline(
      fakeStt('Hi'),
      fakeLlm(['This sentence will fail to synthesize. ']),
      { synthesize: async () => Promise.reject(new Error('TTS down')) },
    );

    await expect(run(pipeline, history)).rejects.toThrow('TTS down');
    expect(history).toEqual([]);
  });
});
