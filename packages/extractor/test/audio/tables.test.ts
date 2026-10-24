import { describe, expect, it } from "vitest";
import { amplitude, attackRate, decibelSquare, fallRate, lfoSine, MIN_CB, sustainLevel } from "../../src/audio/tables.ts";

describe("engine tables", () => {
  it("puts 127 at 0 cB, 0 at silence and halves on a squared curve", () => {
    expect(decibelSquare(127)).toBe(0);
    expect(decibelSquare(0)).toBe(MIN_CB);
    expect(decibelSquare(64)).toBe(-119); // 40·log10(64/127) dB = -11.9 dB
    expect(decibelSquare(1)).toBe(MIN_CB);
  });

  it("converts attack: 255 - a below 109, then the engine's table", () => {
    expect(attackRate(0)).toBe(255);
    expect(attackRate(108)).toBe(147);
    expect(attackRate(109)).toBe(143);
    expect(attackRate(126)).toBe(1);
    expect(attackRate(127)).toBe(0);
  });

  it("converts decay and release rates", () => {
    expect(fallRate(127)).toBe(0xffff);
    expect(fallRate(126)).toBe(0x3c00);
    expect(fallRate(0)).toBe(1);
    expect(fallRate(49)).toBe(99);
    expect(fallRate(50)).toBe(101);
    expect(fallRate(100)).toBe(295);
  });

  it("puts sustain 127 at full level and the rest on the squared curve", () => {
    expect(sustainLevel(127)).toBe(0);
    expect(sustainLevel(64)).toBe(-119 * 128);
  });

  it("turns centibels into gain", () => {
    expect(amplitude(0)).toBe(1);
    expect(amplitude(-200)).toBeCloseTo(0.1, 10);
    expect(amplitude(MIN_CB)).toBe(0);
  });

  it("gives the LFO a 128-step sine", () => {
    expect(lfoSine(0)).toBe(0);
    expect(lfoSine(32)).toBe(127);
    expect(lfoSine(96)).toBe(-127);
    expect(lfoSine(128)).toBe(0);
  });
});
