export interface AppConfig {
  port: number;
  llmProvider: 'claude' | 'openai';
  claudeModel: string;
  openaiLlmModel: string;
  openaiApiKey: string;
  sttModel: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const llmProvider = (env.LLM_PROVIDER ?? 'claude').toLowerCase();
  if (llmProvider !== 'claude' && llmProvider !== 'openai') {
    throw new Error(`LLM_PROVIDER must be "claude" or "openai", got "${llmProvider}".`);
  }

  const required = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY'];
  if (llmProvider === 'claude' && !env.ANTHROPIC_AUTH_TOKEN) required.push('ANTHROPIC_API_KEY');
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  }

  return {
    port: Number(env.PORT ?? 3000),
    llmProvider,
    claudeModel: env.CLAUDE_MODEL ?? 'claude-opus-5-5',
    openaiLlmModel: env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini',
    openaiApiKey: env.OPENAI_API_KEY!,
    sttModel: env.STT_MODEL ?? 'whisper-1',
    elevenLabsApiKey: env.ELEVENLABS_API_KEY!,
    elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    elevenLabsModel: env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5',
  };
}
