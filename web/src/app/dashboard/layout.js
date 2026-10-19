import DashboardShell from '@/components/dashboard/DashboardShell'
import AuthGuard from '@/components/auth/AuthGuard';
import { koiFontVars } from '@/lib/fonts/koiFonts';

export const metadata = {
  title: 'Dashboard | KOI Health',
  description: 'KOI Health-first Commerce Brand Dashboard',
}

// The brand portal in the store's language (cinematic storefront, Oct 2026):
// the same typefaces and koi-* tokens, a night sidebar, and KOI's dot in the
// topbar (components/dashboard/DashboardShell.jsx).
export default function DashboardLayout({ children }) {
  return (
    <div className={`${koiFontVars} min-h-screen bg-koi-bg font-koi-sans text-koi-ink antialiased`}>
      <AuthGuard>
        <DashboardShell>{children}</DashboardShell>
      </AuthGuard>
    </div>
  )
}
