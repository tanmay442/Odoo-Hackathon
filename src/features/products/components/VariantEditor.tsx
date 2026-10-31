import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { ProductRow, ProductVariantRow } from '#/db/schema/products'
import { effectiveVariantPrice, formatMoney } from '#/domain/money'
import { MoneyField } from '#/features/shared/money-field'

import { variantCreateFn, variantDeleteFn, variantListFn, variantUpdateFn } from '../functions'

interface VariantEditorProps {
  product: ProductRow
}

export function VariantEditor({ product }: VariantEditorProps) {
  const [variants, setVariants] = useState<ProductVariantRow[]>([])
  const [name, setName] = useState('')
  const [priceDeltaMinor, setPriceDeltaMinor] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const rows = await variantListFn({ data: { productId: product.id } })
    if (rows instanceof Response) {
      setError('Could not load variants.')
      return
    }
    setVariants(rows)
  }

  useEffect(() => {
    setName('')
    setPriceDeltaMinor(null)
    setEditingId(null)
    setError(null)
    void refresh()
  }, [product.id])

  async function save() {
    if (priceDeltaMinor === null) {
      setError('Enter a price adjustment, positive or negative.')
      return
    }
    setError(null)
    const result = editingId
      ? await variantUpdateFn({ data: { id: editingId, name: name.trim(), priceDeltaMinor } })
      : await variantCreateFn({ data: { productId: product.id, name: name.trim(), priceDeltaMinor } })
    if (result instanceof Response) {
      setError('Saving failed. Check the fields and try again.')
      return
    }
    setName('')
    setPriceDeltaMinor(null)
    setEditingId(null)
    await refresh()
  }

  async function remove(variantId: string) {
    setError(null)
    const result = await variantDeleteFn({ data: { id: variantId } })
    if (result instanceof Response) {
      setError('Delete failed. Try again.')
      return
    }
    await refresh()
  }

  function edit(variant: ProductVariantRow) {
    setEditingId(variant.id)
    setName(variant.name)
    setPriceDeltaMinor(variant.priceDeltaMinor)
  }

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Variants for {product.name}</Heading>
        <Text>
          Base sales price {formatMoney(product.salesPriceMinor, product.currency)}. Effective price
          adds the variant adjustment.
        </Text>
        {error ? <Banner status="error" title={error} /> : null}
        <Table
          data={variants}
          idKey="id"
          columns={[
            { key: 'name', header: 'Variant' },
            {
              key: 'priceDeltaMinor',
              header: 'Adjustment',
              renderCell: (variant: ProductVariantRow) =>
                formatMoney(variant.priceDeltaMinor, product.currency),
            },
            {
              key: 'effective',
              header: 'Effective price',
              renderCell: (variant: ProductVariantRow) =>
                formatMoney(
                  effectiveVariantPrice(product.salesPriceMinor, variant.priceDeltaMinor),
                  product.currency,
                ),
            },
            {
              key: 'actions',
              header: 'Actions',
              renderCell: (variant: ProductVariantRow) => (
                <Stack direction="horizontal" gap={1}>
                  <Button label="Edit" size="sm" onClick={() => edit(variant)} />
                  <Button label="Delete" size="sm" onClick={() => void remove(variant.id)} />
                </Stack>
              ),
            },
          ]}
        />
        <Stack direction="horizontal" gap={2}>
          <TextInput label="Variant name" value={name} onChange={setName} placeholder="Odoo" />
          <MoneyField
            label="Price adjustment"
            valueMinor={priceDeltaMinor}
            currency={product.currency}
            onChange={setPriceDeltaMinor}
            allowNegative
            description="Positive raises the price, negative lowers it."
          />
          <Button
            label={editingId ? 'Save variant' : 'Add variant'}
            variant="primary"
            isDisabled={name.trim() === ''}
            onClick={() => void save()}
          />
          {editingId ? <Button label="Cancel" onClick={() => {
            setEditingId(null)
            setName('')
            setPriceDeltaMinor(null)
          }} /> : null}
        </Stack>
      </Stack>
    </Card>
  )
}
