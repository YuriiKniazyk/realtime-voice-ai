/**
 * Energy-based voice activity detection for hands-free mode.
 *
 * Feed it the microphone level (RMS, 0..1) every animation frame. It tracks the
 * background noise floor, so the same settings work in a quiet room and a noisy
 * one. A tiny state machine turns levels into events:
 *
 *   calibrating → idle        after calibrationMs (learns the room's noise)
 *   idle        → candidate   level above threshold          → 'candidate'
 *   candidate   → idle        quiet again (click, cough)     → 'cancel'
 *   candidate   → speaking    loud for minSpeechMs           → 'start'
 *   speaking    → idle        quiet for silenceMs,
 *                             or longer than maxUtteranceMs  → 'end'
 *
 * "candidate" lets the caller start recording right away and keep the first
 * syllable, then drop the audio if it turns out to be a click or a cough.
 */
export class VoiceActivityDetector {
  constructor({
    minThreshold = 0.015, // absolute floor, so silence never counts as speech
    noiseRatio = 3, // speech must be this many times louder than the noise floor
    minSpeechMs = 200,
    silenceMs = 800,
    maxUtteranceMs = 30_000,
    calibrationMs = 500, // listen to the room first; ask the user to stay quiet
  } = {}) {
    Object.assign(this, { minThreshold, noiseRatio, minSpeechMs, silenceMs, maxUtteranceMs, calibrationMs });
    this.noiseFloor = minThreshold / noiseRatio;
    this.reset();
    this.state = 'calibrating';
    this.calibrationStart = undefined;
  }

  reset() {
    this.state = 'idle';
    this.loudSince = 0;
    this.quietSince = 0;
    this.speechStart = 0;
  }

  get threshold() {
    return Math.max(this.minThreshold, this.noiseFloor * this.noiseRatio);
  }

  /**
   * @param {number} level microphone RMS level, 0..1
   * @param {number} now timestamp in ms
   * @returns {'candidate' | 'start' | 'cancel' | 'end' | null}
   */
  update(level, now) {
    const loud = level >= this.threshold;

    switch (this.state) {
      case 'calibrating':
        // Treat everything heard during calibration as background noise,
        // so a steady hum louder than minThreshold is never taken for speech.
        this.calibrationStart ??= now;
        this.noiseFloor = Math.max(this.noiseFloor * 0.8 + level * 0.2, level * 0.9);
        if (now - this.calibrationStart >= this.calibrationMs) this.state = 'idle';
        return null;

      case 'idle':
        // Learn the room only while nobody is talking.
        this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;
        if (!loud) return null;
        this.state = 'candidate';
        this.loudSince = now;
        this.quietSince = 0;
        return 'candidate';

      case 'candidate':
        if (!loud) {
          this.state = 'idle';
          return 'cancel';
        }
        if (now - this.loudSince < this.minSpeechMs) return null;
        this.state = 'speaking';
        this.speechStart = this.loudSince;
        return 'start';

      case 'speaking':
        if (now - this.speechStart >= this.maxUtteranceMs) {
          this.reset();
          return 'end';
        }
        if (loud) {
          this.quietSince = 0;
          return null;
        }
        this.quietSince ||= now;
        if (now - this.quietSince < this.silenceMs) return null;
        this.reset();
        return 'end';
    }
    return null;
  }
}

/** Root-mean-square level of a time-domain buffer from an AnalyserNode. */
export function rms(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
