"use client"

import React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  CheckCircle2, Cpu, UserCheck, Rocket, Clock, ArrowLeft, Mail, ShieldCheck, Check,
} from 'lucide-react'

const C = {
  forest: '#0E4032',
  bg: '#F2F6EC',
  border: '#E2E8D8',
  muted: '#5A6B5A',
  lime: '#C8F23E',
  emerald: '#16A06E',
}

const TIMELINE = [
  { title: 'Submitted', status: 'completed', icon: CheckCircle2, text: 'Your onboarding details have been securely submitted.' },
  { title: 'AI verification in progress', status: 'active', icon: Cpu, text: 'Our engine is reviewing your brand, certifications and product claims for completeness and compliance.' },
  { title: 'Expert review', status: 'pending', icon: UserCheck, text: "KOI's health and compliance team assesses your submission for quality, trust and marketplace fit." },
  { title: 'Approval & go live', status: 'pending', icon: Rocket, text: "If approved, we'll reach out with onboarding confirmation and dashboard access." },
]

const CONFETTI = Array.from({ length: 16 }).map((_, i) => ({
  id: i,
  left: `${(i * 6.3 + 4) % 100}%`,
  color: [C.lime, C.emerald, C.forest, '#F36A1D'][i % 4],
  delay: (i % 8) * 0.12,
  size: 6 + (i % 3) * 3,
}))

function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {CONFETTI.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -30, opacity: 0, rotate: 0 }}
          animate={{ y: 180, opacity: [0, 1, 1, 0], rotate: 220 }}
          transition={{ duration: 2.1, delay: 0.2 + p.delay, ease: 'easeIn' }}
          className="absolute rounded-[2px]"
          style={{ left: p.left, width: p.size, height: p.size, background: p.color }}
        />
      ))}
    </div>
  )
}

export default function SubmissionSuccess() {
  const router = useRouter()

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12" style={{ background: C.bg, fontFamily: 'var(--font-koi-body), sans-serif' }}>
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0E4032 1px, transparent 0)', backgroundSize: '34px 34px' }} />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full" style={{ background: C.emerald, opacity: 0.12, filter: 'blur(120px)' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#E2E8D8] bg-white px-7 py-11 md:px-12"
        style={{ boxShadow: '0 30px 80px rgba(14,64,50,0.12)' }}
      >
        <Confetti />

        {/* header */}
        <div className="relative mb-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 180, damping: 14 }}
            className="mb-5 grid h-20 w-20 place-items-center rounded-full"
            style={{ background: C.forest }}
          >
            <Check className="h-9 w-9" style={{ color: C.lime }} strokeWidth={3} />
          </motion.div>
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#EAF8F0] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0C6B4C]">
            <ShieldCheck className="h-3.5 w-3.5" /> Application received
          </span>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0E4032] md:text-[32px]" style={{ fontFamily: 'var(--font-koi-heading)' }}>
            You&apos;re in the queue.
          </h1>
          <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-[#5A6B5A]">
            Thank you for applying to KOI. Here&apos;s exactly what happens from here.
          </p>
        </div>

        {/* timeline */}
        <div className="rounded-[22px] border border-[#E2E8D8] bg-[#F7FAF2] px-6 py-7 md:px-8">
          {TIMELINE.map((item, idx) => (
            <TimelineItem key={item.title} {...item} index={idx} isLast={idx === TIMELINE.length - 1} />
          ))}
        </div>

        {/* ETA */}
        <div className="mt-5 flex items-center gap-4 rounded-[18px] p-5" style={{ background: C.forest }}>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: 'rgba(200,242,62,0.15)' }}>
            <Clock className="h-5 w-5" style={{ color: C.lime }} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-white/60">Expected review time</p>
            <p className="text-[20px] font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-koi-heading)' }}>24–72 hours</p>
          </div>
          <p className="ml-auto hidden max-w-[180px] text-right text-[11px] leading-snug text-white/45 sm:block">
            Varies with documentation completeness.
          </p>
        </div>

        {/* closing */}
        <div className="mt-9 text-center">
          <h2 className="text-[18px] font-bold leading-snug tracking-tight text-[#0E4032] md:text-[20px]" style={{ fontFamily: 'var(--font-koi-heading)' }}>
            Building healthier choices for India<br className="hidden sm:block" /> starts with brands like yours.
          </h2>
        </div>

        {/* CTAs */}
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => router.push('/')}
            className="group inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(14,64,50,0.25)]"
            style={{ background: C.forest }}
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to home
          </button>
          <button
            onClick={() => window.open('mailto:support@koi.health', '_blank')}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[#E2E8D8] px-6 text-[14px] font-semibold text-[#5A6B5A] transition-colors hover:bg-[#EDF2E6] hover:text-[#0E4032]"
          >
            <Mail className="h-4 w-4" />
            Contact support
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function TimelineItem({ title, status, icon: Icon, text, index, isLast }) {
  const isCompleted = status === 'completed'
  const isActive = status === 'active'
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.3 + index * 0.12 }}
      className="flex gap-4"
    >
      <div className="flex flex-col items-center">
        <div
          className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all', isActive && 'animate-pulse')}
          style={{
            background: isCompleted ? C.emerald : isActive ? 'rgba(200,242,62,0.18)' : '#E2E8D8',
            border: isActive ? `1.5px solid ${C.lime}` : '1.5px solid transparent',
          }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} style={{ color: isCompleted ? '#fff' : isActive ? '#0C6B4C' : C.muted }} />
        </div>
        {!isLast && <div className="my-1.5 w-0.5 flex-1 min-h-[30px]" style={{ background: isCompleted ? 'rgba(22,160,110,0.35)' : '#E2E8D8' }} />}
      </div>
      <div className={cn('pb-6', isLast && 'pb-0')}>
        <h3 className="text-[15px] font-bold tracking-tight" style={{ color: isCompleted ? C.emerald : isActive ? '#0C6B4C' : C.muted, fontFamily: 'var(--font-koi-heading)' }}>
          {title}
        </h3>
        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-[#5A6B5A]">{text}</p>
      </div>
    </motion.div>
  )
}
