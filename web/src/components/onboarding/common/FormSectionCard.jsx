import React from 'react'
import { cn } from '@/lib/utils'

/**
 * FormSectionCard
 * Premium floating card that groups form fields. Reskinned for the editorial
 * onboarding — soft shadow, generous spacing, mint icon chip.
 *
 * @param {string}            title       – section heading
 * @param {string}            description – helper text below heading
 * @param {React.ElementType} icon        – Lucide icon component
 * @param {string}            className   – additional class overrides
 * @param {React.ReactNode}   children    – form fields rendered inside
 */
export default function FormSectionCard({ title, description, icon: Icon, className, children }) {
  return (
    <section
      className={cn('relative rounded-[24px] border border-[#E2E8D8] bg-white p-6 md:p-8', className)}
      style={{ boxShadow: '0 12px 44px rgba(14,64,50,0.05)' }}
    >
      {(title || Icon) && (
        <div className="mb-6 flex items-start gap-4">
          {Icon && (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: '#EAF8F0' }}>
              <Icon className="h-5 w-5" style={{ color: '#0C6B4C' }} strokeWidth={2} />
            </div>
          )}
          <div className="pt-0.5">
            <h2 className="text-[18px] font-bold tracking-tight text-[#0E4032]" style={{ fontFamily: 'var(--font-koi-heading)' }}>
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#5A6B5A]">{description}</p>
            )}
          </div>
        </div>
      )}

      {children}
    </section>
  )
}
