"use client"

import React from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'

/**
 * ProgressHeader
 *
 * Compact premium onboarding header.
 *
 * Layout:
 *   Top-left:   Step X of Y         Top-right:  Save status
 *   Title (large)
 *   Subtitle (muted)
 *   Progress bar (animated fill)
 */
export default function ProgressHeader({
  step = 1,
  totalSteps = 6,
  title,
  subtitle,
  saveStatus = 'idle',
}) {
  const progressPercent = Math.round((step / totalSteps) * 100)

  return (
    <header className="w-full bg-white border-b border-koi-track px-6 md:px-10 pt-4 pb-4">
      {/* Top row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-koi-muted tracking-widest uppercase">
          Step {step} of {totalSteps}
        </span>
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Title */}
      <h1 className="text-xl md:text-[26px] font-bold text-koi-forest tracking-tight leading-tight font-koi-display">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-koi-muted mt-0.5 max-w-xl leading-relaxed">
          {subtitle}
        </p>
      )}

      {/* Progress bar */}
      <div className="mt-4 w-full h-[5px] rounded-full bg-koi-track overflow-hidden">
        <div
          className="h-full rounded-full bg-koi-forest transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </header>
  )
}

/* ────────────────────────────────────────────────
 *  Save indicator (internal)
 * ──────────────────────────────────────────────── */
function SaveIndicator({ status }) {
  const map = {
    idle: null,
    saving: (
      <span className="flex items-center gap-1.5 text-xs text-koi-muted animate-pulse">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </span>
    ),
    saved: (
      <span className="flex items-center gap-1.5 text-xs text-koi-green">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Saved just now
      </span>
    ),
    error: (
      <span className="flex items-center gap-1.5 text-xs text-koi-red">
        Save failed
      </span>
    ),
  }

  return map[status] ?? null
}
