import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { Entry } from './App'

type Range = 'week' | 'month' | 'year' | 'custom'

interface ChartPoint  { label: string; value: number }
interface GrowthPoint { label: string; weight: number }

// ── Parsers ──────────────────────────────────────────────────────
const parseSleepMinutes = (details: string): number => {
  const part = details.split(' · ').pop() ?? ''
  const h = part.match(/(\d+)h/)
  const m = part.match(/(\d+)m/)
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)
}

const parseWeightLbs = (details: string): number | null => {
  const lb = details.match(/Weight: (\d+) lb/)
  const oz = details.match(/lb (\d+) oz/)
  return lb ? +lb[1] + (oz ? +oz[1] / 16 : 0) : null
}

// ── Date helpers ─────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10)

const startOfDay = (d: Date): Date => {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c
}

const addDays = (d: Date, n: number): Date =>
  new Date(d.getTime() + n * 86400000)

const fmtLabel = (d: Date, weekly: boolean, totalDays: number): string => {
  if (!weekly && totalDays <= 7) {
    return d.toLocaleDateString('en-us', { weekday: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('en-us', { month: 'short', day: 'numeric' })
}

const generateBuckets = (start: Date, end: Date, weekly: boolean): Date[] => {
  const buckets: Date[] = []
  let cur = startOfDay(start)
  const fin = startOfDay(end)
  const step = weekly ? 7 : 1
  while (cur <= fin) {
    buckets.push(new Date(cur))
    cur = addDays(cur, step)
  }
  return buckets
}

const entriesInBucket = (
  bucket: Date, entries: Entry[], weekly: boolean
): Entry[] => {
  const bucketEnd = addDays(bucket, weekly ? 7 : 1)
  return entries.filter(e => {
    const d = new Date(e.created_at)
    return d >= bucket && d < bucketEnd
  })
}

// ── Shared Recharts config ────────────────────────────────────────
const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'rgba(125,147,178,0.18)',
  vertical: false,
} as const

const AXIS_TICK = { fontSize: 11, fill: '#6b7a90' }

const XAXIS_COMMON = {
  tick: AXIS_TICK,
  axisLine: false as const,
  tickLine: false as const,
  interval: 'preserveStartEnd' as const,
}

const YAXIS_COMMON = {
  tick: AXIS_TICK,
  axisLine: false as const,
  tickLine: false as const,
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid rgba(125,147,178,0.24)',
    borderRadius: '12px',
    padding: '8px 12px',
    fontSize: '13px',
    boxShadow: '0 18px 45px rgba(41,56,86,0.12)',
  },
  labelStyle: { color: '#6b7a90', fontSize: '11px', marginBottom: '2px' },
  itemStyle:  { color: '#132238', fontWeight: 700 },
  cursor:     { fill: 'rgba(111,124,255,0.06)' },
}

// ── Component ────────────────────────────────────────────────────
interface InsightsCardProps { entries: Entry[] }

const RANGE_LABELS: Record<Range, string> = {
  week: 'Week', month: 'Month', year: 'Year', custom: 'Custom',
}

export function InsightsCard({ entries }: InsightsCardProps) {
  const [range, setRange]             = useState<Range>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')

  const earliestDate = useMemo(() => {
    if (!entries.length) return startOfDay(new Date())
    return startOfDay(new Date(Math.min(...entries.map(e => +new Date(e.created_at)))))
  }, [entries])

  const { rangeStart, rangeEnd } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999)
    if (range === 'custom') {
      const cs = customStart
        ? startOfDay(new Date(customStart + 'T00:00:00'))
        : earliestDate
      const ce = customEnd
        ? (() => { const d = new Date(customEnd + 'T00:00:00'); d.setHours(23, 59, 59, 999); return d })()
        : end
      return { rangeStart: cs, rangeEnd: ce }
    }
    const start = new Date()
    if (range === 'week')  start.setDate(start.getDate() - 6)
    if (range === 'month') start.setDate(start.getDate() - 29)
    if (range === 'year')  start.setFullYear(start.getFullYear() - 1)
    return { rangeStart: startOfDay(start), rangeEnd: end }
  }, [range, customStart, customEnd, earliestDate])

  const effectiveStart = useMemo(
    () => new Date(Math.max(rangeStart.getTime(), earliestDate.getTime())),
    [rangeStart, earliestDate]
  )

  const diffDays = useMemo(
    () => Math.ceil((rangeEnd.getTime() - effectiveStart.getTime()) / 86400000),
    [rangeEnd, effectiveStart]
  )

  const useWeekly = range === 'year' || (range === 'custom' && diffDays > 60)

  const buckets = useMemo(
    () => generateBuckets(effectiveStart, rangeEnd, useWeekly),
    [effectiveStart, rangeEnd, useWeekly]
  )

  // ── Per-type entry slices ──────────────────────────────────────
  const feedEntries   = useMemo(() => entries.filter(e => e.type === 'Feeding'), [entries])
  const pottyEntries  = useMemo(() => entries.filter(e => e.type === 'Potty'),   [entries])
  const sleepEntries  = useMemo(() => entries.filter(e => e.type === 'Sleep'),   [entries])
  const growthEntries = useMemo(() => entries.filter(e => e.type === 'Growth'),  [entries])

  // ── Chart data ─────────────────────────────────────────────────
  const feedingData = useMemo<ChartPoint[]>(() =>
    buckets.map(b => ({
      label: fmtLabel(b, useWeekly, diffDays),
      value: entriesInBucket(b, feedEntries, useWeekly).length,
    })),
    [buckets, feedEntries, useWeekly, diffDays]
  )

  const pottyData = useMemo<ChartPoint[]>(() =>
    buckets.map(b => ({
      label: fmtLabel(b, useWeekly, diffDays),
      value: entriesInBucket(b, pottyEntries, useWeekly).length,
    })),
    [buckets, pottyEntries, useWeekly, diffDays]
  )

  const sleepData = useMemo<ChartPoint[]>(() =>
    buckets.map(b => {
      const mins = entriesInBucket(b, sleepEntries, useWeekly)
        .reduce((acc, e) => acc + parseSleepMinutes(e.details), 0)
      return {
        label: fmtLabel(b, useWeekly, diffDays),
        value: Math.round(mins / 60 * 10) / 10,
      }
    }),
    [buckets, sleepEntries, useWeekly, diffDays]
  )

  const growthData = useMemo<GrowthPoint[]>(() => {
    return growthEntries
      .filter(e => {
        const d = new Date(e.created_at)
        return d >= effectiveStart && d <= rangeEnd
      })
      .map(e => ({
        label: new Date(e.created_at).toLocaleDateString('en-us', { month: 'short', day: 'numeric' }),
        weight: parseWeightLbs(e.details) ?? 0,
      }))
      .filter(p => p.weight > 0)
  }, [growthEntries, effectiveStart, rangeEnd])

  // ── Key stats ─────────────────────────────────────────────────
  const avgFeeds = useMemo(() => {
    const active = feedingData.filter(d => d.value > 0)
    if (!active.length) return null
    const avg = active.reduce((s, d) => s + d.value, 0) / active.length
    return Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
  }, [feedingData])

  const avgPotty = useMemo(() => {
    const active = pottyData.filter(d => d.value > 0)
    if (!active.length) return null
    const avg = active.reduce((s, d) => s + d.value, 0) / active.length
    return Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
  }, [pottyData])

  const avgSleep = useMemo(() => {
    const active = sleepData.filter(d => d.value > 0)
    if (!active.length) return null
    const avg = active.reduce((s, d) => s + d.value, 0) / active.length
    return avg.toFixed(1) + 'h'
  }, [sleepData])

  const latestWeight = useMemo(() => {
    if (!growthData.length) return null
    const w = growthData[growthData.length - 1].weight
    const lbs = Math.floor(w)
    const oz  = Math.round((w - lbs) * 16)
    return oz > 0 ? `${lbs} lb ${oz} oz` : `${lbs} lb`
  }, [growthData])

  const feedEmpty  = feedingData.every(d => d.value === 0)
  const pottyEmpty = pottyData.every(d => d.value === 0)
  const sleepEmpty = sleepData.every(d => d.value === 0)

  const earliestStr = toDateStr(earliestDate)
  const todayStr    = toDateStr(new Date())

  return (
    <aside className="tracker-card insights-card">
      <div className="insights-header">
        <h2>Insights</h2>
        <div className="range-chips">
          {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
            <button
              key={r}
              className={`chip${range === r ? ' selected' : ''}`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <div className="range-custom">
          <input
            type="date"
            value={customStart}
            min={earliestStr}
            max={customEnd || todayStr}
            onChange={e => setCustomStart(e.target.value)}
          />
          <span className="range-to">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || earliestStr}
            max={todayStr}
            onChange={e => setCustomEnd(e.target.value)}
          />
        </div>
      )}

      <div className="insights-grid">

        {/* ── Feeding ── */}
        <div className="insight-panel">
          <p className="insight-panel-title">Feeding</p>
          {feedEmpty
            ? <p className="insight-empty">No feeds in this range.</p>
            : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={feedingData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...XAXIS_COMMON} />
                  <YAxis {...YAXIS_COMMON} allowDecimals={false} width={24} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v) => [`${v} feeds`, '']}
                  />
                  <Bar dataKey="value" fill="#3a7ff5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
          {!feedEmpty && avgFeeds &&
            <p className="insight-stat">Avg {avgFeeds} feeds/day</p>}
        </div>

        {/* ── Potty ── */}
        <div className="insight-panel">
          <p className="insight-panel-title">Potty</p>
          {pottyEmpty
            ? <p className="insight-empty">No potty events in this range.</p>
            : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={pottyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...XAXIS_COMMON} />
                  <YAxis {...YAXIS_COMMON} allowDecimals={false} width={24} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v) => [`${v} events`, '']}
                  />
                  <Bar dataKey="value" fill="#e8a020" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
          {!pottyEmpty && avgPotty &&
            <p className="insight-stat">Avg {avgPotty} events/day</p>}
        </div>

        {/* ── Sleep ── */}
        <div className="insight-panel">
          <p className="insight-panel-title">Sleep</p>
          {sleepEmpty
            ? <p className="insight-empty">No sleep logged in this range.</p>
            : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={sleepData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...XAXIS_COMMON} />
                  <YAxis {...YAXIS_COMMON} allowDecimals width={24} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v) => [`${v}h`, '']}
                  />
                  <Bar dataKey="value" fill="#7c55e8" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
          {!sleepEmpty && avgSleep &&
            <p className="insight-stat">Avg {avgSleep} sleep/day</p>}
        </div>

        {/* ── Growth ── */}
        <div className="insight-panel">
          <p className="insight-panel-title">Growth</p>
          {growthData.length === 0
            ? <p className="insight-empty">No growth entries in this range.</p>
            : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={growthData} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...XAXIS_COMMON} />
                  <YAxis
                    {...YAXIS_COMMON}
                    width={32}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    tickFormatter={(v: number) => `${Math.floor(v)}lb`}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v) => {
                      const n = typeof v === 'number' ? v : 0
                      const lbs = Math.floor(n)
                      const oz  = Math.round((n - lbs) * 16)
                      return [oz > 0 ? `${lbs} lb ${oz} oz` : `${lbs} lb`, '']
                    }}
                  />
                  <Line
                    dataKey="weight"
                    stroke="#2ba87e"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#2ba87e', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )
          }
          {growthData.length > 0 && latestWeight &&
            <p className="insight-stat">Latest {latestWeight}</p>}
        </div>

      </div>
    </aside>
  )
}
