// src/lib/gameUtils.test.js
// 用 vitest。安裝：pnpm add -D vitest @vitest/ui
import { describe, it, expect, vi } from 'vitest';
import { getSpyCount, shuffleArray, generateRoomCode } from './gameUtils';

describe('getSpyCount', () => {
  it('returns 1 spy for 4-5 players', () => {
    expect(getSpyCount(4)).toBe(1);
    expect(getSpyCount(5)).toBe(1);
  });
  it('returns 2 spies for 6-8 players', () => {
    expect(getSpyCount(6)).toBe(2);
    expect(getSpyCount(7)).toBe(2);
    expect(getSpyCount(8)).toBe(2);
  });
  it('edge cases', () => {
    expect(getSpyCount(0)).toBe(1);
    expect(getSpyCount(100)).toBe(2);
  });
});

describe('shuffleArray', () => {
  it('does not mutate input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });
  it('keeps all elements', () => {
    const input = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(input);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('handles empty and single-element', () => {
    expect(shuffleArray([])).toEqual([]);
    expect(shuffleArray([42])).toEqual([42]);
  });
  it('statistical: roughly uniform across positions (10k trials)', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) {
      const s = shuffleArray([0, 1, 2, 3]);
      counts[s.indexOf(0)]++;
    }
    // 每位置應接近 2500，允許 ±300
    counts.forEach(c => expect(c).toBeGreaterThan(2200));
  });
});

describe('generateRoomCode', () => {
  it('always returns 4-digit string', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^\d{4}$/);
    }
  });
  it('pads with leading zeros', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0001);
    expect(generateRoomCode()).toBe('0001');
    vi.restoreAllMocks();
  });
});
