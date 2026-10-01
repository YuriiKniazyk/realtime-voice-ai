import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const keys = { OPENAI_API_KEY: 'o', ELEVENLABS_API_KEY: 'e', ANTHROPIC_API_KEY: 'a' };

describe('loadConfig', () => {
  it('defaults to Claude', () => {
    const config = loadConfig({ ...keys });
    expect(config.llmProvider).toBe('claude');
    expect(config.claudeModel).toBe('claude-opus-5-5');
    expect(config.port).toBe(3000);
  });

  it('does not require an Anthropic key for the OpenAI provider', () => {
    const config = loadConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'o', ELEVENLABS_API_KEY: 'e' });
    expect(config.llmProvider).toBe('openai');
  });

  it('lists every missing variable', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: OPENAI_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY',
    );
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ ...keys, LLM_PROVIDER: 'llama' })).toThrow('LLM_PROVIDER must be');
  });
});
