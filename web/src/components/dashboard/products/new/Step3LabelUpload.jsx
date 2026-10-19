import React, { useState } from 'react'
import { Upload, Image as ImageIcon, Sparkles, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useProductCreationStore } from '@/store/productCreationStore'

const UploadCard = ({ title, badge, badgeColor = 'bg-koi-track/60 text-koi-ink2', description, children, error }) => (
  <div className={`bg-white border ${error ? 'border-koi-red/40' : 'border-koi-forest/10'} rounded-2xl p-6 shadow-sm`}>
    <div className="flex justify-between items-start mb-2">
      <h4 className="font-bold text-koi-ink font-koi-display">{title}</h4>
      <span className={`text-[10px] font-bold px-2 py-1 uppercase tracking-wider rounded ${badgeColor}`}>
        {badge}
      </span>
    </div>
    <p className="text-sm text-koi-muted mb-6">{description}</p>
    {children}
    {error && <p className="text-koi-red text-xs mt-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
  </div>
)

const SingleDropzone = ({ type, accept = ".pdf,.jpg,.jpeg,.png", acceptText = "PNG, JPG, PDF", assets, handleSingleFile }) => {
  const file = assets[type]

  return (
    <label className={`
      flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all
      ${file ? 'border-koi-tint-border bg-koi-tint' : 'border-koi-forest/20 bg-koi-paper hover:bg-koi-track/60'}
    `}>
      <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
        {file ? (
          <>
            <CheckCircle2 className="w-8 h-8 text-koi-green mb-2" />
            <p className="text-sm font-semibold text-koi-primary truncate max-w-[200px]">{file.name}</p>
            <p className="text-xs text-koi-green mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 mb-2 text-koi-muted" />
            <p className="text-sm text-koi-ink2 font-medium">Click or drag to upload</p>
            <p className="text-xs text-koi-muted mt-1">{acceptText} max 10MB</p>
          </>
        )}
      </div>
      <input 
        type="file" 
        className="hidden" 
        accept={accept}
        onChange={(e) => handleSingleFile(type, e.target.files[0])}
      />
    </label>
  )
}

const MultiDropzone = ({ type, accept = ".pdf,.jpg,.jpeg,.png", acceptText = "PNG, JPG, PDF", assets, handleMultipleFiles, removeMultipleFile }) => {
  const files = assets[type] || []

  return (
    <div>
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-koi-forest/20 bg-koi-paper hover:bg-koi-track/60 rounded-xl cursor-pointer transition-all">
        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
          <ImageIcon className="w-8 h-8 mb-2 text-koi-muted" />
          <p className="text-sm text-koi-ink2 font-medium">Click or drag to upload multiple</p>
          <p className="text-xs text-koi-muted mt-1">{acceptText} max 10MB</p>
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
            <div key={idx} className="flex justify-between items-center bg-koi-paper border border-koi-forest/10 px-3 py-2 rounded-lg text-sm">
              <span className="truncate max-w-[200px] text-koi-ink2">{file.name}</span>
              <button 
                onClick={() => removeMultipleFile(type, idx)}
                className="p-1 text-koi-muted hover:text-koi-red rounded ml-2"
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

export default function Step3LabelUpload() {
  const { assets, updateAssets, setCurrentStep } = useProductCreationStore()
  const [loading] = useState(false)
  const [errors, setErrors] = useState({})

  const handleSingleFile = (type, file) => {
    if (!file) return
    updateAssets({ [type]: file })
    if (errors[type]) setErrors(prev => ({ ...prev, [type]: null }))
  }

  const handleMultipleFiles = (type, newFiles) => {
    if (!newFiles || newFiles.length === 0) return
    const currentFiles = assets[type] || []
    updateAssets({ [type]: [...currentFiles, ...Array.from(newFiles)] })
  }

  const removeMultipleFile = (type, index) => {
    const currentFiles = assets[type] || []
    updateAssets({ [type]: currentFiles.filter((_, i) => i !== index) })
  }

  const validate = () => {
    const newErrors = {}
    if (!assets.nutritionLabel) newErrors.nutritionLabel = 'Nutrition Label is required'
    if (!assets.ingredientLabel) newErrors.ingredientLabel = 'Ingredient Label is required'
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = async () => {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // The files stay in this wizard's store; nothing uploads them here (this
    // used to fake an 800 ms save). uploadLabels exists, but browser writes to
    // `uploads` are revoked (migration 00025) until a brand-authorised server
    // route exists.
    setCurrentStep(4)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // This used to wait 800 ms and announce "Draft saved successfully!" while
  // saving nothing. Say what is true instead.
  const handleSaveDraft = () => {
    toast('Your files are kept while this page is open', {
      description: 'Drafts are not saved to KOI yet — keep your label photos to hand.',
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-1 font-koi-display text-[26px] font-extrabold tracking-[-0.01em] text-koi-forest">Product Assets</h3>
        <p className="text-koi-muted">Upload packaging and label files for AI extraction.</p>
      </div>

      <div className="bg-koi-forest/5 border border-koi-forest/20 rounded-2xl p-4 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-full bg-koi-forest/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5 text-koi-forest" />
        </div>
        <div>
          <h5 className="font-bold text-koi-forest text-sm mb-1 font-koi-display">AI-assisted extraction enabled</h5>
          <p className="text-sm text-koi-forest/80 leading-relaxed">
            KOI AI will analyze uploaded assets to extract nutrition facts, ingredients, claims, and certification badges.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UploadCard 
          title="Nutrition Label" 
          badge="Required" 
          badgeColor="bg-koi-red-bg text-koi-red"
          description="Upload the nutrition facts panel from packaging."
          error={errors.nutritionLabel}
        >
          <SingleDropzone type="nutritionLabel" assets={assets} handleSingleFile={handleSingleFile} />
        </UploadCard>

        <UploadCard 
          title="Ingredient Label" 
          badge="Required" 
          badgeColor="bg-koi-red-bg text-koi-red"
          description="Upload ingredient and allergen information."
          error={errors.ingredientLabel}
        >
          <SingleDropzone type="ingredientLabel" assets={assets} handleSingleFile={handleSingleFile} />
        </UploadCard>

        <UploadCard 
          title="Packaging Images" 
          badge="Optional" 
          description="Upload front, back and side packaging images."
        >
          <MultiDropzone type="packagingImages" assets={assets} handleMultipleFiles={handleMultipleFiles} removeMultipleFile={removeMultipleFile} />
        </UploadCard>

        <UploadCard 
          title="Barcode / Product Code" 
          badge="Optional" 
          description="Upload barcode image or enter barcode manually."
        >
          <div className="space-y-4">
            <SingleDropzone type="barcodeFile" acceptText="PNG, JPG" assets={assets} handleSingleFile={handleSingleFile} />
            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1 bg-koi-track"></div>
              <span className="text-xs text-koi-muted font-bold uppercase">OR</span>
              <div className="h-[1px] flex-1 bg-koi-track"></div>
            </div>
            <input 
              type="text" 
              value={assets.barcodeText || ''}
              onChange={(e) => updateAssets({ barcodeText: e.target.value })}
              className="w-full px-4 py-3 bg-koi-paper border border-koi-forest/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all text-sm"
              placeholder="Enter Barcode / EAN"
            />
          </div>
        </UploadCard>
      </div>

      <div className="flex justify-between items-center pt-6 border-t border-koi-forest/10">
        <Button 
          variant="ghost" 
          onClick={() => setCurrentStep(2)}
          disabled={loading}
          className="text-koi-muted hover:text-koi-ink"
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={handleSaveDraft}
            disabled={loading}
            className="border-koi-forest/20 text-koi-ink2 hover:bg-koi-paper h-12 px-6 rounded-xl font-semibold hidden sm:flex"
          >
            Save Draft
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={loading}
            className="bg-koi-forest hover:bg-koi-night text-koi-lime h-12 px-8 rounded-xl font-semibold w-full sm:w-auto"
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
