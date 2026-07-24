import React, { useState } from 'react'
import { Upload, X, FileText, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProductCreationStore } from '@/store/productCreationStore'

const EvidenceCard = ({ title, badge, badgeStyle = 'bg-gray-100 text-gray-600', impactLabel, description, children }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
    <div className="flex justify-between items-start mb-2">
      <h4 className="font-bold text-gray-900" style={{ fontFamily: "var(--font-koi-heading)" }}>{title}</h4>
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-1 uppercase tracking-wider rounded ${badgeStyle}`}>
          {badge}
        </span>
      )}
    </div>
    {impactLabel && (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-md mb-3 border border-blue-100">
        <ShieldCheck className="w-3.5 h-3.5" />
        {impactLabel}
      </div>
    )}
    <p className="text-sm text-gray-500 mb-6">{description}</p>
    {children}
  </div>
)

const MultiDropzone = ({ type, accept, acceptText, compliance, handleMultipleFiles, removeMultipleFile }) => {
  const files = compliance[type] || []

  return (
    <div>
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 rounded-xl cursor-pointer transition-all">
        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
          <Upload className="w-8 h-8 mb-2 text-gray-400" />
          <p className="text-sm text-gray-600 font-medium">Click or drag to upload multiple</p>
          <p className="text-xs text-gray-400 mt-1">{acceptText}</p>
        </div>
        <input 
          type="file" 
          multiple
          className="hidden" 
          accept={accept}
          onChange={(e) => handleMultipleFiles(type, e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, idx) => (
            <div key={idx} className="flex justify-between items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-sm">
              <div className="flex items-center gap-2 truncate text-gray-700">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{file.name}</span>
              </div>
              <button 
                onClick={() => removeMultipleFile(type, idx)}
                className="p-1 text-gray-400 hover:text-red-500 rounded ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Step4Compliance() {
  const { compliance, updateCompliance, setCurrentStep } = useProductCreationStore()
  const [loading, setLoading] = useState(false)

  const handleMultipleFiles = (type, newFiles) => {
    if (!newFiles || newFiles.length === 0) return
    const currentFiles = compliance[type] || []
    updateCompliance({ [type]: [...currentFiles, ...Array.from(newFiles)] })
  }

  const removeMultipleFile = (type, index) => {
    const currentFiles = compliance[type] || []
    updateCompliance({ [type]: currentFiles.filter((_, i) => i !== index) })
  }

  const handleContinue = async () => {
    const isEmpty = 
      compliance.certifications.length === 0 && 
      compliance.labReports.length === 0 && 
      compliance.clinicalStudies?.length === 0 &&
      compliance.evidenceNotes.trim() === ''

    if (isEmpty) {
      const confirmContinue = window.confirm("No supporting evidence added. Your trust score may be lower during verification. Continue anyway?")
      if (!confirmContinue) return
    }

    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 800))
      setCurrentStep(5)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error(err)
      alert('Failed to save compliance evidence. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = async () => {
    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 800))
      alert('Draft saved successfully!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>Compliance & Evidence</h3>
        <p className="text-gray-500">Provide supporting evidence for product claims and certifications.</p>
      </div>

      <div className="bg-[#0E4032]/5 border border-[#0E4032]/20 rounded-xl p-5 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-full bg-[#0E4032]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5 text-[#0E4032]" />
        </div>
        <div>
          <h5 className="font-bold text-[#0E4032] text-sm mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>Trust Signals Matter</h5>
          <p className="text-sm text-[#0E4032]/80 leading-relaxed">
            Products with verified certifications and lab-backed claims receive higher trust scores and faster approvals.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EvidenceCard 
          title="Certifications" 
          badge="Optional" 
          impactLabel="Medium Trust Impact"
          description="Upload product-specific certifications such as Organic, GMP, ISO, Non-GMO, Vegan Certified."
        >
          <MultiDropzone type="certifications" accept=".pdf,.jpg,.jpeg,.png" acceptText="PDF, PNG, JPG" compliance={compliance} handleMultipleFiles={handleMultipleFiles} removeMultipleFile={removeMultipleFile} />
        </EvidenceCard>

        <EvidenceCard 
          title="Lab Reports" 
          badge="Recommended" 
          badgeStyle="bg-amber-100 text-amber-700"
          impactLabel="High Trust Impact"
          description="Upload lab-tested reports supporting nutritional or safety claims."
        >
          <MultiDropzone type="labReports" accept=".pdf" acceptText="PDF preferred" compliance={compliance} handleMultipleFiles={handleMultipleFiles} removeMultipleFile={removeMultipleFile} />
        </EvidenceCard>

        <EvidenceCard 
          title="Clinical Trials & Studies" 
          badge="High Impact"
          badgeStyle="bg-green-100 text-green-700"
          impactLabel="Highest Trust Impact"
          description="Independent studies validating your product's effectiveness."
        >
          <MultiDropzone type="clinicalStudies" accept=".pdf" acceptText="PDF preferred" compliance={compliance} handleMultipleFiles={handleMultipleFiles} removeMultipleFile={removeMultipleFile} />
        </EvidenceCard>
      </div>

      <EvidenceCard 
        title="Evidence Notes" 
        impactLabel="Moderate Trust Impact"
        description="Provide context supporting health or nutritional claims."
      >
        <textarea 
          value={compliance.evidenceNotes || ''}
          onChange={(e) => updateCompliance({ evidenceNotes: e.target.value })}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032] transition-all min-h-[180px] text-sm"
          placeholder={"Example:\n• Protein content validated by NABL lab report dated Jan 2026\n• Contains clinically studied probiotic strain\n• No added refined sugar"}
        />
      </EvidenceCard>

      <div className="flex justify-between items-center pt-6 border-t border-gray-100">
        <Button 
          variant="ghost" 
          onClick={() => setCurrentStep(3)}
          disabled={loading}
          className="text-gray-500 hover:text-gray-900"
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={handleSaveDraft}
            disabled={loading}
            className="border-gray-300 text-gray-700 hover:bg-gray-50 h-12 px-6 rounded-xl font-semibold hidden sm:flex"
          >
            Save Draft
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={loading}
            className="bg-[#0E4032] hover:bg-[#0a2e24] text-white h-12 px-8 rounded-xl font-semibold w-full sm:w-auto"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </div>
            ) : (
              'Continue'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
