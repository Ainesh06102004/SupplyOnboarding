import React from 'react'
import { cn } from '@/lib/utils'

export default function StatsCard({ 
  icon: Icon, 
  value, 
  label, 
  styleType = 'neutral',
  className
}) {
  let bgClass = 'bg-white'
  let iconBgClass = 'bg-black/5 text-koi-muted'
  let valueColor = 'text-koi-ink'
  
  if (styleType === 'success') {
    iconBgClass = 'bg-green-50 text-green-700'
  } else if (styleType === 'warning') {
    iconBgClass = 'bg-amber-50 text-amber-700'
  } else if (styleType === 'special') {
    iconBgClass = 'bg-koi-forest/10 text-koi-forest'
  } else if (styleType === 'danger') {
    iconBgClass = 'bg-red-50 text-red-700'
  }

  return (
    <div className={cn(
      "rounded-2xl border border-koi-track p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:-translate-y-0.5 transition-all duration-200",
      bgClass,
      className
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBgClass)}>
          <Icon className="w-5 h-5" />
        </div>
        {/* Optional top-right element can go here */}
      </div>
      <div>
        <h3 className={cn("text-3xl font-bold tracking-tight mb-1", valueColor)} style={{ fontFamily: "var(--font-koi-heading)" }}>
          {value}
        </h3>
        <p className="text-koi-muted text-[15px] font-medium">
          {label}
        </p>
      </div>
    </div>
  )
}
