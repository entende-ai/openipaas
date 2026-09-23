import prisma from './prisma';

export interface RequestLogEntry {
  requestId: string;
  clientId?: string | null;
  linkedAccountId?: string | null;
  provider?: string | null;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  errorCode?: string | null;
}

/**
 * Records one unified API call.
 *
 * Deliberately fire-and-forget: observability must never turn into a failure
 * mode for the request it is observing, so a logging error is swallowed after
 * being printed.
 */
export function recordRequest(entry: RequestLogEntry): void {
  prisma.requestLog
    .create({
      data: {
        requestId: entry.requestId,
        clientId: entry.clientId ?? null,
        linkedAccountId: entry.linkedAccountId ?? null,
        provider: entry.provider ?? null,
        method: entry.method,
        // Query strings can carry filters we do not want to retain.
        path: entry.path.split('?')[0].slice(0, 500),
        status: entry.status,
        latencyMs: entry.latencyMs,
        errorCode: entry.errorCode ?? null,
      },
    })
    .catch((err) => console.error('[RequestLog] could not persist entry:', err?.message));
}

export interface LogQuery {
  clientId?: string;
  limit?: number;
  status?: number;
}

export async function listRecentRequests(query: LogQuery = {}) {
  return prisma.requestLog.findMany({
    where: {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(query.limit ?? 50, 200),
    include: { client: { select: { name: true } } },
  });
}

/** Rolling counters for the dashboard header. */
export async function requestStats(sinceMs = 24 * 60 * 60 * 1000, clientId: string | null = null) {
  const since = new Date(Date.now() - sinceMs);
  // Counted over the client the console is looking at, so the number on the
  // page and the rows under it are about the same thing.
  const scope = { createdAt: { gte: since }, ...(clientId ? { clientId } : {}) };

  const [total, failed, latency] = await Promise.all([
    prisma.requestLog.count({ where: scope }),
    prisma.requestLog.count({ where: { ...scope, status: { gte: 400 } } }),
    prisma.requestLog.aggregate({ where: scope, _avg: { latencyMs: true } }),
  ]);

  return {
    total,
    failed,
    successRate: total === 0 ? 1 : (total - failed) / total,
    avgLatencyMs: Math.round(latency._avg.latencyMs ?? 0),
  };
}
