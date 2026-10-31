import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Divider } from '@astryxdesign/core/Divider'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'

import { formatMoney } from '#/domain/money'

export const Route = createFileRoute('/')({ component: Home })

const invoiceLines = [
  { label: 'Business Monthly · 10 seats', detail: '1 Nov – 30 Nov', amountMinor: 2500000 },
  { label: 'Odoo brand add-on', detail: 'Variant', amountMinor: 56000 },
]

const cycleSteps = [
  { date: '1 Nov', title: 'Plan renews', detail: 'Business Monthly stays active for the next period.' },
  { date: '1 Nov', title: 'Invoice generated', detail: 'Lines, discount, and tax filled in. Nothing typed by hand.' },
  { date: '3 Nov', title: 'Payment recorded', detail: 'Bank transfer matched to the invoice and verified.' },
  { date: '3 Nov', title: 'Invoice paid', detail: 'Revenue shows on the finance dashboard the same day.' },
]

function Home() {
  const subtotalMinor = invoiceLines.reduce((sum, line) => sum + line.amountMinor, 0)
  const taxMinor = Math.round((subtotalMinor * 18) / 100)
  return (
    <Stack gap={8} padding={6}>
      <Stack direction="horizontal" hAlign="between" vAlign="center">
        <Text size="lg" weight="bold">
          Destr
        </Text>
        <Stack direction="horizontal" gap={2}>
          <Button label="Sign in" variant="ghost" href="/sign-in" />
          <Button label="Get started" variant="primary" href="/sign-up" />
        </Stack>
      </Stack>

      <Grid columns={{ minWidth: 320, max: 2 }} gap={8}>
        <Stack gap={4}>
          <Heading level={1} type="display-2">
            Recurring billing that runs itself.
          </Heading>
          <Text type="large">
            Plans, subscriptions, invoices, and payments in one place. Invoices go out on schedule,
            and nothing is billed twice.
          </Text>
          <Stack direction="horizontal" gap={2}>
            <Button label="Get started" variant="primary" href="/sign-up" />
            <Button label="Sign in" variant="secondary" href="/sign-in" />
          </Stack>
          <Text type="supporting">
            For the team selling subscriptions, and the customers paying them.
          </Text>
        </Stack>

        <Card elevation="low">
          <Stack gap={3}>
            <Stack direction="horizontal" hAlign="between" vAlign="center">
              <Heading level={2}>INV-000128</Heading>
              <Badge variant="success" label="Paid" />
            </Stack>
            <Text type="supporting">Brightloop Software · Business Monthly</Text>
            <Divider />
            {invoiceLines.map((line) => (
              <Stack key={line.label} direction="horizontal" hAlign="between">
                <Stack gap={1}>
                  <Text>{line.label}</Text>
                  <Text type="supporting">{line.detail}</Text>
                </Stack>
                <Text hasTabularNumbers>{formatMoney(line.amountMinor, 'INR')}</Text>
              </Stack>
            ))}
            <Divider />
            <Stack direction="horizontal" hAlign="between">
              <Text type="supporting">GST 18%</Text>
              <Text hasTabularNumbers>{formatMoney(taxMinor, 'INR')}</Text>
            </Stack>
            <Stack direction="horizontal" hAlign="between">
              <Text weight="bold">Total paid</Text>
              <Text weight="bold" hasTabularNumbers>
                {formatMoney(subtotalMinor + taxMinor, 'INR')}
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Grid>

      <Stack gap={4}>
        <Heading level={2}>From plan to paid, automatically</Heading>
        <Grid columns={{ minWidth: 220, max: 4 }} gap={6}>
          {cycleSteps.map((step) => (
            <Stack key={step.title} gap={1}>
              <Text type="supporting">{step.date}</Text>
              <Heading level={3}>{step.title}</Heading>
              <Text type="supporting">{step.detail}</Text>
            </Stack>
          ))}
        </Grid>
      </Stack>

      <Divider />
      <Stack direction="horizontal" hAlign="between">
        <Text type="supporting">Destr · Subscription management</Text>
        <Button label="Sign in" variant="ghost" href="/sign-in" />
      </Stack>
    </Stack>
  )
}
