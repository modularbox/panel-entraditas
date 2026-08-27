export function sumDefinedQuantities(quantityTotals: Array<number | null>): number | null {
  const defined = quantityTotals.filter((quantity): quantity is number => quantity !== null);
  if (defined.length === 0) return null;
  return defined.reduce((total, quantity) => total + quantity, 0);
}

export function zoneExceedsCapacity(capacity: number, quantityTotals: Array<number | null>): boolean {
  return (sumDefinedQuantities(quantityTotals) ?? 0) > capacity;
}
