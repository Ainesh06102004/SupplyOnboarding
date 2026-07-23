"use client"

import React from 'react'
import { 
  Upload, 
  ShieldCheck, 
  Award, 
  Microscope, 
  FileText, 
  AlertTriangle, 
  Clock, 
  CheckCircle2,
  Calendar,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// --- MOCK DATA ---
const COMPLIANCE_SCORE = 86
const BREAKDOWN = {
  fssai: 100,
  certifications: 78,
  claims: 72,
  labs: 91
}

const VAULT_DATA = [
  {
    id: 'fssai',
    title: 'FSSAI License',
    icon: ShieldCheck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    meta: 'License: 10023011000567',
    submeta: 'Expires: Dec 2026',
    status: 'Valid',
    statusColor: 'bg-white text-green-700 border-green-200',
    statusIcon: <CheckCircle2 className="w-3 h-3 text-green-500 mr-1.5" />
  },
  {
    id: 'certs',
    title: 'Certifications',
    icon: Award,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    meta: '4 Uploaded',
    submeta: 'Partial Coverage',
    status: 'Action Needed',
    statusColor: 'bg-white text-amber-700 border-amber-200',
    statusIcon: <AlertTriangle className="w-3 h-3 text-amber-500 mr-1.5" />
  },
  {
    id: 'labs',
    title: 'Lab Reports',
    icon: Microscope,
    color: 'text-[#0E4032]',
    bgColor: 'bg-[#0E4032]/10',
    meta: '12 Uploaded',
    submeta: '18/24 Products Covered',
    status: 'Good',
    statusColor: 'bg-white text-green-700 border-green-200',
    statusIcon: <CheckCircle2 className="w-3 h-3 text-green-500 mr-1.5" />
  },
  {
    id: 'evidence',
    title: 'Scientific Evidence',
    icon: FileText,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    meta: '3 Uploaded',
    submeta: 'For 5 claims',
    status: 'Valid',
    statusColor: 'bg-white text-green-700 border-green-200',
    statusIcon: <CheckCircle2 className="w-3 h-3 text-green-500 mr-1.5" />
  }
]

const ALERTS = [
  { id: 1, title: 'FSSAI expires in 45 days', subtitle: 'Renew soon to avoid compliance disruption', severity: 'red', icon: ShieldCheck },
  { id: 2, title: 'Organic certificate expires in 72 days', subtitle: 'Schedule renewal', severity: 'amber', icon: Award },
  { id: 3, title: '3 lab reports older than 12 months', subtitle: 'Re-upload recommended', severity: 'blue', icon: FileText }
]

const MISSING_COVERAGE = [
  { id: 1, product: 'Gut Health Shake', requirement: 'Lab Report', impact: 'High' },
  { id: 2, product: 'Keto Granola', requirement: 'Claim Evidence', impact: 'Medium' },
  { id: 3, product: 'Plant Protein', requirement: 'Vegan Certification', impact: 'Medium' },
  { id: 4, product: 'Pre-Workout Rush', requirement: 'Caffeine Lab Report', impact: 'High' }
]

const TIMELINE = [
  { id: 1, date: 'Jun 21', action: 'FSSAI renewed', icon: ShieldCheck, color: 'text-blue-500' },
  { id: 2, date: 'Jun 18', action: 'Lab report uploaded', icon: Microscope, color: 'text-[#0E4032]' },
  { id: 3, date: 'Jun 15', action: 'Organic certification approved', icon: Award, color: 'text-green-500' }
]

export default function CompliancePage() {
  
  // SVG Circle calculation
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (COMPLIANCE_SCORE / 100) * circumference

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] md:text-[36px] font-display font-bold text-[#111827] tracking-tight leading-none mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Compliance
          </h2>
          <p className="text-[16px] text-[#6B7280]">
            Monitor regulatory compliance, certifications, and document health across your catalog.
          </p>
        </div>
        <Button 
          className="bg-[#0E4032] hover:bg-[#0a2e24] text-white h-12 px-6 rounded-xl shadow-[0_4px_14px_rgba(79,56,99,0.3)] hover:shadow-[0_6px_20px_rgba(79,56,99,0.4)] transition-all duration-300 gap-2 font-semibold"
        >
          <Upload className="w-5 h-5" />
          Upload Document
        </Button>
      </div>

      {/* SECTION 1 - COMPLIANCE SCORE HERO */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-10 items-center">
          
          {/* Circular Gauge */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                <circle 
                  cx="50" cy="50" r={radius} 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={strokeDashoffset} 
                  className="text-[#0E4032] transition-all duration-1000 ease-out" 
                  strokeLinecap="round" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-display font-bold text-gray-900 leading-none">{COMPLIANCE_SCORE}</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-1">Score</span>
              </div>
            </div>
          </div>

          {/* Breakdown & Interpretation */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-6 h-6 text-green-500" />
              <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-koi-heading)" }}>Good compliance standing</h3>
            </div>
            <p className="text-gray-500 mb-8">
              Your overall catalog health is strong. However, <strong>2 documents need renewal</strong> to maintain your premium trust score on the marketplace.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">FSSAI Status</div>
                <div className="text-xl font-bold text-gray-900">{BREAKDOWN.fssai}<span className="text-sm text-gray-400 font-normal">/100</span></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Certifications</div>
                <div className="text-xl font-bold text-gray-900">{BREAKDOWN.certifications}<span className="text-sm text-gray-400 font-normal">/100</span></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Claims Evidence</div>
                <div className="text-xl font-bold text-gray-900">{BREAKDOWN.claims}<span className="text-sm text-gray-400 font-normal">/100</span></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Lab Coverage</div>
                <div className="text-xl font-bold text-gray-900">{BREAKDOWN.labs}<span className="text-sm text-gray-400 font-normal">/100</span></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 2 - DOCUMENT VAULT */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-koi-heading)" }}>Document Vault</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {VAULT_DATA.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bgColor} ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-full border ${card.statusColor}`}>
                    {card.statusIcon}
                    {card.status}
                  </div>
                </div>
                <h4 className="font-bold text-gray-900 mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>{card.title}</h4>
                <p className="text-sm font-medium text-gray-600 mb-1">{card.meta}</p>
                <p className="text-xs text-gray-400 mb-6 flex-1">{card.submeta}</p>
                <div className="flex gap-2 mt-auto">
                  <Button variant="outline" className="flex-1 h-9 text-xs font-semibold text-gray-600 border-gray-200 hover:bg-gray-50">
                    View
                  </Button>
                  <Button variant="outline" className="flex-1 h-9 text-xs font-semibold text-[#0E4032] border-[#0E4032]/20 hover:bg-[#0E4032]/5">
                    Replace
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* BOTTOM GRID (Alerts, Missing Coverage, Timeline) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SECTION 4 - MISSING COVERAGE (Spans 2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
            <Info className="w-5 h-5 text-gray-400" />
            <h3 className="font-bold text-gray-900" style={{ fontFamily: "var(--font-koi-heading)" }}>Missing Coverage</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white border-b border-gray-100 text-xs uppercase font-bold text-gray-400">
                <tr>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Missing Requirement</th>
                  <th className="px-5 py-4">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MISSING_COVERAGE.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4 font-medium text-gray-900">{row.product}</td>
                    <td className="px-5 py-4 text-gray-600">{row.requirement}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase border px-2 py-0.5 rounded tracking-wider bg-white ${
                          row.impact === 'High' ? 'text-gray-900 border-red-200' : 'text-gray-900 border-amber-200'
                        }`}>
                          {row.impact} Impact
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: ALERTS & TIMELINE */}
        <div className="space-y-6 flex flex-col">
          
          {/* SECTION 3 - EXPIRY ALERTS */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Expiry Alerts
            </h3>
            <div className="space-y-0">
              {ALERTS.map((alert, idx) => {
                const AlertIcon = alert.icon
                let borderClass = ''
                let iconColor = ''

                if (alert.severity === 'red') {
                  borderClass = 'border-l-red-500'
                  iconColor = 'text-red-500'
                } else if (alert.severity === 'amber') {
                  borderClass = 'border-l-amber-500'
                  iconColor = 'text-amber-500'
                } else if (alert.severity === 'blue') {
                  borderClass = 'border-l-blue-500'
                  iconColor = 'text-blue-500'
                }

                return (
                  <div 
                    key={alert.id}
                    className={`group px-5 py-4 border-l-2 border-y border-r border-y-gray-100 border-r-gray-100 bg-white flex items-center justify-between transition-all duration-200 hover:bg-gray-50 cursor-pointer ${idx === 0 ? 'rounded-t-xl' : ''} ${idx === ALERTS.length - 1 ? 'rounded-b-xl' : ''} ${idx !== 0 ? '-mt-px' : ''} ${borderClass}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center bg-white shadow-sm shrink-0 ${iconColor}`}>
                        <AlertIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-semibold text-gray-900 mb-0.5" style={{ fontFamily: "var(--font-koi-heading)" }}>
                          {alert.title}
                        </h4>
                        <p className="text-[13px] text-gray-500">
                          {alert.subtitle}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SECTION 5 - TIMELINE */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex-1">
            <h3 className="font-bold text-gray-900 mb-5 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
              <Clock className="w-5 h-5 text-[#0E4032]" />
              Compliance Activity
            </h3>
            <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              
              {TIMELINE.map((item, idx) => {
                const Icon = item.icon
                return (
                  <div key={item.id} className="relative flex items-center justify-between">
                    <div className="absolute -left-[27px] w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center z-10 shadow-sm">
                      <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                    </div>
                    <div className="flex flex-col ml-2">
                      <span className="text-sm font-medium text-gray-900">{item.action}</span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">{item.date}</span>
                  </div>
                )
              })}

            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
