import { NextRequest, NextResponse } from 'next/server'
import { deliverPending } from '@/lib/webhooks'
import { safeEqual } from '@/lib/crypto'

/**
 * Drains the webhook delivery queue. Meant to be hit by a scheduler
 * (cron, Vercel Cron, Kubernetes job) rather than by customers.
 */
export async function POST(req: NextRequest) {
  const expected = (process.env.INTERNAL_JOB_SECRET || '').trim()
  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_JOB_SECRET is not configured' }, { status: 503 })
  }

  const presented = req.headers.get('X-Internal-Job-Secret') ?? ''
  if (!safeEqual(presented, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await deliverPending()
  return NextResponse.json(result)
}
