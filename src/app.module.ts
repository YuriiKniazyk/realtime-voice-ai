import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import OpenAI from 'openai';
import { loadConfig } from './config.js';
import { ClaudeLanguageModel } from './providers/llm/claude.llm.js';
import { OpenAiLanguageModel } from './providers/llm/openai.llm.js';
import { WhisperSpeechToText } from './providers/stt/whisper.stt.js';
import { ElevenLabsTextToSpeech } from './providers/tts/elevenlabs.tts.js';
import { LanguageModel } from './providers/types.js';
import { VoiceGateway } from './voice/voice.gateway.js';
import { VoicePipeline } from './voice/voice-pipeline.js';

@Module({
  providers: [
    VoiceGateway,
    {
      provide: VoicePipeline,
      useFactory: () => {
        const config = loadConfig();
        const openai = new OpenAI({ apiKey: config.openaiApiKey });

        const llm: LanguageModel =
          config.llmProvider === 'openai'
            ? new OpenAiLanguageModel(openai, config.openaiLlmModel)
            : new ClaudeLanguageModel(new Anthropic(), config.claudeModel);

        return new VoicePipeline(
          new WhisperSpeechToText(openai, config.sttModel),
          llm,
          new ElevenLabsTextToSpeech({
            apiKey: config.elevenLabsApiKey,
            voiceId: config.elevenLabsVoiceId,
            model: config.elevenLabsModel,
          }),
        );
      },
    },
  ],
})
export class AppModule {}
