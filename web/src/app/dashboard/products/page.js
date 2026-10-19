"use client"

// Brand portal — products (BrandProducts board). Real data from getProducts /
// getProductStats; search is debounced to the server, chips and sort are local.

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import StatsCard from '@/components/dashboard/StatsCard'
import PageTitle from '@/components/dashboard/PageTitle'
import { getProducts, getProductStats } from '@/lib/dashboard/products'
import ProductsTable from '@/components/dashboard/products/ProductsTable'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState({
    totalProducts: 0,
    liveProducts: 0,
    underReview: 0,
    riskAlerts: 0
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const root = useRef(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [productsData, statsData] = await Promise.all([
          getProducts({ search: searchQuery }),
          getProductStats()
        ])
        setProducts(productsData)
        setStats(statsData)
      } catch (err) {
        console.error('Failed to load products page data', err)
      } finally {
        setLoading(false)
      }
    }

    // Simple debounce for search
    const timer = setTimeout(() => {
      loadData()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-kpi]'), { autoAlpha: 0, y: 24, duration: 0.7, stagger: 0.07, delay: 0.15, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    gsap.from(q('[data-card]'), { autoAlpha: 0, y: 34, duration: 0.85, delay: 0.35, ease: E.dolly, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  return (
    <div ref={root} className="flex flex-col gap-6">
      <PageTitle
        title="Products"
        sub="Manage your catalog, SKUs, and track screening statuses."
        action={<Link href="/dashboard/products/new" className="flex h-12 items-center gap-2 rounded-2xl bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline"><Plus className="size-5" />Add Product</Link>}
      />

      <section aria-label="Catalogue numbers" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatsCard value={stats.totalProducts} label="Total Products" styleType="neutral" />
        <StatsCard value={stats.liveProducts} label="Live Products" styleType="success" />
        {/* getProductStats counts drafts with the pending_* states, so this is "not live yet", not just "in review". */}
        <StatsCard value={stats.underReview} label="Not live yet" styleType="warning" />
        <StatsCard value={stats.riskAlerts} label="Risk Alerts" styleType={stats.riskAlerts > 0 ? 'danger' : 'neutral'} />
      </section>

      <ProductsTable loading={loading} products={products} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
    </div>
  )
}
