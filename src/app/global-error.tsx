'use client'

// آخرین خط دفاع — اگر خود Root Layout خطا دهد (بدون این فایل، مرورگر صفحهٔ خالی نشان می‌داد)
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error) console.error('GLOBAL_ERROR', error)

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'Tahoma, sans-serif', background: '#f8fafc' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.06)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={28} color="#d97706" aria-hidden="true" />
            </div>
            <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>خطای غیرمنتظره در سامانه</h1>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8, margin: 0 }}>
              داده‌های شما سالم است. لطفاً صفحه را دوباره بارگذاری کنید؛ اگر مشکل ادامه یافت با مدیر سامانه تماس بگیرید.
            </p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 20, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RotateCcw size={15} aria-hidden="true" /> تلاش مجدد
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
