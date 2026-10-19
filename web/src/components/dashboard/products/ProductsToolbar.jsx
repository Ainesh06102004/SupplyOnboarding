import React from 'react'
import { Search, Filter, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ProductsToolbar({ searchQuery, setSearchQuery }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-koi-track">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          type="text" 
          placeholder="Search products by name..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest transition-all"
        />
      </div>
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <Button variant="outline" className="flex-1 sm:flex-none gap-2 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          Filters
        </Button>
        <Button variant="outline" className="flex-1 sm:flex-none gap-2 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50">
          <ArrowUpDown className="w-4 h-4" />
          Sort
        </Button>
      </div>
    </div>
  )
}
