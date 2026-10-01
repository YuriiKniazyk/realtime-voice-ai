import { describe, expect, it } from 'vitest';
import { VoiceActivityDetector, rms } from '../public/vad.js';

const QUIET = 0.002;
const SPEECH = 0.2;

/** A detector that has finished calibrating in a quiet room. */
function calibrated(options, clock, roomLevel = QUIET) {
  const vad = new VoiceActivityDetector(options);
  feed(vad, roomLevel, 600, clock);
  expect(vad.state).toBe('idle');
  return vad;
}

/** Feeds a level for a duration in 20 ms frames and collects the events. */
function feed(vad, level, ms, clock) {
  const events = [];
  for (let t = 0; t < ms; t += 20) {
    clock.now += 20;
    const event = vad.update(level, clock.now);
    if (event) events.push(event);
  }
  return events;
}

describe('VoiceActivityDetector', () => {
  it('ignores everything while calibrating', () => {
    const vad = new VoiceActivityDetector();
    const clock = { now: 0 };
    expect(feed(vad, SPEECH, 400, clock)).toEqual([]);
    expect(vad.state).toBe('calibrating');
  });

  it('detects an utterance: candidate → start → end', () => {
    const clock = { now: 0 };
    const vad = calibrated({}, clock);

    expect(feed(vad, QUIET, 500, clock)).toEqual([]);
    expect(feed(vad, SPEECH, 1000, clock)).toEqual(['candidate', 'start']);
    expect(feed(vad, QUIET, 400, clock)).toEqual([]); // a pause between words
    expect(feed(vad, SPEECH, 300, clock)).toEqual([]);
    expect(feed(vad, QUIET, 1000, clock)).toEqual(['end']);
  });

  it('cancels short noises like clicks', () => {
    const clock = { now: 0 };
    const vad = calibrated({}, clock);

    expect(feed(vad, SPEECH, 60, clock)).toEqual(['candidate']);
    expect(feed(vad, QUIET, 100, clock)).toEqual(['cancel']);
    expect(vad.state).toBe('idle');
  });

  it('learns a noisy room during calibration and ignores its hum', () => {
    const hum = 0.03; // louder than the default minimum threshold
    const clock = { now: 0 };
    const vad = calibrated({}, clock, hum);

    expect(vad.threshold).toBeGreaterThan(hum);
    expect(feed(vad, hum, 2000, clock)).toEqual([]);
    expect(feed(vad, SPEECH, 500, clock)).toEqual(['candidate', 'start']);
  });

  it('forces the end of a very long utterance', () => {
    const clock = { now: 0 };
    const vad = calibrated({ maxUtteranceMs: 2000 }, clock);

    // Still talking after the forced end starts a new utterance.
    expect(feed(vad, SPEECH, 2500, clock)).toEqual(['candidate', 'start', 'end', 'candidate', 'start']);
  });
});

describe('rms', () => {
  it('computes the root-mean-square level', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array(128))).toBe(0);
  });
});
