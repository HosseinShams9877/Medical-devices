'use client'
import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from './api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

export type EditableProduct = { id: string; code: string; name: string; category: string | null; description?: string | null; warrantyMonths: number; hasFirmware: boolean }
export function ProductEditor({ open, onOpenChange, product, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; product?: EditableProduct; onCreated?: (p: { id: string }) => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({ code: '', name: '', unit: 'دستگاه', revision: 'A', category: '', description: '', warrantyMonths: 12, hasFirmware: false })
  const [error, setError] = React.useState('')
  React.useEffect(() => { if (open) { setForm({ code: product?.code ?? '', name: product?.name ?? '', unit: 'دستگاه', revision: 'A', category: product?.category ?? '', description: product?.description ?? '', warrantyMonths: product?.warrantyMonths ?? 12, hasFirmware: product?.hasFirmware ?? false }); setError('') } }, [open, product])
  const mutation = useMutation({ mutationFn: () => product ? apiPost(`/api/products/${product.id}`, { action: 'edit', name: form.name, category: form.category, description: form.description, warrantyMonths: form.warrantyMonths, hasFirmware: form.hasFirmware }) : apiPost<{ product: { id: string } }>('/api/products', form), onSuccess: async result => {
    for (const key of ['products', 'product', 'inventory']) await qc.invalidateQueries({ queryKey: [key] })
    toast({ title: product ? 'محصول ویرایش شد' : 'محصول ثبت شد؛ BOM را تعریف کنید' }); onOpenChange(false)
    if (!product && result && typeof result === 'object' && 'product' in result) onCreated?.((result as { product: { id: string } }).product)
  }, onError: e => setError((e as Error).message) })
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{product ? 'ویرایش محصول' : 'محصول جدید'}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3">
    {(['code', 'name', 'category', 'description', ...(!product ? ['unit', 'revision'] : [])] as const).map(key => <label key={key}>{({ code: 'کد محصول', name: 'نام محصول', category: 'گروه', description: 'توضیحات', unit: 'واحد محصول', revision: 'نسخه' } as Record<string, string>)[key]}<Input aria-label={key} value={String(form[key as keyof typeof form])} disabled={key === 'code' && !!product} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
    <label>گارانتی (ماه)<Input type="number" min={0} max={120} value={form.warrantyMonths} onChange={e => setForm(f => ({ ...f, warrantyMonths: Number(e.target.value) }))} /></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.hasFirmware} onChange={e => setForm(f => ({ ...f, hasFirmware: e.target.checked }))} />دارای Firmware</label>
  </div>{error && <p role="alert" className="text-rose-700">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button><Button disabled={mutation.isPending || form.name.trim().length < 2 || form.code.trim().length < 2} onClick={() => mutation.mutate()}>ذخیره محصول</Button></DialogFooter></DialogContent></Dialog>
}

export type EditableComponent = { id: string; code: string; name: string; unit: string; category?: string | null; manufacturer?: string | null; specs?: string | null; criticality: string; minStock: number }
export function ComponentEditor({ open, onOpenChange, component }: { open: boolean; onOpenChange: (v: boolean) => void; component?: EditableComponent }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({ code: '', name: '', unit: 'عدد', category: '', manufacturer: '', specs: '', criticality: 'NORMAL', minStock: 0 })
  const [error, setError] = React.useState('')
  React.useEffect(() => { if (open) { setForm({ code: component?.code ?? '', name: component?.name ?? '', unit: component?.unit ?? 'عدد', category: component?.category ?? '', manufacturer: component?.manufacturer ?? '', specs: component?.specs ?? '', criticality: component?.criticality ?? 'NORMAL', minStock: component?.minStock ?? 0 }); setError('') } }, [open, component])
  const mutation = useMutation({ mutationFn: () => apiPost('/api/components', { ...form, id: component?.id }), onSuccess: async () => {
    for (const key of ['inventory', 'components-min', 'product', 'order-material-preview']) await qc.invalidateQueries({ queryKey: [key] })
    toast({ title: 'اطلاعات قطعه ذخیره شد', description: 'موجودی فقط با رسید و تأیید کنترل ورودی ثبت می‌شود.' }); onOpenChange(false)
  }, onError: e => setError((e as Error).message) })
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{component ? 'ویرایش قطعه' : 'تعریف قطعه جدید'}</DialogTitle></DialogHeader><p className="text-sm">تعریف قطعه موجودی ایجاد نمی‌کند. پس از ذخیره، «ثبت رسید» را انجام دهید.</p><div className="grid grid-cols-2 gap-3">
    {(['code', 'name', 'unit', 'category', 'manufacturer', 'specs'] as const).map(key => <label key={key}>{({ code: 'کد قطعه', name: 'نام قطعه', unit: 'واحد', category: 'گروه', manufacturer: 'سازنده', specs: 'مشخصات' })[key]}<Input aria-label={key} value={form[key]} disabled={key === 'code' && !!component} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
    <label>حداقل موجودی<Input type="number" min={0} value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} /></label>
    <label>اهمیت<select className="border rounded p-2 w-full" value={form.criticality} onChange={e => setForm(f => ({ ...f, criticality: e.target.value }))}><option value="NORMAL">عادی</option><option value="CRITICAL">بحرانی</option></select></label>
  </div>{error && <p role="alert" className="text-rose-700">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button><Button disabled={mutation.isPending || form.code.trim().length < 2 || form.name.trim().length < 2 || !form.unit.trim()} onClick={() => mutation.mutate()}>ذخیره قطعه</Button></DialogFooter></DialogContent></Dialog>
}
