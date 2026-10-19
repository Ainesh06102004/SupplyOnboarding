"use client"

// "Your products" from the BrandProducts board: search, status chips with
// counts and a sort that works, in one sheet over the table. Rows Flip into
// their new places when the filter or sort changes; the health score is a ring
// that draws itself. Search still queries the server (the page debounces it);
// the chips and sort work on the rows that came back.

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, Search, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setupMotion, prefersReducedMotion, useGSAP, Flip, E } from '@/lib/motion/koiMotion'

const GROUPS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'live', label: 'Live', test: (s) => s === 'live' || s === 'approved' },
  { key: 'review', label: 'In review', test: (s) => typeof s === 'string' && s.startsWith('pending') },
  { key: 'draft', label: 'Draft', test: (s) => s === 'draft' },
  { key: 'rejected', label: 'Rejected', test: (s) => s === 'rejected' },
]

const SORTS = [
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'Name' },
  { key: 'score', label: 'Health score' },
]

function statusPill(status) {
  if (status === 'live' || status === 'approved') return 'border-koi-tint-border bg-koi-tint text-koi-primary'
  if (status === 'draft') return 'border-koi-forest/15 bg-white text-koi-ink2'
  if (status === 'rejected') return 'border-koi-red/20 bg-koi-red-bg text-koi-red'
  return 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink'
}

function mono(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '··'
}

function ScoreRing({ score }) {
  const tone = score >= 90 ? 'text-koi-green' : score >= 80 ? 'text-koi-amber' : 'text-koi-red'
  return (
    <span className="relative grid size-11 place-items-center">
      <svg aria-hidden="true" viewBox="0 0 44 44" className={cn('absolute inset-0 -rotate-90', tone)}>
        <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3.5" className="stroke-koi-track" />
        <circle data-score-ring data-score={score} cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <span className="font-koi-num text-[13px] font-bold">{score}</span>
    </span>
  )
}

