import React, { useState } from 'react'
import { Plus, Trash2, Copy, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSkus } from '@/lib/dashboard/productCreation'
import { useProductCreationStore } from '@/store/productCreationStore'

export default function Step2SkuSetup() {
  const { 
    skus, 
    addSku, 
    updateSku, 
    duplicateSku, 
    removeSku, 
    productId, 
    saveSkus,
    setCurrentStep 
  } = useProductCreationStore()

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({}) // Keyed by sku_index_field

  const calculateMargin = (supplierCost, sellingPrice) => {
    const cost = parseFloat(supplierCost)
    const price = parseFloat(sellingPrice)
    if (!cost || !price || price <= 0) return null
    return ((price - cost) / price) * 100
  }

  const getMarginColor = (margin) => {
    if (margin === null) return 'bg-koi-track/60 text-koi-muted'
    if (margin < 30) return 'bg-koi-red-bg text-koi-red border border-koi-red/20'
    if (margin < 50) return 'bg-koi-amber-bg text-koi-amber border border-koi-amber-border'
    return 'bg-koi-tint text-koi-green border border-koi-tint-border'
  }

  const validate = () => {
    const newErrors = {}
    const skuCodes = new Set()
    let isValid = true

    skus.forEach((sku, index) => {
      if (!sku.skuName?.trim()) { newErrors[`${index}_skuName`] = 'Name required'; isValid = false }
      
      const code = sku.skuCode?.trim()
      if (!code) { newErrors[`${index}_skuCode`] = 'Code required'; isValid = false }
      else if (skuCodes.has(code)) { newErrors[`${index}_skuCode`] = 'Must be unique'; isValid = false }
      else skuCodes.add(code)

      if (!sku.size?.trim()) { newErrors[`${index}_size`] = 'Weight/Vol required'; isValid = false }
      
      const mrp = parseFloat(sku.mrp)
      const cost = parseFloat(sku.supplierCost)
      const price = parseFloat(sku.sellingPrice)

      if (isNaN(mrp) || mrp <= 0) { newErrors[`${index}_mrp`] = 'Must be > 0'; isValid = false }
      if (isNaN(cost) || cost <= 0) { newErrors[`${index}_supplierCost`] = 'Must be > 0'; isValid = false }
      if (isNaN(price) || price <= 0) { newErrors[`${index}_sellingPrice`] = 'Must be > 0'; isValid = false }
      
      if (!isNaN(price) && !isNaN(mrp) && price > mrp) {
        newErrors[`${index}_sellingPrice`] = 'Cannot exceed MRP'
        isValid = false
      }
      if (!isNaN(cost) && !isNaN(price) && cost > price) {
        newErrors[`${index}_supplierCost`] = 'Cannot exceed Selling Price'
        isValid = false
      }
    })

    setErrors(newErrors)
    return isValid
  }

  const handleNextClick = async () => {
    if (!validate()) {
      // Scroll to first error
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setLoading(true)
    try {
      if (productId) {
        const savedDbSkus = await createSkus(productId, skus)
        saveSkus(savedDbSkus)
      }
      setCurrentStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error('Failed to create SKUs:', err)
      alert("Failed to save SKUs. Please check uniqueness of codes/barcodes and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-1 font-koi-display text-[26px] font-extrabold tracking-[-0.01em] text-koi-forest">SKU Engine</h3>
        <p className="text-koi-muted">Define variants, sizes, and pricing. You can duplicate cards for quick data entry.</p>
      </div>

      <div className="space-y-6">
        {skus.map((sku, index) => {
          const margin = calculateMargin(sku.supplierCost, sku.sellingPrice)
          const marginColor = getMarginColor(margin)

          const update = (field, value) => {
            updateSku(sku.id, field, value)
            if (errors[`${index}_${field}`]) {
              setErrors(prev => ({ ...prev, [`${index}_${field}`]: null }))
            }
          }

          return (
            <div key={sku.id} className="bg-white border border-koi-forest/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
              {/* SKU Header */}
              <div className="bg-koi-paper px-6 py-4 border-b border-koi-forest/10 flex justify-between items-center">
                <h4 className="font-semibold text-koi-ink flex items-center gap-2 font-koi-display">
                  <span className="w-6 h-6 rounded-full bg-koi-forest text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  {sku.skuName || `SKU #${index + 1}`}
                </h4>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => duplicateSku(sku.id)}
                    className="p-2 text-koi-muted hover:text-koi-forest hover:bg-koi-forest/10 rounded-lg transition-colors"
                    title="Duplicate SKU"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {skus.length > 1 && (
                    <button 
                      onClick={() => removeSku(sku.id)}
                      className="p-2 text-koi-muted hover:text-koi-red hover:bg-koi-red-bg rounded-lg transition-colors"
                      title="Remove SKU"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* SKU Form */}
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Basic Details (7 cols) */}
                  <div className="md:col-span-7 space-y-4">
                    <h5 className="text-xs font-bold text-koi-muted uppercase tracking-wider mb-2 font-koi-display">Basic Info</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">SKU Name *</label>
                        <input 
                          type="text" 
                          value={sku.skuName}
                          onChange={(e) => update('skuName', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_skuName`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="e.g. Vanilla 1kg"
                        />
                        {errors[`${index}_skuName`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_skuName`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">SKU Code *</label>
                        <input 
                          type="text" 
                          value={sku.skuCode}
                          onChange={(e) => update('skuCode', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_skuCode`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="e.g. KOI-VAN-1KG"
                        />
                        {errors[`${index}_skuCode`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_skuCode`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">Variant / Flavour</label>
                        <input 
                          type="text" 
                          value={sku.variant}
                          onChange={(e) => update('variant', e.target.value)}
                          className="w-full px-3 py-2 bg-koi-paper border border-koi-forest/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest"
                          placeholder="e.g. Vanilla"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">Weight / Vol *</label>
                        <input 
                          type="text" 
                          value={sku.size}
                          onChange={(e) => update('size', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_size`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="e.g. 1kg, 500ml"
                        />
                        {errors[`${index}_size`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_size`]}</span>}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">Barcode / EAN</label>
                        <input 
                          type="text" 
                          value={sku.barcode}
                          onChange={(e) => update('barcode', e.target.value)}
                          className="w-full px-3 py-2 bg-koi-paper border border-koi-forest/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest"
                          placeholder="e.g. 8901234567890"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing Details (5 cols) */}
                  <div className="md:col-span-5 space-y-4 border-t md:border-t-0 md:border-l border-koi-forest/10 pt-4 md:pt-0 md:pl-6">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="text-xs font-bold text-koi-muted uppercase tracking-wider font-koi-display">Pricing</h5>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${marginColor}`}>
                        {margin !== null ? `Margin: ${margin.toFixed(1)}%` : 'Margin: N/A'}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">MRP (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.mrp}
                          onChange={(e) => update('mrp', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_mrp`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_mrp`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_mrp`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">Selling Price (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.sellingPrice}
                          onChange={(e) => update('sellingPrice', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_sellingPrice`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_sellingPrice`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_sellingPrice`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-koi-ink2 mb-1 block">Supplier Cost (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.supplierCost}
                          onChange={(e) => update('supplierCost', e.target.value)}
                          className={`w-full px-3 py-2 bg-koi-paper border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_supplierCost`] ? 'border-koi-red/40 bg-koi-red-bg' : 'border-koi-forest/10'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_supplierCost`] && <span className="text-koi-red text-[10px] mt-0.5">{errors[`${index}_supplierCost`]}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Button 
        variant="outline" 
        onClick={addSku}
        className="w-full h-12 border-dashed border-2 border-koi-forest/20 text-koi-muted hover:text-koi-ink hover:border-koi-forest/40 hover:bg-koi-paper rounded-xl"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Another SKU
      </Button>

      <div className="flex justify-between pt-6 border-t border-koi-forest/10 mt-8">
        <Button 
          variant="ghost" 
          onClick={() => {
            setCurrentStep(1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          disabled={loading}
          className="text-koi-muted hover:text-koi-ink"
        >
          Back
        </Button>
        <Button 
          onClick={handleNextClick} 
          disabled={loading}
          className="bg-koi-forest hover:bg-koi-night text-koi-lime h-12 px-8 rounded-xl font-semibold w-full sm:w-auto"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving SKUs...
            </div>
          ) : (
            'Save & Continue'
          )}
        </Button>
      </div>
    </div>
  )
}
