"use client"

import React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

/**
 * VolumeSelector
 *
 * Card-based radio selector for SKU volume estimation.
 *
 * @param {Array}    options   – [{ value, label, subtitle }]
 * @param {string}   selected – currently selected value
 * @param {Function} onChange – called with the new value
 */
export default function VolumeSelector({ options = [], selected, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((opt) => {
        const isActive = selected === opt.value
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex flex-col items-center justify-center h-[80px] rounded-xl border-2 transition-all duration-200 cursor-pointer',
              isActive
                ? 'border-koi-primary bg-koi-primary/5'
                : 'border-koi-track bg-white hover:border-koi-primary/30',
            )}
          >
            {isActive && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-koi-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <span
              className={cn(
                'text-lg font-bold tracking-tight',
                isActive ? 'text-koi-primary' : 'text-koi-ink',
              )}
            >
              {opt.label}
            </span>
            <span className="text-[11px] text-koi-muted mt-0.5 font-medium">
              {opt.subtitle}
            </span>
          </button>
        )
      })}
    </div>
  )
}
