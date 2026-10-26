// Ren logik för Uppladdningens klippkort: filmremsa och dragbart svingfönster.
// Inga React-, Expo- eller RN-beroenden, så den testas med vitest.

export interface SwingWindow {
  start: number;
  end: number;
}

export type WindowEdge = 'start' | 'end';

/** Antal stillbilder i filmremsan under klippet. */
export const STRIP_FRAMES = 12;
/** Kortaste fönster som går att dra fram (s). */
export const MIN_WINDOW_S = 0.3;

/** Tidpunkter (s) för filmremsan: mitten av n lika breda fack över klippet. */
export function stripTimes(duration: number, n: number = STRIP_FRAMES): number[] {
  if (duration <= 0 || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * duration);
}

/** Facket i filmremsan som innehåller tiden t. */
export function stripIndexAt(t: number, duration: number, n: number = STRIP_FRAMES): number {
  if (duration <= 0 || n <= 0) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor((t / duration) * n)));
}

/** x-position (px) i tidslinjen → tid (s), klampad till klippet. */
export function timeAtX(x: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  return Math.min(duration, Math.max(0, (x / width) * duration));
}

/** Kanten närmast t. Lika långt → start, så att ett tryck till vänster om mitten flyttar starten. */
export function nearestEdge(window: SwingWindow, t: number): WindowEdge {
  return Math.abs(t - window.start) <= Math.abs(t - window.end) ? 'start' : 'end';
}

/** Flyttar en kant till t. Fönstret hålls inom klippet och minst MIN_WINDOW_S långt. */
export function moveEdge(window: SwingWindow, edge: WindowEdge, t: number, duration: number): SwingWindow {
  const min = Math.min(MIN_WINDOW_S, duration);
  if (edge === 'start') {
    return { start: Math.min(Math.max(0, t), Math.max(0, window.end - min)), end: window.end };
  }
  return { start: window.start, end: Math.max(Math.min(duration, t), Math.min(duration, window.start + min)) };
}
