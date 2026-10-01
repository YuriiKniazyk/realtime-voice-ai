import OpenAI from 'openai';
import { ChatTurn, LanguageModel, SYSTEM_PROMPT } from '../types.js';

export class OpenAiLanguageModel implements LanguageModel {
  readonly name: string;

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {
    this.name = `openai/${model}`;
  }

  async *streamReply(history: ChatTurn[], signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      },
      { signal },
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
