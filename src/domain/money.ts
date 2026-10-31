export type MinorUnits = number

export function addMoney(
  firstAmount: MinorUnits,
  secondAmount: MinorUnits,
): MinorUnits {
  return Math.round(firstAmount) + Math.round(secondAmount)
}

export function multiplyMoney(
  unitAmount: MinorUnits,
  quantity: number,
): MinorUnits {
  return Math.round(unitAmount) * quantity
}

export function effectiveVariantPrice(salesPriceMinor: MinorUnits, priceDeltaMinor: MinorUnits): MinorUnits {
  return Math.round(salesPriceMinor) + Math.round(priceDeltaMinor)
}

export function formatMoney(amountMinor: MinorUnits, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format(amountMinor / 100)
}
