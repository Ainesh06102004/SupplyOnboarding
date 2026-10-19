import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createDraftProduct } from '@/lib/dashboard/productCreation'
import { useProductCreationStore } from '@/store/productCreationStore'

const PREDEFINED_CLAIMS = [
  'High Protein', 'Zero Added Sugar', 'Probiotic', 
  'Organic', 'Gut Friendly', 'High Fiber', 'Low Carb'
]

// Mock brand ID for now
const TEMP_BRAND_ID = '00000000-0000-0000-0000-000000000001'

export default function Step1BasicInfo() {
  const { 
    basicInfo, 
    updateBasicInfo, 
    productId, 
    setProductId, 
    setCurrentStep 
  } = useProductCreationStore()
  
  const [customClaim, setCustomClaim] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const handleClaimToggle = (claim) => {
    const currentClaims = basicInfo.claims || []
    const isSelected = currentClaims.includes(claim)
    if (isSelected) {
      updateBasicInfo({ claims: currentClaims.filter(c => c !== claim) })
    } else {
      updateBasicInfo({ claims: [...currentClaims, claim] })
    }
  }

  const handleAddCustomClaim = (e) => {
    e.preventDefault()
    const currentClaims = basicInfo.claims || []
    if (customClaim.trim() && !currentClaims.includes(customClaim.trim())) {
      updateBasicInfo({ claims: [...currentClaims, customClaim.trim()] })
      setCustomClaim('')
    }
  }

  const handleRemoveClaim = (claim) => {
    const currentClaims = basicInfo.claims || []
    updateBasicInfo({ claims: currentClaims.filter(c => c !== claim) })
  }

  const validate = () => {
    const newErrors = {}
    if (!basicInfo.name?.trim()) newErrors.name = 'Product name is required'
    if (!basicInfo.category?.trim()) newErrors.category = 'Category is required'
    if (!basicInfo.shortDescription?.trim()) newErrors.shortDescription = 'Short description is required'
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNextClick = async () => {
    if (!validate()) {
      return
    }

    setLoading(true)
    try {
      if (!productId) {
        // Create draft row
        const newProductId = await createDraftProduct(TEMP_BRAND_ID, basicInfo)
        setProductId(newProductId)
      } else {
        // Here we could call updateProductDraft(productId, basicInfo) if it was already created,
        // but for Sprint 1, we just move to step 2.
      }
      setCurrentStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error('Failed to create draft:', err)
      alert("Failed to save product draft. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-1 font-koi-display text-[26px] font-extrabold tracking-[-0.01em] text-koi-forest">Basic Information</h3>
        <p className="text-koi-muted">Tell us about the core details of your product.</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-koi-ink2">Product Name *</label>
            <input 
              type="text" 
              value={basicInfo.name || ''}
              onChange={(e) => {
                updateBasicInfo({ name: e.target.value })
                if (errors.name) setErrors(prev => ({ ...prev, name: null }))
              }}
              className={`w-full px-4 py-3 bg-koi-paper border rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all ${errors.name ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
              placeholder="e.g. KOI Premium Protein"
            />
            {errors.name && <p className="text-koi-red text-xs mt-1">{errors.name}</p>}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-koi-ink2">Category *</label>
            <select 
              value={basicInfo.category || ''}
              onChange={(e) => {
                updateBasicInfo({ category: e.target.value })
                if (errors.category) setErrors(prev => ({ ...prev, category: null }))
              }}
              className={`w-full px-4 py-3 bg-koi-paper border rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all ${errors.category ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
            >
              <option value="">Select a category</option>
              <option value="protein_powder">Protein Powder</option>
              <option value="snack_bar">Snack Bar</option>
              <option value="supplements">Supplements</option>
              <option value="beverage">Beverage</option>
              <option value="other">Other</option>
            </select>
            {errors.category && <p className="text-koi-red text-xs mt-1">{errors.category}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-koi-ink2">Short Description *</label>
          <input 
            type="text" 
            value={basicInfo.shortDescription || ''}
            onChange={(e) => {
              updateBasicInfo({ shortDescription: e.target.value })
              if (errors.shortDescription) setErrors(prev => ({ ...prev, shortDescription: null }))
            }}
            className={`w-full px-4 py-3 bg-koi-paper border rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all ${errors.shortDescription ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
            placeholder="A quick, 1-sentence tagline for this product."
            maxLength={150}
          />
          {errors.shortDescription && <p className="text-koi-red text-xs mt-1">{errors.shortDescription}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-koi-ink2">Detailed Description</label>
          <textarea 
            value={basicInfo.longDescription || ''}
            onChange={(e) => updateBasicInfo({ longDescription: e.target.value })}
            className="w-full px-4 py-3 bg-koi-paper border border-koi-forest/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all min-h-[120px]"
            placeholder="Explain the benefits, usage instructions, and core value proposition..."
          />
        </div>

        <div className="space-y-4 pt-4 border-t border-koi-forest/10">
          <div>
            <label className="text-sm font-semibold text-koi-ink2 block mb-1">Product Claims</label>
            <p className="text-sm text-koi-muted mb-4">Select or add claims. These will be verified against your labels.</p>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {PREDEFINED_CLAIMS.map(claim => {
              const isSelected = (basicInfo.claims || []).includes(claim)
              return (
                <button
                  key={claim}
                  type="button"
                  onClick={() => handleClaimToggle(claim)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    isSelected 
                      ? 'bg-koi-forest text-white border-koi-forest shadow-md' 
                      : 'bg-white text-koi-ink2 border-koi-forest/10 hover:border-koi-forest/30 hover:bg-koi-paper'
                  }`}
                >
                  {claim}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {(basicInfo.claims || []).filter(c => !PREDEFINED_CLAIMS.includes(c)).map(claim => (
              <div key={claim} className="px-4 py-2 bg-koi-forest text-white rounded-full text-sm font-medium flex items-center gap-2 shadow-md">
                {claim}
                <button onClick={() => handleRemoveClaim(claim)} className="hover:bg-white/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddCustomClaim} className="flex gap-2 max-w-sm mt-4">
            <input 
              type="text" 
              value={customClaim}
              onChange={(e) => setCustomClaim(e.target.value)}
              placeholder="Add custom claim..."
              className="flex-1 px-4 py-2 bg-koi-paper border border-koi-forest/10 rounded-full focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest text-sm"
            />
            <Button type="submit" disabled={!customClaim.trim()} className="rounded-full bg-koi-night hover:bg-koi-night px-4">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </form>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-koi-forest/10">
        <Button 
          onClick={handleNextClick} 
          disabled={loading}
          className="bg-koi-forest hover:bg-koi-night text-koi-lime h-12 px-8 rounded-xl font-semibold w-full sm:w-auto"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving Draft...
            </div>
          ) : (
            'Save & Continue'
          )}
        </Button>
      </div>
    </div>
  )
}
