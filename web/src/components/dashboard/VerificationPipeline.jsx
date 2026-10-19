import React from 'react'
import { cn } from '@/lib/utils'

export default function VerificationPipeline({ pipeline }) {
  return (
    <div className="bg-white rounded-2xl border border-koi-track p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full">
      <h2 className="text-xl font-koi-display font-bold text-koi-ink mb-6 font-koi-display">
        Verification Pipeline
      </h2>
      <div className="space-y-0 relative">
        {/* Continuous vertical line behind dots */}
        <div className="absolute left-[9px] top-4 bottom-4 w-px bg-koi-track z-0" />
        
        {pipeline.map((stage, idx) => {
          let dotColor = 'bg-gray-300'
          if (stage.key === 'submitted') dotColor = 'bg-blue-400'
          if (stage.key === 'ai_review') dotColor = 'bg-amber-400'
          if (stage.key === 'human_review') dotColor = 'bg-koi-forest'
          if (stage.key === 'approved') dotColor = 'bg-green-500'

          return (
            <div 
              key={stage.key} 
              className="relative z-10 flex items-center justify-between group py-3 px-2 -mx-2 rounded-xl hover:bg-koi-bg/50 transition-colors cursor-default"
            >
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded-full bg-white border-2 border-transparent flex items-center justify-center relative">
                  <div className={cn("w-2.5 h-2.5 rounded-full", dotColor)} />
                </div>
                <span className="text-[15px] font-medium text-koi-ink">
                  {stage.stage}
                </span>
              </div>
              <span className="text-[16px] font-bold text-koi-muted group-hover:text-koi-forest transition-colors">
                {stage.count}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
