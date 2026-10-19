import React from 'react'
import { CheckCircle2, Circle } from 'lucide-react'

export default function DocumentChecklist({ items, type = "required" }) {
  return (
    <div className="space-y-2.5 w-full">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-3 pb-2 border-b border-koi-track last:border-0 last:pb-0"
        >
          {type === "required" ? (
            <CheckCircle2 className="w-4 h-4 text-koi-green shrink-0 mt-0.5" />
          ) : (
            <Circle className="w-4 h-4 text-koi-muted shrink-0 mt-0.5" />
          )}

          <div className="flex flex-col">
            <span className="text-[14px] font-normal text-koi-forest">
              {item.label}
            </span>

            {item.hint && (
              <span className="text-[12px] text-koi-muted mt-0.5">
                {item.hint}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}