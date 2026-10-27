function pulse(pattern: number | number[]): void {
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers expose vibrate and then reject it.
  }
}

export const haptics = {
  collect(): void {
    pulse(12);
  },
  near(): void {
    pulse(8);
  },
  crash(): void {
    pulse([18, 28, 36]);
  },
};
