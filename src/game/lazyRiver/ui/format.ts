export function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString('en-US');
}

export function formatDistance(meters: number): string {
  return `${Math.floor(meters).toLocaleString('en-US')} m`;
}
