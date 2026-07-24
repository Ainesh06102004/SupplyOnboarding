"use client"

import React from 'react'
import { Plus, CheckCircle, Clock3, AlertTriangle, Play, Upload, ShieldCheck, Flag, Search, Activity, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatsCard from '@/components/dashboard/StatsCard'
import { useRouter } from 'next/navigation'

// --- MOCK DATA ---
const KPI_DATA = {
  submitted: 24,
  aiReview: 5,
  humanReview: 3,
  approved: 16
}

const KANBAN_PIPELINE = {
  drafts: [
    { id: 1, name: 'Vanilla Whey 1kg', updated: '2 hrs ago' }
  ],
  submitted: [
    { id: 2, name: 'Pre-Workout Rush', date: 'Today, 10:42 AM' },
    { id: 3, name: 'Vegan Pea Protein', date: 'Yesterday' }
  ],
  aiReview: [
    { 
      id: 4, 
      name: 'Hydration Mix', 
      progress: 76, 
      tasks: [
        { label: 'OCR complete', done: true },
        { label: 'Nutrition parsed', done: true },
        { label: 'Claim validation pending', done: false },
        { label: 'Trust scoring pending', done: false }
      ]
    }
  ],
  humanReview: [
    { 
      id: 5, 
      name: 'Sleep Gummies', 
      flags: 2, 
      badge: 'Action Required',
      needsEvidence: true 
    }
  ],
  finalDecision: [
    { id: 6, name: 'Creatine Monohydrate', status: 'approved' },
    { id: 7, name: 'Mass Gainer Pro', status: 'rejected', reason: 'Sugar claims unsupported' }
  ]
}

const DETAILED_TABLE = [
  { id: 'PRD-001', product: 'Hydration Mix', sku: 'HYD-01', submitted: '2026-06-23', stage: 'AI Review', score: '-', flags: 0, statusLabel: 'AI Review' },
  { id: 'PRD-002', product: 'Sleep Gummies', sku: 'SLP-99', submitted: '2026-06-22', stage: 'Human Review', score: '62/100', flags: 2, statusLabel: 'Human Review' },
  { id: 'PRD-003', product: 'Creatine Monohydrate', sku: 'CRT-05', submitted: '2026-06-20', stage: 'Approved', score: '98/100', flags: 0, statusLabel: 'Approved' },
  { id: 'PRD-004', product: 'Mass Gainer Pro', sku: 'MSG-01', submitted: '2026-06-19', stage: 'Rejected', score: '45/100', flags: 3, statusLabel: 'Rejected' },
  { id: 'PRD-005', product: 'Pre-Workout Rush', sku: 'PWR-01', submitted: '2026-06-23', stage: 'Submitted', score: '-', flags: 0, statusLabel: 'Submitted' }
]

const getStatusBadge = (status) => {
  switch (status) {
    case 'Draft': return 'bg-white text-gray-700 border-gray-200'
    case 'Submitted': return 'bg-white text-blue-700 border-l-blue-500 border-y-gray-200 border-r-gray-200'
    case 'AI Review': return 'bg-white text-[#0E4032] border-[#0E4032]/20'
    case 'Human Review': return 'bg-white text-amber-700 border-amber-200'
    case 'Approved': return 'bg-white text-green-700 border-green-200'
    case 'Rejected': return 'bg-white text-red-700 border-red-200'
    default: return 'bg-white text-gray-700 border-gray-200'
  }
}

const StatusIcon = ({ status }) => {
  switch (status) {
    case 'Draft': return null
    case 'Submitted': return <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></div>
    case 'AI Review': return <div className="w-1.5 h-1.5 rounded-full bg-[#0E4032] animate-pulse mr-1.5"></div>
    case 'Human Review': return <AlertTriangle className="w-3 h-3 text-amber-500 mr-1.5" />
    case 'Approved': return <CheckCircle className="w-3 h-3 text-green-500 mr-1.5" />
    case 'Rejected': return <AlertTriangle className="w-3 h-3 text-red-500 mr-1.5" />
    default: return null
  }
}

export default function VerificationPage() {
  const router = useRouter()

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] md:text-[36px] font-display font-bold text-[#111827] tracking-tight leading-none mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Verification
          </h2>
          <p className="text-[16px] text-[#6B7280]">
            Track AI screening, human review, and approval status for product submissions.
          </p>
        </div>
        <Button 
          onClick={() => router.push('/dashboard/products/new')}
          className="bg-[#0E4032] hover:bg-[#0a2e24] text-white h-12 px-6 rounded-xl shadow-[0_4px_14px_rgba(79,56,99,0.3)] hover:shadow-[0_6px_20px_rgba(79,56,99,0.4)] transition-all duration-300 gap-2 font-semibold"
        >
          <Plus className="w-5 h-5" />
          Submit New Product
        </Button>
      </div>

      {/* SECTION 1 - KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard icon={CheckCircle} value={KPI_DATA.submitted} label="Products Submitted" styleType="neutral" />
        <StatsCard icon={Activity} value={KPI_DATA.aiReview} label="AI Review" styleType="special" />
        <StatsCard icon={Clock3} value={KPI_DATA.humanReview} label="Human Review" styleType="warning" />
        <StatsCard icon={ShieldCheck} value={KPI_DATA.approved} label="Approved" styleType="success" />
      </div>

      {/* SECTION 2 - KANBAN PIPELINE */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-koi-heading)" }}>Verification Pipeline</h3>
        <div className="flex overflow-x-auto gap-6 pb-4 hide-scrollbar snap-x">
          
          {/* COLUMN 1: DRAFT */}
          <div className="w-[300px] flex-shrink-0 snap-start flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-gray-500 uppercase tracking-wider text-xs">Draft ({KANBAN_PIPELINE.drafts.length})</span>
            </div>
            <div className="flex-1 bg-gray-50/50 border border-gray-200/60 rounded-2xl p-3 space-y-3 min-h-[400px]">
              {KANBAN_PIPELINE.drafts.map(item => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                  <h4 className="font-bold text-gray-800 text-sm mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
                  <p className="text-xs text-gray-400 mb-4">Updated {item.updated}</p>
                  <Button variant="outline" className="w-full text-xs h-8 border-gray-300 text-gray-600 rounded-lg">
                    <Play className="w-3 h-3 mr-1.5" /> Resume
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 2: SUBMITTED */}
          <div className="w-[300px] flex-shrink-0 snap-start flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-blue-600 uppercase tracking-wider text-xs">Submitted ({KANBAN_PIPELINE.submitted.length})</span>
            </div>
            <div className="flex-1 bg-blue-50/30 border border-blue-100 rounded-2xl p-3 space-y-3 min-h-[400px]">
              {KANBAN_PIPELINE.submitted.map(item => (
                <div key={item.id} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                  <h4 className="font-bold text-gray-800 text-sm mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
                  <p className="text-xs text-gray-400">Queued • {item.date}</p>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 3: AI REVIEW */}
          <div className="w-[300px] flex-shrink-0 snap-start flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-[#0E4032] uppercase tracking-wider text-xs">AI Review ({KANBAN_PIPELINE.aiReview.length})</span>
            </div>
            <div className="flex-1 bg-[#0E4032]/5 border border-[#0E4032]/10 rounded-2xl p-3 space-y-3 min-h-[400px]">
              {KANBAN_PIPELINE.aiReview.map(item => (
                <div key={item.id} className="bg-white border border-[#0E4032]/20 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-gray-800 text-sm" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
                    <span className="text-xs font-bold text-[#0E4032]">{item.progress}%</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-gray-100 rounded-full mb-4 overflow-hidden">
                    <div className="h-full bg-[#0E4032] rounded-full" style={{ width: `${item.progress}%` }}></div>
                  </div>
                  <div className="space-y-2">
                    {item.tasks.map((task, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        {task.done ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-gray-300 border-t-gray-400 animate-spin" />
                        )}
                        <span className={task.done ? 'text-gray-600' : 'text-gray-400'}>{task.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 4: HUMAN REVIEW */}
          <div className="w-[300px] flex-shrink-0 snap-start flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-amber-600 uppercase tracking-wider text-xs">Human Review ({KANBAN_PIPELINE.humanReview.length})</span>
            </div>
            <div className="flex-1 bg-amber-50/50 border border-amber-200/60 rounded-2xl p-3 space-y-3 min-h-[400px]">
              {KANBAN_PIPELINE.humanReview.map(item => (
                <div key={item.id} className="bg-white border border-amber-200 rounded-xl p-4 shadow-[0_4px_12px_rgba(245,158,11,0.05)]">
                  <div className="inline-flex items-center bg-white text-gray-900 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mr-1.5" />
                    {item.badge}
                  </div>
                  <h4 className="font-bold text-gray-800 text-sm mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium mb-4 bg-amber-50 px-2 py-1 rounded-md w-fit">
                    <Flag className="w-3.5 h-3.5" />
                    {item.flags} Flags
                  </div>
                  {item.needsEvidence && (
                    <Button className="w-full text-xs h-8 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg shadow-none">
                      <Upload className="w-3 h-3 mr-1.5" /> Upload Evidence
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 5: FINAL DECISION */}
          <div className="w-[300px] flex-shrink-0 snap-start flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-green-600 uppercase tracking-wider text-xs">Final Decision ({KANBAN_PIPELINE.finalDecision.length})</span>
            </div>
            <div className="flex-1 bg-green-50/30 border border-green-100 rounded-2xl p-3 space-y-3 min-h-[400px]">
              {KANBAN_PIPELINE.finalDecision.map(item => (
                <div key={item.id} className={`bg-white border rounded-xl p-4 shadow-sm ${item.status === 'approved' ? 'border-green-200' : 'border-red-200'}`}>
                  <h4 className="font-bold text-gray-800 text-sm mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
                  {item.status === 'approved' ? (
                    <div className="inline-flex items-center bg-white text-gray-900 border border-green-200 px-2.5 py-1 rounded-md text-xs font-semibold">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-1.5" /> Approved
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="inline-flex items-center bg-white text-gray-900 border border-red-200 px-2.5 py-1 rounded-md text-xs font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mr-1.5" /> Rejected
                      </div>
                      <p className="text-xs text-gray-500 leading-tight">Reason: {item.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* BOTTOM GRID: TABLE & RIGHT PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SECTION 3 - DETAILED TABLE (Spans 2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-bold text-gray-900" style={{ fontFamily: "var(--font-koi-heading)" }}>All Submissions</h3>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input type="text" placeholder="Search..." className="pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white border-b border-gray-100 text-xs uppercase font-bold text-gray-400">
                <tr>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Submitted</th>
                  <th className="px-5 py-4">Current Stage</th>
                  <th className="px-5 py-4">Trust Score</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {DETAILED_TABLE.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900">{row.product}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{row.sku}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{row.submitted}</td>
                    <td className="px-5 py-4">
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider border ${getStatusBadge(row.statusLabel)}`}>
                        <StatusIcon status={row.statusLabel} />
                        {row.statusLabel}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {row.score !== '-' ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${parseInt(row.score) > 80 ? 'text-green-600' : 'text-amber-600'}`}>{row.score}</span>
                          {row.flags > 0 && (
                            <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold">
                              <Flag className="w-3 h-3" /> {row.flags}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 font-mono">---</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Button variant="ghost" className="h-8 px-3 text-[#0E4032] font-semibold text-xs hover:bg-[#0E4032]/10">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 4 - RIGHT PANEL */}
        <div className="space-y-6">
          
          {/* Card 1: Risk Alerts */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Risk Alerts
            </h4>
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                <div className="w-8 h-8 rounded-full border border-red-100 flex items-center justify-center bg-white shadow-sm shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase text-gray-900 border border-red-200 px-2 py-0.5 rounded tracking-wider bg-white">High Impact</span>
                  </div>
                  <h5 className="text-sm font-semibold text-gray-900 mb-0.5" style={{ fontFamily: "var(--font-koi-heading)" }}>Claim Unsupported</h5>
                  <p className="text-[13px] text-gray-500">Mass Gainer Pro: &quot;Zero Sugar&quot; contradicts parsed ingredients.</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                <div className="w-8 h-8 rounded-full border border-amber-100 flex items-center justify-center bg-white shadow-sm shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase text-gray-900 border border-amber-200 px-2 py-0.5 rounded tracking-wider bg-white">Medium Impact</span>
                  </div>
                  <h5 className="text-sm font-semibold text-gray-900 mb-0.5" style={{ fontFamily: "var(--font-koi-heading)" }}>Missing Lab Report</h5>
                  <p className="text-[13px] text-gray-500">Sleep Gummies: Melatonin levels require 3rd party lab evidence.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Reviewer Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
              <FileText className="w-4 h-4 text-blue-500" />
              Reviewer Notes
            </h4>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-sm text-gray-600 italic">&quot;Please provide clearer images of the back packaging for Hydration Mix. OCR confidence is below 80%.&quot;</p>
              <div className="mt-3 text-xs text-gray-400 font-semibold">— Admin System</div>
            </div>
          </div>

          {/* Card 3: Activity Feed */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
              <Activity className="w-4 h-4 text-green-500" />
              Activity Feed
            </h4>
            <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              
              <div className="relative flex items-center justify-between">
                <div className="absolute -left-5 w-2.5 h-2.5 bg-[#0E4032] rounded-full ring-4 ring-white"></div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">OCR complete</span>
                  <span className="text-xs text-gray-500">Hydration Mix</span>
                </div>
                <span className="text-xs font-mono text-gray-400">10:48 AM</span>
              </div>

              <div className="relative flex items-center justify-between">
                <div className="absolute -left-5 w-2.5 h-2.5 bg-gray-300 rounded-full ring-4 ring-white"></div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-700">AI review started</span>
                  <span className="text-xs text-gray-500">Pre-Workout Rush</span>
                </div>
                <span className="text-xs font-mono text-gray-400">10:44 AM</span>
              </div>

              <div className="relative flex items-center justify-between">
                <div className="absolute -left-5 w-2.5 h-2.5 bg-gray-300 rounded-full ring-4 ring-white"></div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-700">Submitted</span>
                  <span className="text-xs text-gray-500">Pre-Workout Rush</span>
                </div>
                <span className="text-xs font-mono text-gray-400">10:42 AM</span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
