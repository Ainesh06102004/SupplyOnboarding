import React from 'react'
import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ProductsTable({ loading, products }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-koi-track overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100 text-sm font-semibold text-gray-500">
              <th className="p-4 pl-6">Product</th>
              <th className="p-4">Category</th>
              <th className="p-4">SKU Count</th>
              <th className="p-4">Status</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Health Score</th>
              <th className="p-4 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-6 h-6 border-2 border-koi-forest border-t-transparent rounded-full animate-spin" />
                    Loading products...
                  </div>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-16 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-koi-forest/10 rounded-full flex items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-koi-forest" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>No products added yet</h3>
                    <p className="text-gray-500 mb-6">Start by adding your first product to KOI.</p>
                    <Link href="/dashboard/products/new" passHref>
                      <Button className="bg-koi-forest hover:bg-koi-night text-white rounded-xl gap-2 shadow-md">
                        <Plus className="w-4 h-4" />
                        Add Product
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="p-4 pl-6">
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">ID: {product.id.substring(0, 8)}...</div>
                  </td>
                  <td className="p-4 text-gray-600 capitalize">{product.category?.replace(/_/g, ' ') || 'Uncategorized'}</td>
                  <td className="p-4 text-gray-600">{product.skuCount}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      product.status === 'live' || product.status === 'approved' ? 'bg-green-100 text-green-700' :
                      product.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      product.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {product.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">{product.stock}</td>
                  <td className="p-4">
                    {product.healthScore !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-100 rounded-full h-1.5 max-w-[60px]">
                          <div 
                            className={`h-1.5 rounded-full ${
                              product.healthScore >= 90 ? 'bg-green-500' : 
                              product.healthScore >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} 
                            style={{ width: `${product.healthScore}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{product.healthScore}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <Button variant="ghost" size="sm" className="text-koi-forest hover:text-koi-night hover:bg-koi-forest/10 font-semibold">
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
