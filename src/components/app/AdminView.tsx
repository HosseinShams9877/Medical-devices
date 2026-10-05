'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiUpload } from './api'
import { useApp } from './store'
import { PageHeader, DataTable, Section, DateCell, StatusBadge, SearchBox, KpiCard, RelDate, Field, InfoGrid } from './ui-bits'
import { DOC_TYPES, ENTITY_TYPES, AUDIT_ACTIONS, AUDIT_ACTION_GROUPS } from '@/lib/labels'
import { ROLE_LABELS } from '@/lib/rbac'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Users, FileSearch, FileUp, DatabaseBackup, Plus, Download, FileText, ShieldCheck, LifeBuoy, ScrollText, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { faInt } from '@/lib/jalali'
import ExcelTab from './ExcelTab'

export default function AdminView() {
  const { can } = useApp()
  const [tab, setTab] = React.useState('audit')

  return (
    <div className="space-y-4">
      <PageHeader
        title="مدیریت سامانه"
        desc="Audit Trail تغییرناپذیر، مدیریت کاربران و نقش‌ها، مستندات کنترل‌شده، ورود/خروج اکسل و پشتیبان‌گیری"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          {can('audit.view') && <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="w-3.5 h-3.5" aria-hidden="true" /> Audit Trail</TabsTrigger>}
          {can('users.manage') && <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" aria-hidden="true" /> کاربران و نقش‌ها</TabsTrigger>}
          {can('documents.view') && <TabsTrigger value="documents" className="gap-1.5"><FileText className="w-3.5 h-3.5" aria-hidden="true" /> مستندات</TabsTrigger>}
          {(can('excel.import') || can('excel.export')) && <TabsTrigger value="excel" className="gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" /> ورود/خروج اکسل</TabsTrigger>}
          {can('system.backup') && <TabsTrigger value="backup" className="gap-1.5"><DatabaseBackup className="w-3.5 h-3.5" aria-hidden="true" /> پشتیبان‌گیری</TabsTrigger>}
        </TabsList>
        {can('audit.view') && <TabsContent value="audit" className="mt-3"><AuditTab /></TabsContent>}
        {can('users.manage') && <TabsContent value="users" className="mt-3"><UsersTab /></TabsContent>}
        {can('documents.view') && <TabsContent value="documents" className="mt-3"><DocumentsTab /></TabsContent>}
        {(can('excel.import') || can('excel.export')) && <TabsContent value="excel" className="mt-3"><ExcelTab /></TabsContent>}
        {can('system.backup') && <TabsContent value="backup" className="mt-3"><BackupTab /></TabsContent>}
      </Tabs>
    </div>
  )
}

// ═══ Audit Trail ═══
const DAY_FILTERS: { value: string; label: string }[] = [
  { value: '0', label: 'همه' },
  { value: '1', label: 'امروز' },
  { value: '7', label: '۷ روز' },
  { value: '30', label: '۳۰ روز' },
  { value: '90', label: '۹۰ روز' },
]

function AuditTab() {
  const { can } = useApp()
  const [q, setQ] = React.useState('')
  const [action, setAction] = React.useState('ALL')
  const [days, setDays] = React.useState('0')
  const { data, isLoading } = useQuery({
    queryKey: ['audit', q, action, days],
    queryFn: () => apiGet<{ logs: { id: string; username: string | null; role: string | null; action: string; entityType: string | null; entityCode: string | null; oldValues: string | null; newValues: string | null; ip: string | null; createdAt: string }[] }>(`/api/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(action !== 'ALL' ? { action } : {}), ...(days !== '0' ? { days } : {}) }).toString()}`),
  })

  const logs = data?.logs ?? []
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="رکورد‌های ممیزی (نمایش)" value={logs.length} tone="info" icon={<FileSearch className="w-5 h-5" />} />
        <KpiCard label="رویداد‌های امنیتی" value={logs.filter((l) => l.action.startsWith('SEC') || l.action === 'SECURITY').length} tone="danger" icon={<ShieldCheck className="w-5 h-5" />} />
        <KpiCard label="تغییرات وضعیت" value={logs.filter((l) => l.action.includes('TRANSITION')).length} tone="warning" />
        <KpiCard label="آزادسازی‌ها" value={logs.filter((l) => l.action === 'PRODUCT_RELEASE').length} tone="success" />
      </div>
      <Section title="Audit Trail — فقط‌افزوده (Append-Only)" desc="این گزارش فقط قابل مشاهده است؛ هیچ API برای حذف یا ویرایش وجود ندارد" icon={<ScrollText className="w-4 h-4" />}
        actions={can('excel.export') ? (
          <Button size="sm" onClick={() => window.open('/api/excel/export?type=audit', '_blank')} className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-md shadow-teal-600/25 gap-1.5">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> خروج اکسل گزارش ممیزی
          </Button>
        ) : undefined}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <SearchBox value={q} onChange={setQ} placeholder="کاربر، کد رکورد یا اقدام…" className="w-64" />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56"><SelectValue placeholder="نوع اقدام" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همهٔ اقدام‌ها</SelectItem>
              {AUDIT_ACTION_GROUPS.map((g) => (
                <SelectGroup key={g.title}>
                  <SelectLabel className="text-[11px] font-semibold text-teal-700">{g.title}</SelectLabel>
                  {Object.entries(g.actions).map(([code, label]) => (
                    <SelectItem key={code} value={code}>{label} <span className="text-[10px] text-muted-foreground mr-1">{code}</span></SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            {DAY_FILTERS.map((d) => (
              <button key={d.value} onClick={() => setDays(d.value)}
                className={cn('rounded-md px-2.5 py-1 text-xs transition-colors', days === d.value ? 'bg-teal-600 text-white font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'time', header: 'زمان', render: (l: typeof logs[number]) => <DateCell date={l.createdAt} withTime /> },
            { key: 'user', header: 'کاربر', render: (l: typeof logs[number]) => (
              <div>
                <div className="text-[13px] font-medium">{l.username ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">{l.role ? ROLE_LABELS[l.role as keyof typeof ROLE_LABELS] : 'سیستم'}</div>
              </div>
            ) },
            { key: 'action', header: 'اقدام', render: (l: typeof logs[number]) => <span className="text-[13px]">{AUDIT_ACTIONS[l.action] ?? l.action}</span> },
            { key: 'entity', header: 'رکورد', render: (l: typeof logs[number]) => (
              <span className="text-xs tnum">{l.entityCode ?? (l.entityType ? ENTITY_TYPES[l.entityType] ?? l.entityType : '—')}</span>
            ) },
            { key: 'changes', header: 'مقدار قبلی ← جدید', hideOnMobile: true, render: (l: typeof logs[number]) => {
              if (!l.oldValues && !l.newValues) return <span className="text-muted-foreground text-xs">—</span>
              return (
                <span className="text-[11px] text-muted-foreground tnum line-clamp-2 max-w-96" dir="rtl">
                  {l.oldValues ? `${l.oldValues.replace(/[{}"]/g, '').slice(0, 60)} ← ` : ''}
                  {l.newValues ? l.newValues.replace(/[{}"]/g, '').slice(0, 80) : ''}
                </span>
              )
            } },
            { key: 'ip', header: 'IP', hideOnMobile: true, render: (l: typeof logs[number]) => <span className="text-[11px] text-muted-foreground tnum">{l.ip ?? '—'}</span> },
          ]}
          rows={logs}
          loading={isLoading}
          empty="رکوردی یافت نشد"
          maxHeight="max-h-[60vh]"
        />
      </Section>
    </>
  )
}

// ═══ کاربران ═══
function UsersTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editFor, setEditFor] = React.useState<{ id: string; username: string; fullName: string; role: string; status: string; phone: string | null } | null>(null)
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => apiGet<{ users: { id: string; username: string; fullName: string; role: string; status: string; phone: string | null; lastLoginAt: string | null; createdAt: string }[]; roles: { value: string; label: string; permissions: number }[]; activeSessions: number }>('/api/users') })

  const toggleStatus = useMutation({
    mutationFn: (u: { id: string; status: string }) => apiPost('/api/users', { action: 'update', id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: () => { toast({ title: 'وضعیت کاربر تغییر کرد', description: 'نشست‌های فعال وی بسته شد.' }); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 stagger">
        <KpiCard label="کاربران" value={data?.users.length ?? 0} tone="info" icon={<Users className="w-5 h-5" />} />
        <KpiCard label="فعال" value={data?.users.filter((u) => u.status === 'ACTIVE').length ?? 0} tone="success" />
        <KpiCard label="غیرفعال" value={data?.users.filter((u) => u.status !== 'ACTIVE').length ?? 0} tone="muted" />
        <KpiCard label="نشست‌های فعال" value={data?.activeSessions ?? 0} tone="warning" />
      </div>

      <Section title="کاربران و نقش‌ها" desc="تغییر نقش یا وضعیت با ثبت Audit — غیرفعال‌سازی، نشست‌ها را فوراً می‌بندد" icon={<Users className="w-4 h-4" />}
        actions={<Button size="sm" className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-md shadow-teal-600/25" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 ml-1" /> کاربر جدید</Button>}>
        <DataTable
          columns={[
            { key: 'username', header: 'نام کاربری', render: (u: { username: string; fullName: string }) => (
              <div><span className="font-mono text-[13px] tnum">{u.username}</span><div className="text-[11px] text-muted-foreground">{u.fullName}</div></div>
            ) },
            { key: 'role', header: 'نقش', render: (u: { role: string }) => <span className="text-xs">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</span> },
            { key: 'status', header: 'وضعیت', render: (u: { status: string }) => (
              <StatusBadge map={{ ACTIVE: { label: 'فعال', tone: 'success' }, DISABLED: { label: 'غیرفعال', tone: 'muted' } }} value={u.status} />
            ) },
            { key: 'last', header: 'آخرین ورود', hideOnMobile: true, render: (u: { lastLoginAt: string | null }) => <RelDate date={u.lastLoginAt} /> },
            { key: 'actions', header: 'اقدام', render: (u: { id: string; status: string }) => (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditFor(u as never)}>ویرایش</Button>
                <Button size="sm" variant={u.status === 'ACTIVE' ? 'destructive' : 'default'} onClick={() => toggleStatus.mutate(u)}>{u.status === 'ACTIVE' ? 'غیرفعال' : 'فعال'}</Button>
              </div>
            ) },
          ]}
          rows={data?.users ?? []}
          empty="کاربری ثبت نشده"
        />

        <div className="mt-4 pt-4 border-t">
          <div className="text-sm font-medium mb-2">نقش‌ها و شمار مجوز‌ها (ماتریس کامل در مستندات معماری)</div>
          <div className="flex flex-wrap gap-2">
            {(data?.roles ?? []).map((r) => (
              <span key={r.value} className="text-xs rounded-lg border bg-muted/50 px-2.5 py-1.5">
                {r.label} <span className="text-muted-foreground tnum">({faInt(r.permissions)} مجوز)</span>
              </span>
            ))}
          </div>
        </div>
      </Section>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editFor && <EditUserDialog user={editFor} onClose={() => setEditFor(null)} />}
    </>
  )
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => apiGet<{ roles: { value: string; label: string }[] }>('/api/users'), enabled: open })
  const [form, setForm] = React.useState({ username: '', fullName: '', role: 'OPERATOR', password: '', phone: '' })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/users', { action: 'create', ...form, phone: form.phone || undefined }),
    onSuccess: () => { toast({ title: 'کاربر ایجاد شد' }); qc.invalidateQueries({ queryKey: ['users'] }); onOpenChange(false); setError('') },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>کاربر جدید</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>نام کاربری *</Label><Input value={form.username} onChange={(e) => set('username', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5">
            <Label>نقش *</Label>
            <Select value={form.role} onValueChange={(v) => set('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(data?.roles ?? []).map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2"><Label>نام و نام خانوادگی *</Label><Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>رمز عبور *</Label><Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5"><Label>تلفن</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="col-span-2 text-[11px] text-muted-foreground">رمز عبور حداقل ۸ نویسه — با scrypt هش می‌شود.</div>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.username || !form.fullName || form.password.length < 8}>{mutation.isPending ? '…' : 'ایجاد کاربر'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({ user, onClose }: { user: { id: string; username: string; fullName: string; role: string; status: string; phone: string | null }; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => apiGet<{ roles: { value: string; label: string }[] }>('/api/users') })
  const [form, setForm] = React.useState({ fullName: user.fullName, role: user.role, phone: user.phone ?? '', password: '' })
  const [error, setError] = React.useState('')
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/users', { action: 'update', id: user.id, ...form, phone: form.phone || undefined, ...(form.password ? { password: form.password } : {}) }),
    onSuccess: () => { toast({ title: 'کاربر به‌روزرسانی شد' }); qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (e) => setError(e instanceof Error ? e.message : 'خطا'),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>ویرایش کاربر {user.username}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2"><Label>نام کامل</Label><Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>نقش</Label>
            <Select value={form.role} onValueChange={(v) => set('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(data?.roles ?? []).map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>تلفن</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} dir="ltr" className="text-left" /></div>
          <div className="space-y-1.5 col-span-2"><Label>رمز عبور جدید (اختیاری)</Label><Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} dir="ltr" className="text-left" /></div>
          {error && <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══ مستندات ═══
function DocumentsTab() {
  const { can } = useApp()
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['documents', q],
    queryFn: () => apiGet<{ documents: { id: string; name: string; docType: string; entityType: string | null; entityCode: string | null; revision: number; status: string; origName: string | null; sizeBytes: number | null; uploadedAt: string; uploader: { fullName: string; role: string } }[] }>(`/api/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  })

  const upload = useMutation({
    mutationFn: (form: FormData) => apiUpload('/api/documents', form),
    onSuccess: () => { toast({ title: 'سند بارگذاری شد', description: 'با شماره نسخه ۱ ثبت شد؛ بازنویسی مستلزم نسخه جدید است.' }); qc.invalidateQueries({ queryKey: ['documents'] }) },
  })

  const [name, setName] = React.useState('')
  const [docType, setDocType] = React.useState('QC_REPORT')
  const [file, setFile] = React.useState<File | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  return (
    <Section title="مستندات کنترل‌شده" desc="بازنویسی فایل‌های کنترل‌شده ممنوع است — هر تغییر، نسخهٔ جدیدی ایجاد می‌کند" icon={<FileText className="w-4 h-4" />}>
      {can('documents.upload') && (
        <div className="flex flex-wrap gap-2 items-end mb-4 pb-4 border-b">
          <div className="space-y-1.5 flex-1 min-w-48"><Label>نام سند *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="w-4 h-4 ml-1" /> {file ? file.name.slice(0, 25) : 'انتخاب فایل'}</Button>
          <Button
            onClick={() => {
              if (!name || !file) { toast({ title: 'نام سند و فایل الزامی است', variant: 'destructive' }); return }
              const form = new FormData()
              form.append('file', file); form.append('name', name); form.append('docType', docType)
              upload.mutate(form)
            }}
            disabled={upload.isPending}
          >
            {upload.isPending ? '…' : 'بارگذاری'}
          </Button>
        </div>
      )}
      <div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="نام سند یا کد رکورد…" className="w-64" /></div>
      <DataTable
        columns={[
          { key: 'name', header: 'سند', render: (d: { name: string; docType: string }) => (
            <div><div className="text-[13px] font-medium">{d.name}</div><div className="text-[11px] text-muted-foreground">{DOC_TYPES[d.docType] ?? d.docType}</div></div>
          ) },
          { key: 'entity', header: 'رکورد مرتبط', render: (d: { entityCode: string | null; entityType: string | null }) => (
            <span className="text-xs tnum">{d.entityCode ?? (d.entityType ? ENTITY_TYPES[d.entityType] : '—')}</span>
          ) },
          { key: 'rev', header: 'نسخه', render: (d: { revision: number; status: string }) => (
            <div className="flex items-center gap-1.5">
              <span className="tnum text-[13px]">v{faInt(d.revision)}</span>
              {d.status === 'SUPERSEDED' && <span className="text-[10px] text-amber-700 border border-amber-200 rounded px-1">بازنشسته</span>}
            </div>
          ) },
          { key: 'file', header: 'فایل', render: (d: { id: string; origName: string | null; sizeBytes: number | null }) => (
            d.sizeBytes ? (
              <a className="text-xs text-teal-700 hover:underline flex items-center gap-1" href={`/api/documents/${d.id}?file=1`} target="_blank" rel="noreferrer">
                <Download className="w-3 h-3" /> {faInt(Math.round((d.sizeBytes ?? 0) / 1024))}KB
              </a>
            ) : <span className="text-xs text-muted-foreground">فقط اطلاعات</span>
          ) },
          { key: 'by', header: 'بارگذاری‌کننده', hideOnMobile: true, render: (d: { uploader: { fullName: string } }) => <span className="text-xs">{d.uploader?.fullName}</span> },
          { key: 'at', header: 'زمان', render: (d: { uploadedAt: string }) => <RelDate date={d.uploadedAt} /> },
        ]}
        rows={data?.documents ?? []}
        loading={isLoading}
        empty="سندی ثبت نشده است"
      />
    </Section>
  )
}

// ═══ پشتیبان‌گیری ═══
function BackupTab() {
  const qc = useQueryClient()
  const { data, refetch } = useQuery({ queryKey: ['backups'], queryFn: () => apiGet<{ backups: { name: string; size: number; createdAt: string }[] }>('/api/admin/backup') })

  const create = useMutation({
    mutationFn: () => apiPost('/api/admin/backup', {}),
    onSuccess: () => { toast({ title: 'پشتیبان ایجاد شد', description: 'فایل در مسیر backups سرور ذخیره شد.' }); refetch(); qc.invalidateQueries({ queryKey: ['audit'] }) },
  })

  return (
    <div className="space-y-4">
      <Section
        title="پشتیبان‌گیری از دیتابیس"
        desc="Snapshot فوری از SQLite با ثبت Audit — سیاست نگهداری: حداکثر ۳۰ نسخه"
        icon={<DatabaseBackup className="w-4 h-4" />}
        actions={<Button className="bg-gradient-to-l from-teal-700 to-teal-600 hover:from-teal-800 hover:to-teal-700 shadow-lg shadow-teal-600/25" onClick={() => create.mutate()} disabled={create.isPending}><DatabaseBackup className="w-4 h-4 ml-1" /> {create.isPending ? 'در حال پشتیبان‌گیری…' : 'ایجاد پشتیبان'}</Button>}
      >
        <DataTable
          columns={[
            { key: 'name', header: 'فایل', render: (b: { name: string }) => <span className="font-mono text-[13px] tnum">{b.name}</span> },
            { key: 'size', header: 'حجم', render: (b: { size: number }) => <span className="tnum text-xs">{faInt(Math.round(b.size / 1024))} کیلوبایت</span> },
            { key: 'at', header: 'زمان', render: (b: { createdAt: string }) => <DateCell date={b.createdAt} withTime /> },
            { key: 'dl', header: 'دانلود', render: (b: { name: string }) => (
              <a className="text-xs text-teal-700 hover:underline flex items-center gap-1" href={`/api/admin/backup?name=${encodeURIComponent(b.name)}&download=1`} target="_blank" rel="noreferrer">
                <Download className="w-3 h-3" /> دریافت
              </a>
            ) },
          ]}
          rows={data?.backups ?? []}
          empty="پشتیبانی ایجاد نشده است"
        />
      </Section>

      <Section title="رویهٔ بازیابی (Restore Procedure)" desc="مستند عملیاتی — بازیابی نیازمند دسترسی سرور است" icon={<LifeBuoy className="w-4 h-4" />}>
        <div className="space-y-2.5 text-sm leading-relaxed">
          <div className={cn('rounded-lg border p-3 bg-amber-50/50 border-amber-200')}>
            <b>۱.</b> سرویس برنامه را متوقف کنید تا نوشتن روی دیتابیس قطع شود.
          </div>
          <div className={cn('rounded-lg border p-3 bg-amber-50/50 border-amber-200')}>
            <b>۲.</b> فایل پشتیبان موردنظر را دانلود کرده و در مسیر <span className="font-mono text-xs">db/custom.db</span> جایگزین کنید (نسخه فعلی را پیش از جایگزینی نگه دارید).
          </div>
          <div className={cn('rounded-lg border p-3 bg-amber-50/50 border-amber-200')}>
            <b>۳.</b> سرویس را راه‌اندازی مجدد کنید و صحت داده‌ها را با داشبورد و Audit Trail بررسی کنید.
          </div>
          <div className={cn('rounded-lg border p-3 bg-rose-50/50 border-rose-200')}>
            <b>۴.</b> اقدام بازیابی را در Audit Trail ثبت کنید (رکورد دستی توسط مدیر سیستم) — بازیابی یک رویداد کنترل‌شده است.
          </div>
          <div className="text-xs text-muted-foreground">توصیه: تست دوره‌ای بازیابی هر ۳ ماه + نگهداری کپی خارج از سرور (Offline Copy).</div>
        </div>
      </Section>
    </div>
  )
}
