'use client'

import { toast } from '@/hooks/use-toast'

export class ApiClientError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T
  let msg = 'خطای غیرمنتظره رخ داد.'
  try {
    const body = await res.json()
    if (body?.error) msg = body.error
  } catch { /* ignore */ }
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'))
  }
  throw new ApiClientError(msg, res.status)
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  return handle<T>(res)
}

export async function apiPost<T>(url: string, body: unknown, opts?: { silent?: boolean }): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  try {
    return await handle<T>(res)
  } catch (e) {
    if (!opts?.silent && e instanceof ApiClientError && e.status !== 401) {
      toast({ title: 'خطا', description: e.message, variant: 'destructive' })
    }
    throw e
  }
}

export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: form })
  return handle<T>(res)
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
