import React from 'react'
import { cn } from '@/lib/utils'

// "Action Required" from the BrandDashboard board: each alert a tinted row
// with a status dot by severity. `sample` marks mock-backed alerts.
const SEVERITY = {
  red: { row: 'border-koi-red/20 bg-koi-red-bg', dot: 'bg-koi-red' },
  amber: { row: 'border-koi-amber-border bg-koi-amber-bg', dot: 'bg-koi-amber' },
  blue: { row: 'border-koi-tint-border bg-koi-tint', dot: 'bg-koi-green' },
}

export default function AlertCard({ alerts, sample = false }) {
  return (
    <section data-card aria-label="Action Required" className="flex h-full flex-col gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-6">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold">Action Required</span>
        {sample && <span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Sample</span>}
      </span>
      {alerts.length === 0 && <p className="m-0 rounded-2xl bg-koi-paper px-4 py-3 text-[13.5px] text-koi-ink2">Nothing needs you right now.</p>}
      {alerts.map((alert) => {
        const s = SEVERITY[alert.severity] ?? SEVERITY.blue
        return (
          <article key={alert.id} className={cn('flex items-start gap-3 rounded-2xl border p-4', s.row)}>
            <span aria-hidden="true" className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', s.dot)} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-bold">{alert.title}</span>
              {alert.subtitle && <span className="text-[13px] leading-snug text-koi-ink2">{alert.subtitle}</span>}
            </span>
          </article>
        )
      })}
    </section>
  )
}
