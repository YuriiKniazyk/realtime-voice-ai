import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsTextToSpeech } from '../src/providers/tts/elevenlabs.tts.js';

const options = { apiKey: 'test-key', voiceId: 'voice 1', model: 'eleven_flash_v2_5' };

describe('ElevenLabsTextToSpeech', () => {
  it('posts the text and returns the MP3 bytes', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from('mp3-bytes')));
    const tts = new ElevenLabsTextToSpeech(options, fetchMock as unknown as typeof fetch);

    const audio = await tts.synthesize('Hello world');

    expect(audio.toString()).toBe('mp3-bytes');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128',
    );
    expect(init.headers).toMatchObject({ 'xi-api-key': 'test-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Hello world',
      model_id: 'eleven_flash_v2_5',
    });
  });

  it('throws a readable error when the API fails', async () => {
    const fetchMock = vi.fn(async () => new Response('quota exceeded', { status: 429 }));
    const tts = new ElevenLabsTextToSpeech(options, fetchMock as unknown as typeof fetch);

    await expect(tts.synthesize('Hello')).rejects.toThrow('ElevenLabs TTS failed with 429: quota exceeded');
  });
});
