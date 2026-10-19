import React from 'react'
import { cn } from '@/lib/utils'

/**
 * FormSectionCard
 * The onboarding boards' white sheet: a large radius, a hairline forest
 * border, the title in bold sans with its helper line, a tint icon chip.
 *
 * @param {string}            title       – section heading
 * @param {string}            description – helper text below heading
 * @param {React.ElementType} icon        – Lucide icon component
 * @param {string}            className   – additional class overrides
 * @param {React.ReactNode}   children    – form fields rendered inside
 */
export default function FormSectionCard({ title, description, icon: Icon, className, children }) {
  return (
    <section data-card className={cn('relative rounded-[26px] border border-koi-forest/10 bg-white p-6 md:p-7', className)}>
      {(title || Icon) && (
        <div className="mb-5 flex items-start gap-3.5">
          {Icon && (
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-koi-tint text-koi-forest">
              <Icon className="size-5" strokeWidth={2} />
            </div>
          )}
          <div className="flex flex-col gap-0.5 pt-0.5">
            <h2 className="m-0 text-lg font-bold text-koi-ink">{title}</h2>
            {description && <p className="m-0 text-[13.5px] leading-relaxed text-koi-muted">{description}</p>}
          </div>
        </div>
      )}

      {children}
    </section>
  )
}
