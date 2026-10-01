import { describe, expect, it } from 'vitest';
import { SentenceChunker } from '../src/voice/sentence-chunker.js';

function chunkAll(deltas: string[], chunker = new SentenceChunker()): string[] {
  return [...deltas.flatMap((delta) => chunker.push(delta)), ...chunker.flush()];
}

describe('SentenceChunker', () => {
  it('emits a sentence as soon as the next one starts', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Hello there, how are you doing')).toEqual([]);
    expect(chunker.push(' today? I am')).toEqual(['Hello there, how are you doing today?']);
    expect(chunker.flush()).toEqual(['I am']);
  });

  it('handles sentences split across many small deltas', () => {
    const text = 'The weather is lovely today. Let us go for a long walk! Shall we?';
    const deltas = text.match(/.{1,3}/g)!;
    expect(chunkAll(deltas)).toEqual([
      'The weather is lovely today.',
      'Let us go for a long walk!',
      'Shall we?',
    ]);
  });

  it('merges very short sentences so TTS is not called for every word', () => {
    expect(chunkAll(['Yes. Sure. ', 'That works perfectly well for me. ', 'Ok.'])).toEqual([
      'Yes. Sure. That works perfectly well for me.',
      'Ok.',
    ]);
  });

  it('does not split on decimals or abbreviations without a following space', () => {
    expect(chunkAll(['It costs 3.50 dollars in total today.'])).toEqual([
      'It costs 3.50 dollars in total today.',
    ]);
  });

  it('splits very long sentences at a comma', () => {
    const chunker = new SentenceChunker(20, 60);
    const long = 'This is a long sentence without a full stop, which keeps going and going';
    const chunks = chunkAll([long], chunker);
    expect(chunks[0]).toBe('This is a long sentence without a full stop,');
    expect(chunks.join(' ')).toBe(long);
  });

  it('works for Ukrainian text', () => {
    expect(chunkAll(['Привіт! Як справи сьогодні? ', 'Чим можу допомогти?'])).toEqual([
      'Привіт! Як справи сьогодні?',
      'Чим можу допомогти?',
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(chunkAll(['', '   '])).toEqual([]);
  });
});
