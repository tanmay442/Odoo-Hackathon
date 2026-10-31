import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { DiscountRow } from '#/db/schema/discounts'
import { formatMoney } from '#/domain/money'
import { discountAttachFn, discountDetachFn } from '#/features/discounts/functions'
import type { NextInvoicePreview } from '#/features/discounts/preview'

interface DiscountPickerOption {
  id: string
  name: string
  kind: string
  valueMinorOrBasisPoints: number
  scope: string
}

type PreviewLineRow = NextInvoicePreview['lines'][number]
type PreviewSummaryRow = NextInvoicePreview['taxSummary'][number]

interface NextInvoicePreviewProps {
  subscriptionId: string
  preview: NextInvoicePreview
  attached: DiscountRow[]
  picker: DiscountPickerOption[]
  onChanged: () => void
}

function formatPickerValue(option: DiscountPickerOption): string {
  const value =
    option.kind === 'percentage'
      ? `${option.valueMinorOrBasisPoints / 100}%`
      : formatMoney(option.valueMinorOrBasisPoints, 'INR')
  return `${option.name} (${value}, ${option.scope})`
}

export function NextInvoicePreviewCard({
  subscriptionId,
  preview,
  attached,
  picker,
  onChanged,
}: NextInvoicePreviewProps) {
  const [pick, setPick] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unattached = picker.filter(
    (option) => !attached.some((row) => row.id === option.id),
  )

  async function attach() {
    if (!pick) return
    setError(null)
    const result = await discountAttachFn({ data: { subscriptionId, discountId: pick } })
    if (result instanceof Response) {
      setError('Attach failed. Try again.')
      return
    }
    setPick(null)
    onChanged()
  }

  async function detach(discountId: string) {
    setError(null)
    const result = await discountDetachFn({ data: { subscriptionId, discountId } })
    if (result instanceof Response) {
      setError('Detach failed. Try again.')
      return
    }
    onChanged()
  }

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Next invoice preview</Heading>
        <Text type="supporting">
          Same pricing the billing job runs: discounts before tax, per-line tax, per-rate summary.
        </Text>
        {error ? <Banner status="error" title={error} /> : null}
        <Table
          data={preview.lines}
          idKey="key"
          columns={
            [
              { key: 'productName', header: 'Line' },
              { key: 'quantity', header: 'Qty' },
              {
                key: 'baseMinor',
                header: 'Base',
                renderCell: (row) => formatMoney(row.baseMinor, 'INR'),
              },
              {
                key: 'discountMinor',
                header: 'Discount',
                renderCell: (row) => formatMoney(row.discountMinor, 'INR'),
              },
              {
                key: 'netMinor',
                header: 'Net',
                renderCell: (row) => formatMoney(row.netMinor, 'INR'),
              },
            ] satisfies TableColumn<PreviewLineRow>[]
          }
        />
        {preview.discounts.length > 0 ? (
          <Stack gap={1}>
            {preview.discounts.map((applied) => (
              <Stack key={applied.discountId} direction="horizontal" gap={2}>
                <Badge label={applied.name} variant="info" />
                <Text>{`−${formatMoney(applied.amountMinor, 'INR')}`}</Text>
                {applied.discardedMinor > 0 ? (
                  <Text type="supporting">{`Discarded ${formatMoney(applied.discardedMinor, 'INR')} over base`}</Text>
                ) : null}
              </Stack>
            ))}
          </Stack>
        ) : (
          <Text type="supporting">No discount applies to the next invoice.</Text>
        )}
        {preview.taxSummary.length > 0 ? (
          <Table
            data={preview.taxSummary.map((row) => ({ ...row, key: String(row.rateBasisPoints) }))}
            idKey="key"
            columns={
              [
                {
                  key: 'rateBasisPoints',
                  header: 'Rate',
                  renderCell: (row) => `${row.rateBasisPoints / 100}%`,
                },
                {
                  key: 'taxableMinor',
                  header: 'Taxable',
                  renderCell: (row) => formatMoney(row.taxableMinor, 'INR'),
                },
                {
                  key: 'taxMinor',
                  header: 'Tax',
                  renderCell: (row) => formatMoney(row.taxMinor, 'INR'),
                },
              ] satisfies TableColumn<PreviewSummaryRow & { key: string }>[]
            }
          />
        ) : null}
        <Text>{`Subtotal ${formatMoney(preview.subtotalMinor, 'INR')} · Discount −${formatMoney(preview.discountMinor, 'INR')} · Tax ${formatMoney(preview.taxMinor, 'INR')} · Total ${formatMoney(preview.totalMinor, 'INR')}`}</Text>
        <Heading level={2}>Discounts on this subscription</Heading>
        {attached.length > 0 ? (
          <Stack gap={1}>
            {attached.map((row) => (
              <Stack key={row.id} direction="horizontal" gap={2}>
                <Text>{row.name}</Text>
                <Button label="Detach" size="sm" onClick={() => void detach(row.id)} />
              </Stack>
            ))}
          </Stack>
        ) : (
          <Text type="supporting">No subscription discount attached.</Text>
        )}
        <Text type="supporting">
          Product discounts apply automatically from the lines above; only subscription
          discounts need attaching.
        </Text>
        {unattached.length > 0 ? (
          <Stack direction="horizontal" gap={2}>
            <Selector
              label="Attach discount"
              options={unattached.map((option) => ({
                value: option.id,
                label: formatPickerValue(option),
              }))}
              value={pick}
              onChange={setPick}
              hasClear
              isOptional
              placeholder="Pick a discount"
            />
            <Button label="Attach" onClick={() => void attach()} isDisabled={pick === null} />
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}
