/**
 * Turns a stream of LLM text deltas into speakable chunks.
 *
 * Sending each sentence to TTS as soon as it is complete, instead of waiting
 * for the whole reply, is what makes the avatar start talking early.
 */
export class SentenceChunker {
  private buffer = '';

  constructor(
    /** Chunks shorter than this are merged with the next sentence. */
    private readonly minLength = 20,
    /** Force a split at a comma or space once the buffer gets this long. */
    private readonly maxLength = 220,
  ) {}

  /** Adds a delta and returns the chunks that are ready to be spoken. */
  push(delta: string): string[] {
    this.buffer += delta;
    const ready: string[] = [];

    for (;;) {
      const end = this.findBoundary();
      if (end === -1) break;
      const chunk = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end);
      if (chunk) ready.push(chunk);
    }
    return ready;
  }

  /** Returns whatever is left once the stream has ended. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [rest] : [];
  }

  private findBoundary(): number {
    // Sentence end: ., !, ? or … followed by whitespace (the next delta has started).
    const sentenceEnd = /[.!?…]+["»”')\]]*\s/g;
    let match: RegExpExecArray | null;
    while ((match = sentenceEnd.exec(this.buffer))) {
      const end = match.index + match[0].length;
      if (this.buffer.slice(0, end).trim().length >= this.minLength) return end;
    }

    if (this.buffer.length >= this.maxLength) {
      const window = this.buffer.slice(0, this.maxLength);
      const softBreak = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '));
      if (softBreak > this.minLength) return softBreak + 2;
      const space = window.lastIndexOf(' ');
      return space > 0 ? space + 1 : this.maxLength;
    }
    return -1;
  }
}
