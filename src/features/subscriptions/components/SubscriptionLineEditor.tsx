import { Button } from '@astryxdesign/core/Button'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'

export interface LineEditorProduct {
  id: string
  name: string
  salesPriceMinor: number
  currency: string
  variants: Array<{ id: string; name: string; priceDeltaMinor: number; effectivePriceMinor: number }>
}

export interface LineEditorTax {
  id: string
  name: string
  rateBasisPoints: number
}

export interface EditableLine {
  productId: string
  variantId: string | null
  description: string
  quantity: number
  unitPriceMinor: number
  taxIds: string[]
}

interface SubscriptionLineEditorProps {
  lines: EditableLine[]
  products: LineEditorProduct[]
  taxes: LineEditorTax[]
  onChange: (lines: EditableLine[]) => void
}

function priceFor(product: LineEditorProduct | undefined, variantId: string | null): number | null {
  if (!product) return null
  if (!variantId) return product.salesPriceMinor
  return product.variants.find((variant) => variant.id === variantId)?.effectivePriceMinor ?? null
}

export function SubscriptionLineEditor({ lines, products, taxes, onChange }: SubscriptionLineEditorProps) {
  function updateLine(index: number, patch: Partial<EditableLine>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)))
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, position) => position !== index))
  }

  function addLine() {
    if (products.length === 0) return
    const first = products[0]
    onChange([
      ...lines,
      {
        productId: first.id,
        variantId: null,
        description: '',
        quantity: 1,
        unitPriceMinor: first.salesPriceMinor,
        taxIds: [],
      },
    ])
  }

  return (
    <Stack gap={2}>
      {lines.map((line, index) => {
        const product = products.find((candidate) => candidate.id === line.productId)
        const computed = priceFor(product, line.variantId)
        return (
          <Stack key={index} gap={2}>
            <FormLayout>
              <Selector
                label={`Line ${index + 1} product`}
                options={products.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                value={line.productId}
                onChange={(value) => {
                  const next = products.find((candidate) => candidate.id === value)
                  updateLine(index, {
                    productId: value,
                    variantId: null,
                    unitPriceMinor: next?.salesPriceMinor ?? line.unitPriceMinor,
                  })
                }}
              />
              <Selector
                label={`Line ${index + 1} variant`}
                options={(product?.variants ?? []).map((variant) => ({
                  value: variant.id,
                  label: `${variant.name} (${formatMoney(variant.effectivePriceMinor, product?.currency ?? 'INR')})`,
                }))}
                value={line.variantId ?? null}
                onChange={(value) => {
                  const effective = priceFor(product, value)
                  updateLine(index, {
                    variantId: value,
                    unitPriceMinor: effective ?? line.unitPriceMinor,
                  })
                }}
                hasClear
                isOptional
                placeholder="No variant"
              />
              <NumberInput
                label={`Line ${index + 1} quantity`}
                value={line.quantity}
                onChange={(quantity) => updateLine(index, { quantity: Math.max(1, Math.round(quantity)) })}
                min={1}
                step={1}
              />
              <NumberInput
                label={`Line ${index + 1} unit price (paise)`}
                value={line.unitPriceMinor}
                onChange={(amount) => updateLine(index, { unitPriceMinor: Math.max(0, Math.round(amount)) })}
                min={0}
                step={1}
              />
            </FormLayout>
            {computed !== null && product ? (
              <Text type="supporting">
                {`Variant-adjusted price: ${formatMoney(computed, product.currency)}. Line total: ${formatMoney(computed * line.quantity, product.currency)}.`}
              </Text>
            ) : null}
            <Stack direction="horizontal" gap={1}>
              {taxes.map((tax) => {
                const selected = line.taxIds.includes(tax.id)
                return (
                  <Button
                    key={tax.id}
                    label={`${selected ? 'Remove' : 'Add'} ${tax.name}`}
                    size="sm"
                    onClick={() =>
                      updateLine(index, {
                        taxIds: selected ? line.taxIds.filter((id) => id !== tax.id) : [...line.taxIds, tax.id],
                      })
                    }
                  />
                )
              })}
              <Button label="Remove line" size="sm" onClick={() => removeLine(index)} />
            </Stack>
          </Stack>
        )
      })}
      <Button label="Add line" onClick={addLine} isDisabled={products.length === 0} />
    </Stack>
  )
}
