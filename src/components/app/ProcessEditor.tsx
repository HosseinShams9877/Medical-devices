'use client'
import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from './api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
type Step = { stepIndex: number; name: string; description?: string | null; tools?: string | null; inputs?: string | null; outputs?: string | null; acceptance?: string | null; required: boolean; needsQc: boolean; isPackaging: boolean }
export default function ProcessEditor({ open, onOpenChange, productId, revisionId, current }: { open: boolean; onOpenChange: (v: boolean) => void; productId: string; revisionId: string; current: Step[] }) {
  const qc = useQueryClient(); const [steps, setSteps] = React.useState<Step[]>([]); const [error, setError] = React.useState(''); const wasOpen = React.useRef(false)
  React.useEffect(() => { if (open && !wasOpen.current) { setSteps(current.map(s => ({ stepIndex:s.stepIndex,name:s.name,description:s.description,tools:s.tools,inputs:s.inputs,outputs:s.outputs,acceptance:s.acceptance,required:s.required,needsQc:s.needsQc,isPackaging:s.isPackaging }))); setError('') }; wasOpen.current = open }, [open,current])
  const mutation=useMutation({ mutationFn:()=>apiPost(`/api/products/${productId}`, {action:'save-process-template',productRevisionId:revisionId,steps:steps.map((s,i)=>({...s,stepIndex:i+1}))}), onSuccess:()=>{qc.invalidateQueries({queryKey:['product',productId]});onOpenChange(false)},onError:e=>setError((e as Error).message) })
  function update(i:number,patch:Partial<Step>){setSteps(s=>s.map((v,j)=>j===i?{...v,...patch}:v))}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>مراحل تولید محصول</DialogTitle></DialogHeader><p className="text-xs">مراحل هنگام ثبت سفارش کپی می‌شوند؛ سفارش قبلی تغییر نمی‌کند. یک مرحله بسته‌بندی تعریف کنید.</p>
    {steps.map((s,i)=><div key={i} className="border rounded p-2 space-y-2"><Input aria-label={`نام مرحله ${i+1}`} value={s.name} onChange={e=>update(i,{name:e.target.value})} /><Input placeholder="معیار پذیرش" value={s.acceptance??''} onChange={e=>update(i,{acceptance:e.target.value})} /><div className="flex gap-2">{(['required','needsQc','isPackaging'] as const).map(k=><label key={k}><input type="checkbox" checked={s[k]} onChange={e=>update(i,{[k]:e.target.checked})} />{({required:'اجباری',needsQc:'نیازمند QC',isPackaging:'بسته‌بندی'})[k]}</label>)}<Button variant="ghost" onClick={()=>setSteps(v=>v.filter((_,j)=>j!==i))}>حذف</Button></div></div>)}
    <Button variant="outline" disabled={steps.length>=50} onClick={()=>setSteps(s=>[...s,{stepIndex:s.length+1,name:'',required:true,needsQc:false,isPackaging:false}])}>افزودن مرحله</Button>
    {error&&<p role="alert" className="text-rose-700">{error}</p>}<Button disabled={mutation.isPending||!steps.length||steps.some(s=>!s.name.trim())} onClick={()=>mutation.mutate()}>ذخیره مراحل</Button>
  </DialogContent></Dialog>
}
