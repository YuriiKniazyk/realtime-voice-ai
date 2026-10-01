import Anthropic from '@anthropic-ai/sdk';
import { ChatTurn, LanguageModel, SYSTEM_PROMPT } from '../types.js';

export class ClaudeLanguageModel implements LanguageModel {
  readonly name: string;

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {
    this.name = `anthropic/${model}`;
  }

  async *streamReply(history: ChatTurn[], signal?: AbortSignal): AsyncIterable<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        // Voice is latency-bound: keep thinking shallow.
        output_config: { effort: 'low' },
        // Re-run a policy refusal on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: history,
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error('The model declined to answer this request.');
    }
  }
}
