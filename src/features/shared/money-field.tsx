import { NumberInput } from '@astryxdesign/core/NumberInput'

import { formatMoney } from '#/domain/money'

interface MoneyFieldProps {
  label: string
  valueMinor: number | null | undefined
  currency: string
  onChange: (valueMinor: number) => void
  description?: string
  isDisabled?: boolean
  allowNegative?: boolean
}

// Single Astryx composition for every money input: shows major units
// formatted with the currency symbol, stores integer minor units.
export function MoneyField({
  label,
  valueMinor,
  currency,
  onChange,
  description,
  isDisabled,
  allowNegative,
}: MoneyFieldProps) {
  return (
    <NumberInput
      label={label}
      value={valueMinor == null ? null : valueMinor / 100}
      onChange={(rupees) => onChange(Math.round(rupees * 100))}
      formatValue={(rupees) => formatMoney(Math.round(rupees * 100), currency)}
      description={description}
      isDisabled={isDisabled}
      isWheelEnabled={false}
      min={allowNegative ? null : 0}
      step={1}
    />
  )
}
