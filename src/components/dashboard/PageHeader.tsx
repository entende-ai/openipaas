/**
 * The top of every console page.
 *
 * It existed five times, written slightly differently each time: h2 on four
 * pages and h1 on the fifth, bold against semibold, a description at body size
 * on some and small on others. Nobody decided that; it drifted. One component
 * means the next page cannot drift again.
 *
 * The title is an h1 because it is the page's only heading of its rank. The
 * previous h2s left every dashboard page without an h1 at all, which is what a
 * screen reader announces first.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  /** One sentence on what this page is for. Kept narrow enough to read. */
  description?: string
  /** The page's primary action, right-aligned on wide screens. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>

      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
