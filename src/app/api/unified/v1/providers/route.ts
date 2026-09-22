import { NextRequest, NextResponse } from 'next/server'
import { listManifests } from '@/lib/providers/core/manifests'
import type { ProviderCategory } from '@/lib/providers/core/types'

const CATEGORIES: ProviderCategory[] = ['ACCOUNTING', 'ECOMMERCE', 'CRM', 'PAYMENTS', 'FISCAL', 'HRIS']

/**
 * Public integration catalog, served straight from the manifests.
 *
 * No auth: this is the same list the marketing site and the connect UI render,
 * so the registry stays the single source of truth for what we support.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const requested = url.searchParams.get('category')?.toUpperCase()
  const category = CATEGORIES.find((c) => c === requested)
  const enabledOnly = url.searchParams.get('enabled') === 'true'

  const providers = listManifests({ category, enabledOnly }).map((m) => ({
    slug: m.slug,
    name: m.name,
    category: m.category,
    description: m.description,
    logo: m.logo,
    docsUrl: m.docsUrl,
    authType: m.auth.type,
    passthrough: m.passthrough,
    enabled: m.enabled,
    capabilities: m.capabilities,
    // Which resources can answer "what changed since", rather than a full page walk.
    incremental: m.incremental ?? [],
  }))

  return NextResponse.json({ items: providers, totalItems: providers.length })
}
