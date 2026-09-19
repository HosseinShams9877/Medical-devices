'use client'

// مرز خطای سطح صفحه — اگر خطایی در رندر رخ دهد، کل اپ سفید نمی‌شود و با دکمهٔ تلاش مجدد قابل بازیابی است
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('APP_ERROR', error)
  }, [error])

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-lg">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold mb-2">خطایی در نمایش این بخش رخ داد</h1>
        <p className="text-sm text-muted-foreground mb-1 leading-6">
          داده‌های شما سالم است؛ فقط نمایش این صفحه با خطا مواجه شد. با تلاش مجدد معمولاً مشکل برطرف می‌شود.
        </p>
        {error.digest && <p className="text-[11px] text-muted-foreground mb-4 tnum">کد پیگیری: {error.digest}</p>}
        <div className="flex gap-2 justify-center mt-5">
          <Button onClick={reset} className="gap-1.5 bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700">
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> تلاش مجدد
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = '/' }}>بازگشت به صفحهٔ اصلی</Button>
        </div>
      </div>
    </div>
  )
}
