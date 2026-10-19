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
    if (margin === null) return 'bg-gray-100 text-gray-400'
    if (margin < 30) return 'bg-red-50 text-red-600 border border-red-200'
    if (margin < 50) return 'bg-yellow-50 text-yellow-600 border border-yellow-200'
    return 'bg-green-50 text-green-600 border border-green-200'
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>SKU Engine</h3>
        <p className="text-gray-500">Define variants, sizes, and pricing. You can duplicate cards for quick data entry.</p>
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
            <div key={sku.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
              {/* SKU Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
                  <span className="w-6 h-6 rounded-full bg-koi-forest text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  {sku.skuName || `SKU #${index + 1}`}
                </h4>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => duplicateSku(sku.id)}
                    className="p-2 text-gray-500 hover:text-koi-forest hover:bg-koi-forest/10 rounded-lg transition-colors"
                    title="Duplicate SKU"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {skus.length > 1 && (
                    <button 
                      onClick={() => removeSku(sku.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>Basic Info</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">SKU Name *</label>
                        <input 
                          type="text" 
                          value={sku.skuName}
                          onChange={(e) => update('skuName', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_skuName`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="e.g. Vanilla 1kg"
                        />
                        {errors[`${index}_skuName`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_skuName`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">SKU Code *</label>
                        <input 
                          type="text" 
                          value={sku.skuCode}
                          onChange={(e) => update('skuCode', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_skuCode`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="e.g. KOI-VAN-1KG"
                        />
                        {errors[`${index}_skuCode`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_skuCode`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Variant / Flavour</label>
                        <input 
                          type="text" 
                          value={sku.variant}
                          onChange={(e) => update('variant', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest"
                          placeholder="e.g. Vanilla"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Weight / Vol *</label>
                        <input 
                          type="text" 
                          value={sku.size}
                          onChange={(e) => update('size', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_size`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="e.g. 1kg, 500ml"
                        />
                        {errors[`${index}_size`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_size`]}</span>}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Barcode / EAN</label>
                        <input 
                          type="text" 
                          value={sku.barcode}
                          onChange={(e) => update('barcode', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest"
                          placeholder="e.g. 8901234567890"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing Details (5 cols) */}
                  <div className="md:col-span-5 space-y-4 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider" style={{ fontFamily: "var(--font-koi-heading)" }}>Pricing</h5>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${marginColor}`}>
                        {margin !== null ? `Margin: ${margin.toFixed(1)}%` : 'Margin: N/A'}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">MRP (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.mrp}
                          onChange={(e) => update('mrp', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_mrp`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_mrp`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_mrp`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Selling Price (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.sellingPrice}
                          onChange={(e) => update('sellingPrice', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_sellingPrice`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_sellingPrice`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_sellingPrice`]}</span>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Supplier Cost (₹) *</label>
                        <input 
                          type="number" 
                          value={sku.supplierCost}
                          onChange={(e) => update('supplierCost', e.target.value)}
                          className={`w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest ${errors[`${index}_supplierCost`] ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          placeholder="0.00"
                          min="0" step="0.01"
                        />
                        {errors[`${index}_supplierCost`] && <span className="text-red-500 text-[10px] mt-0.5">{errors[`${index}_supplierCost`]}</span>}
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
        className="w-full h-12 border-dashed border-2 border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 rounded-xl"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Another SKU
      </Button>

      <div className="flex justify-between pt-6 border-t border-gray-100 mt-8">
        <Button 
          variant="ghost" 
          onClick={() => {
            setCurrentStep(1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          disabled={loading}
          className="text-gray-500 hover:text-gray-900"
        >
          Back
        </Button>
        <Button 
          onClick={handleNextClick} 
          disabled={loading}
          className="bg-koi-forest hover:bg-koi-night text-white h-12 px-8 rounded-xl font-semibold w-full sm:w-auto"
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
