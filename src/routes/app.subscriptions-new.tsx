import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { DateInput } from '@astryxdesign/core/DateInput'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import { formatMoney } from '#/domain/money'
import { customerListFn } from '#/features/customers/functions'
import { planPickerFn } from '#/features/plans/functions'
import { productPickerFn } from '#/features/products/functions'
import { subscriptionCreateFn } from '#/features/subscriptions/functions'
import { SubscriptionLineEditor  } from '#/features/subscriptions/components/SubscriptionLineEditor'
import type {EditableLine} from '#/features/subscriptions/components/SubscriptionLineEditor';
import { taxPickerFn } from '#/features/taxes/functions'
import { templateActiveFn, templateGetFn } from '#/features/templates/functions'

type IsoDay = `${number}${number}${number}${number}-${number}${number}-${number}${number}`

function todayIso(): IsoDay {
  return new Date().toISOString().slice(0, 10) as IsoDay
}

export const Route = createFileRoute('/app/subscriptions-new')({
  loader: async () => {
    const [customers, plans, products, taxes, templates] = await Promise.all([
      customerListFn({ data: { pageSize: 100 } }),
      planPickerFn(),
      productPickerFn(),
      taxPickerFn(),
      templateActiveFn(),
    ])
    for (const result of [customers, plans, products, taxes, templates]) {
      if (result instanceof Response) {
        if ((result).status === 401) throw redirect({ to: '/sign-in' })
        throw new Error('FORBIDDEN')
      }
    }
    return {
      customers: customers as Exclude<typeof customers, Response>,
      plans: plans as Exclude<typeof plans, Response>,
      products: products as Exclude<typeof products, Response>,
      taxes: taxes as Exclude<typeof taxes, Response>,
      templates: templates as Exclude<typeof templates, Response>,
    }
  },
  component: NewSubscriptionPage,
})

function NewSubscriptionPage() {
  const { customers, plans, products, taxes, templates } = Route.useLoaderData()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [customerId, setCustomerId] = useState(customers.rows[0]?.id ?? '')
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState<IsoDay>(todayIso())
  const [paymentTerms, setPaymentTerms] = useState('')
  const [lines, setLines] = useState<EditableLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedPlan = plans.find((plan) => plan.id === planId)
  const total = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0)

  async function applyTemplate(id: string) {
    setTemplateId(id)
    setError(null)
    const detail = await templateGetFn({ data: { id } })
    if (detail instanceof Response || !detail) {
      setError('Template loading failed.')
      return
    }
    setPlanId(detail.planId)
    setLines(
      detail.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        description: '',
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxIds: line.taxIds,
      })),
    )
  }

  async function save() {
    if (!customerId || !planId || lines.length === 0) {
      setError('Customer, plan, and at least one line are required.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const result = await subscriptionCreateFn({
        data: {
          customerId,
          planId,
          startDate,
          paymentTerms: paymentTerms.trim() ? paymentTerms.trim() : null,
          sourceTemplateId: templateId ?? null,
          lines,
        },
      })
      if (result instanceof Response) {
        setError(result.status === 409 ? 'Plan is not available for new subscriptions.' : 'Creation failed.')
        return
      }
      await router.invalidate()
      window.location.href = `/app/subscriptions/${result.id}`
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>New subscription</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      <Stepper activeStep={step}>
        <Step step={0} label="Customer" />
        <Step step={1} label="Lines" />
        <Step step={2} label="Review" />
      </Stepper>
      {step === 0 ? (
        <Card>
          <Stack gap={2}>
            <FormLayout>
              <Selector
                label="Customer"
                options={customers.rows.map((customer) => ({ value: customer.id, label: `${customer.displayName} · ${customer.email}` }))}
                value={customerId}
                onChange={setCustomerId}
              />
              <Selector
                label="Plan"
                options={plans.map((plan) => ({ value: plan.id, label: `${plan.name} · ${formatMoney(plan.priceMinor, plan.currency)}` }))}
                value={planId}
                onChange={setPlanId}
              />
              <Selector
                label="Start from template"
                options={templates.map((template) => ({ value: template.id, label: template.name }))}
                value={templateId ?? null}
                onChange={(value) => void (value ? applyTemplate(value) : setTemplateId(undefined))}
                hasClear
                isOptional
                placeholder="Blank or template"
              />
              <DateInput label="Start date" value={startDate} onChange={(value) => setStartDate(value as IsoDay)} />
              <TextInput label="Payment terms" value={paymentTerms} onChange={setPaymentTerms} isOptional />
            </FormLayout>
            <Button label="Continue" variant="primary" onClick={() => setStep(1)} />
          </Stack>
        </Card>
      ) : null}
      {step === 1 ? (
        <Card>
          <Stack gap={2}>
            <SubscriptionLineEditor lines={lines} products={products} taxes={taxes} onChange={setLines} />
            <Stack direction="horizontal" gap={2}>
              <Button label="Back" onClick={() => setStep(0)} />
              <Button label="Continue" variant="primary" onClick={() => setStep(2)} />
            </Stack>
          </Stack>
        </Card>
      ) : null}
      {step === 2 ? (
        <Card>
          <Stack gap={2}>
            <Text type="body">{`Customer: ${customers.rows.find((customer) => customer.id === customerId)?.displayName ?? ''}`}</Text>
            <Text type="body">{`Plan: ${selectedPlan?.name ?? ''}`}</Text>
            <Text type="body">{`Lines: ${lines.length} · Total: ${formatMoney(total, selectedPlan?.currency ?? 'INR')}`}</Text>
            <Stack direction="horizontal" gap={2}>
              <Button label="Back" onClick={() => setStep(1)} />
              <Button label="Create subscription" variant="primary" onClick={() => void save()} isLoading={isSaving} />
            </Stack>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}
