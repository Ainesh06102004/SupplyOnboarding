import React from 'react'
import { AlertCircle, Clock, Info, ChevronRight, ShieldAlert, FlaskConical, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AlertCard({ alerts }) {
  return (
    <div className="bg-white rounded-2xl border border-koi-track p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full">
      <h2 className="text-xl font-koi-display font-bold text-koi-ink mb-5 font-koi-display">
        Action Required
      </h2>
      <div className="flex flex-col">
        {alerts.map((alert, idx) => {
          let borderClass = ''
          let iconColor = ''
          let Icon = Info

          if (alert.severity === 'red') {
            borderClass = 'border-l-red-500'
            iconColor = 'text-red-500'
            Icon = ShieldAlert
          } else if (alert.severity === 'amber') {
            borderClass = 'border-l-amber-500'
            iconColor = 'text-amber-500'
            Icon = FlaskConical
          } else if (alert.severity === 'blue') {
            borderClass = 'border-l-blue-500'
            iconColor = 'text-blue-500'
            Icon = FileText
          }

          return (
            <div 
              key={alert.id}
              className={cn(
                "group px-5 py-4 border-l-2 border-y border-r border-y-gray-100 border-r-gray-100 bg-white flex items-center justify-between transition-all duration-200 hover:bg-gray-50 cursor-pointer first:rounded-t-xl last:rounded-b-xl",
                idx !== 0 && "-mt-px",
                borderClass
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn("w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center bg-white shadow-sm shrink-0", iconColor)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-gray-900 mb-0.5 font-koi-display">
                    {alert.title}
                  </h4>
                  {alert.subtitle && (
                    <p className="text-[13px] text-gray-500">
                      {alert.subtitle}
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
