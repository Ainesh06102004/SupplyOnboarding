import { getSupabaseClient } from '../supabase/client'
import { latestReport } from '../score'

/**
 * Fetch a list of products with their related SKUs, inventory, and screening reports.
 */
export async function getProducts(filters = {}) {
  const supabase = getSupabaseClient()

  let query = supabase
    .from('products')
    .select(`
      id,
      product_name,
      category_l1,
      status,
      created_at,
      skus ( id, screening_reports ( final_score, is_latest, created_at ) )
    `)
    .order('created_at', { ascending: false })

  // Apply filters if needed
  if (filters.search) {
    query = query.ilike('product_name', `%${filters.search}%`)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching products:', error)
    throw error
  }

  return data.map((product) => {
    // The standing score of the first SKU that has been screened — its latest
    // report, not whichever version the database returned first.
    let healthScore = null;
    for (const sku of product.skus || []) {
      const report = latestReport(sku.screening_reports)
      if (report) {
        healthScore = report.final_score
        break
      }
    }

    return {
      id: product.id,
      name: product.product_name,
      category: product.category_l1,
      status: product.status,
      skuCount: product.skus ? product.skus.length : 0,
      stock: 0, // inventory table is not linked currently
      healthScore: healthScore,
      createdAt: product.created_at,
    };
  })
}

export async function getProductStats() {
  const supabase = getSupabaseClient()

  // Total products
  const { count: totalProducts, error: err1 } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })

  // Live products
  const { count: liveProducts, error: err2 } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  // Under review
  const { count: underReview, error: err3 } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending_ai_review', 'pending_screening', 'pending_upload', 'draft'])

  if (err1 || err2 || err3) {
    console.error('Error fetching product stats', { err1, err2, err3 })
    throw err1 || err2 || err3
  }

  return {
    totalProducts: totalProducts || 0,
    liveProducts: liveProducts || 0,
    underReview: underReview || 0,
    riskAlerts: 0, // riskAlerts relies on complex sku joins, default to 0 for now
  }
}
