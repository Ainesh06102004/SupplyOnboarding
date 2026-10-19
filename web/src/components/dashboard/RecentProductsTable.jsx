"use client"

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// "Recent Products" from the BrandDashboard board: a quiet table with mono
// headers, status pills in the store's tones, scores in Space Grotesk.
export const STATUS_PILL = {
  Approved: 'border-koi-tint-border bg-koi-tint text-koi-primary',
  Live: 'border-koi-tint-border bg-koi-tint text-koi-primary',
  'AI Review': 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink',
  'Under Review': 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink',
  'Action Needed': 'border-koi-red/20 bg-koi-red-bg text-koi-red',
}

export default function RecentProductsTable({ products, sample = false }) {
  return (
    <section data-card aria-label="Recent Products" className="flex h-full flex-col rounded-[26px] border border-koi-forest/10 bg-white p-6">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold">Recent Products</span>
        <span className="flex items-baseline gap-3">
          {sample && <span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Sample</span>}
          <Link href="/dashboard/products" className="text-[13px] font-semibold text-koi-primary no-underline hover:underline">View All</Link>
        </span>
      </span>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-koi-forest/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">
              <th scope="col" className="py-2.5 font-medium">Product</th>
              <th scope="col" className="py-2.5 font-medium">Status</th>
              <th scope="col" className="py-2.5 text-right font-medium">Trust Score</th>
              <th scope="col" className="py-2.5 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={product.id}
                className="border-b border-koi-forest/10 last:border-b-0"
              >
                <td className="py-3 font-semibold">{product.name}</td>
                <td className="py-3"><span className={cn('rounded-full border px-2.5 py-0.5 text-[12px] font-bold', STATUS_PILL[product.status] ?? 'border-koi-forest/15 bg-white text-koi-ink2')}>{product.status}</span></td>
                <td className="py-3 text-right font-koi-num font-semibold">{product.trustScore ?? <span className="text-koi-muted">—</span>}</td>
                <td className="py-3 text-right text-koi-muted">{product.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
