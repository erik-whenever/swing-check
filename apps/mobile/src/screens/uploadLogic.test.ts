import { describe, expect, it } from 'vitest';
import { moveEdge, nearestEdge, stripIndexAt, stripTimes, timeAtX } from './uploadLogic';

describe('filmremsa', () => {
  it('lägger bilderna mitt i lika breda fack', () => {
    expect(stripTimes(8, 4)).toEqual([1, 3, 5, 7]);
    expect(stripTimes(0, 4)).toEqual([]);
  });
  it('hittar facket för en tid, klampat till remsan', () => {
    expect(stripIndexAt(0, 8, 4)).toBe(0);
    expect(stripIndexAt(5.9, 8, 4)).toBe(2);
    expect(stripIndexAt(8, 8, 4)).toBe(3);
    expect(stripIndexAt(-1, 8, 4)).toBe(0);
  });
});

describe('svingfönster', () => {
  it('räknar om x till tid inom klippet', () => {
    expect(timeAtX(150, 300, 8)).toBe(4);
    expect(timeAtX(-10, 300, 8)).toBe(0);
    expect(timeAtX(400, 300, 8)).toBe(8);
  });
  it('väljer närmaste kant', () => {
    expect(nearestEdge({ start: 2, end: 6 }, 2.5)).toBe('start');
    expect(nearestEdge({ start: 2, end: 6 }, 7)).toBe('end');
    expect(nearestEdge({ start: 2, end: 6 }, 4)).toBe('start');
  });
  it('flyttar en kant men aldrig förbi den andra eller utanför klippet', () => {
    expect(moveEdge({ start: 2, end: 6 }, 'end', 7.5, 8)).toEqual({ start: 2, end: 7.5 });
    expect(moveEdge({ start: 2, end: 6 }, 'end', 9, 8)).toEqual({ start: 2, end: 8 });
    expect(moveEdge({ start: 2, end: 6 }, 'start', -1, 8)).toEqual({ start: 0, end: 6 });
    expect(moveEdge({ start: 2, end: 6 }, 'start', 7, 8).start).toBeCloseTo(5.7);
    expect(moveEdge({ start: 2, end: 6 }, 'end', 1, 8).end).toBeCloseTo(2.3);
  });
});