export default function ProductsTable({ loading, products, searchQuery, setSearchQuery }) {
  const [group, setGroup] = useState('all')
  const [sort, setSort] = useState('recent')
  const body = useRef(null)
  const flip = useRef(null)

  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, products.filter((p) => g.test(p.status)).length])), [products])
  const rows = useMemo(() => {
    const test = GROUPS.find((g) => g.key === group)?.test ?? (() => true)
    const list = products.filter((p) => test(p.status))
    if (sort === 'name') return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'score') return [...list].sort((a, b) => (b.healthScore ?? -1) - (a.healthScore ?? -1))
    return list
  }, [products, group, sort])

  // Remember where the rows were, then change the view.
  const reflow = (apply) => {
    if (body.current && !prefersReducedMotion()) flip.current = Flip.getState(body.current.querySelectorAll('[data-row]'))
    apply()
  }

  useGSAP(() => {
    if (!body.current) return
    const gsap = setupMotion()
    const reduced = prefersReducedMotion()
    body.current.querySelectorAll('[data-score-ring]').forEach((ring) => {
      gsap.fromTo(ring, { drawSVG: '0%' }, { drawSVG: `0% ${ring.dataset.score}%`, duration: reduced ? 0 : 1, ease: E.dolly })
    })
    const state = flip.current
    flip.current = null
    const targets = body.current.querySelectorAll('[data-row]')
    if (!targets.length) return
    if (state) {
      Flip.from(state, {
        targets,
        duration: 0.55,
        ease: E.reveal,
        onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, clearProps: 'opacity,visibility,transform' }),
      })
    } else if (!reduced) {
      gsap.from(targets, { autoAlpha: 0, y: 12, duration: 0.5, stagger: 0.04, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    }
  }, { scope: body, dependencies: [rows, loading] })

  const nextSort = () => reflow(() => setSort((s) => SORTS[(SORTS.findIndex((x) => x.key === s) + 1) % SORTS.length].key))

  return (
    <section data-card aria-label="Your products" className="flex flex-col gap-4 rounded-[26px] border border-koi-forest/10 bg-white p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-3 rounded-full border border-koi-forest/15 bg-koi-paper px-4 focus-within:border-koi-forest">
          <Search aria-hidden="true" className="size-4 shrink-0 text-koi-muted" />
          <span className="sr-only">Search products by name</span>
          <input type="text" autoComplete="off" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products by name..." className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-koi-muted" />
        </label>
        <div role="group" aria-label="Filters" className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const on = g.key === group
            return (
              <button key={g.key} type="button" aria-pressed={on} onClick={() => reflow(() => setGroup(g.key))} className={cn('h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors', on ? 'border-koi-forest bg-koi-forest text-koi-lime' : 'border-koi-forest/15 bg-white text-koi-forest hover:border-koi-forest/40')}>
                {g.label} <span className="font-koi-num opacity-70">{counts[g.key]}</span>
              </button>
            )
          })}
        </div>
        <button type="button" onClick={nextSort} className="flex h-10 items-center gap-2 rounded-full border border-koi-forest/15 px-3.5 text-[13px] font-semibold text-koi-forest hover:border-koi-forest/40">
          <ArrowUpDown className="size-4" />Sort: {SORTS.find((s) => s.key === sort)?.label}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-koi-forest/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">
              <th scope="col" className="py-3 font-medium">Product</th>
              <th scope="col" className="py-3 font-medium">Category</th>
              <th scope="col" className="py-3 text-center font-medium">SKU Count</th>
              <th scope="col" className="py-3 font-medium">Status</th>
              <th scope="col" className="py-3 font-medium">Stock</th>
              <th scope="col" className="py-3 text-center font-medium">Health Score</th>
              <th scope="col" className="py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-koi-muted">
                <span role="status" className="inline-flex items-center gap-3"><span aria-hidden="true" className="size-[10px] animate-pulse rounded-full bg-koi-ember" />Loading products…</span>
              </td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center">
                <span className="mx-auto flex max-w-sm flex-col items-center gap-3">
                  <span className="grid size-16 place-items-center rounded-full bg-koi-tint text-koi-forest"><Package className="size-7" /></span>
                  <span className="font-koi-display text-xl font-extrabold text-koi-forest">{searchQuery ? 'No products match that' : 'No products added yet'}</span>
                  <span className="text-koi-ink2">{searchQuery ? 'Try another name.' : 'Start by adding your first product to KOI.'}</span>
                  {!searchQuery && <Link href="/dashboard/products/new" className="mt-2 flex h-11 items-center gap-2 rounded-2xl bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline"><Plus className="size-4" />Add Product</Link>}
                </span>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-koi-muted">No products match that. Try another name or filter.</td></tr>
            ) : (
              rows.map((product) => (
                <tr key={product.id} data-row data-flip-id={product.id} className="border-b border-koi-forest/10 last:border-b-0">
                  <td className="py-3.5">
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-koi-paper font-koi-mono text-[10px] font-bold text-koi-primary">{mono(product.name)}</span>
                      <span className="flex flex-col"><span className="font-semibold">{product.name}</span><span className="font-koi-mono text-[11px] text-koi-muted">{product.id.substring(0, 8)}</span></span>
                    </span>
                  </td>
                  <td className="py-3.5 capitalize text-koi-ink2">{product.category?.replace(/_/g, ' ') || 'Uncategorized'}</td>
                  <td className="py-3.5 text-center font-koi-num font-semibold">{product.skuCount}</td>
                  <td className="py-3.5"><span className={cn('rounded-full border px-2.5 py-1 text-[12px] font-bold capitalize', statusPill(product.status))}>{product.status?.replace(/_/g, ' ')}</span></td>
                  {/* getProducts returns stock 0 because inventory is not linked yet — say so rather than show a zero. */}
                  <td className="py-3.5 text-[13px] text-koi-muted">Not linked</td>
                  <td className="py-3.5"><span className="flex justify-center">{product.healthScore !== null && product.healthScore !== undefined ? <ScoreRing score={product.healthScore} /> : <span className="text-koi-muted">N/A</span>}</span></td>
                  {/* There is no product detail page yet (/dashboard/products/[id] would 404). */}
                  <td className="py-3.5 text-right"><button type="button" disabled title="Product pages are coming" className="rounded-full border border-koi-forest/10 px-3 py-1.5 text-[12.5px] font-semibold text-koi-muted">View · Soon</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
