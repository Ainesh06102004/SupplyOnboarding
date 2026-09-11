import React, { useEffect, useState } from 'react'
import { CheckCircle, FileEdit, Send, ShieldCheck, ScanText, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { queueLabelReading, submitProductForReview } from '@/lib/dashboard/productCreation'

// This step used to "run AI extraction": it waited three seconds, showed a
// hardcoded result — 25 g protein, whey protein isolate, "Score: 85/100",
// "All Clear! No banned substances detected" — for every product, and wrote
// that score into screening_reports as if KOI had read the label. Nothing had
// read anything. The brand saw an approval KOI never gave, and the storefront
// got a trust score nobody computed.
//
// What really happens now: the labels are queued for KOI's label engine, a
// model transcribes them, and a KOI reviewer checks every ingredient list and
// every allergen before anything reaches the storefront. So this step says
// that, and asks for nothing it cannot deliver.
const STEPS = [
  { icon: ScanText, title: 'KOI reads your labels', body: 'Each photo is transcribed exactly as printed — ingredients, allergen statement and nutrition table.' },
  { icon: UserCheck, title: 'A person checks it', body: 'A KOI reviewer confirms every ingredient list and every allergen against your photo. Nothing is published from the model alone.' },
  { icon: ShieldCheck, title: 'Then it is screened', body: 'Claims are tested against FSSAI’s conditions using your declared figures before the product is listed.' },
]

export default function Step5AIReview({ productId, onBack, onComplete }) {
  const [queued, setQueued] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!productId || queued) return
    queueLabelReading(productId)
      .then(() => setQueued(true))
      .catch((err) => {
        console.error('Failed to queue labels', err)
        setError('Your labels were uploaded, but we could not queue them for reading. Try again in a moment.')
      })
  }, [productId, queued])

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setError(null)
      await submitProductForReview(productId)
      onComplete()
    } catch (err) {
      console.error('Failed to submit for review', err)
      setError('We could not submit the product. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-koi-heading)" }}>Your labels are with KOI</h3>
          {queued && (
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Queued for reading
            </span>
          )}
        </div>
        <p className="text-gray-500">There is no instant result here on purpose. This is what happens next.</p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <Icon className="w-5 h-5 text-[#0E4032] mb-3" />
            <h4 className="font-semibold text-gray-900 mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>{title}</h4>
            <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <p className="text-sm text-gray-600 mb-6">
          The clearest results come from a photo of the back of the pack showing the full ingredient list, the allergen
          statement and the nutrition table. If yours were cropped or blurred, go back and replace them.
        </p>
        {error && <p className="text-sm text-red-700 mb-4" role="alert">{error}</p>}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={onBack} disabled={submitting} className="flex-1 rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50 h-12 font-semibold">
            <FileEdit className="w-4 h-4 mr-2" />
            Replace labels
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !queued} className="flex-1 bg-[#0E4032] hover:bg-[#0a2e24] text-white rounded-xl h-12 font-semibold shadow-md">
            {submitting ? 'Submitting…' : (<><Send className="w-4 h-4 mr-2" />Submit for approval</>)}
          </Button>
        </div>
      </div>
    </div>
  )
}
