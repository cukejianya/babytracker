import { useState, useMemo, useEffect, useCallback } from 'react'
import './App.css'
import type { JSX } from 'react/jsx-runtime'
import { InsightsCard } from './InsightsCard'

export type EntryType = 'Feeding' | 'Potty' | 'Sleep' | 'Growth'
type FeedType = 'Bottle' | 'Breastfeeding' | 'Formula' | 'Solid Food'
type PottyType = 'Wet' | 'Dirty' | 'Both' | 'Blowout' | 'Catch'

export interface Entry {
  id: number
  type: EntryType
  created_at: string
  details: string
  note: string
}

interface Data {
  entries: Entry[]
}

const FEED_TYPES: FeedType[] = ['Bottle', 'Breastfeeding', 'Formula', 'Solid Food']
const FEED_AMOUNTS = [2, 4, 6, 8] as const
const POTTY_TYPES: PottyType[] = ['Wet', 'Dirty', 'Both', 'Blowout', 'Catch']
const CATCH_LOCATIONS = ['Toilet', 'Potty seat', 'Sink', 'Other']

const entryTypeClassMap: Record<EntryType, string> = {
  Feeding: 'entry-badge feeding',
  Potty:   'entry-badge diaper',
  Sleep:   'entry-badge sleep',
  Growth:  'entry-badge growth',
}

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

const timeAgo = (date: Date): string => {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const h = Math.floor(diffMins / 60)
  const m = diffMins % 60
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

const formatDuration = (startMs: number, endMs: number): string => {
  const diffMins = Math.max(0, Math.floor((endMs - startMs) / 60000))
  const h = Math.floor(diffMins / 60)
  const m = diffMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

const toDatetimeLocal = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const parseSleepDetails = (details: string): { start: string; end: string } => {
  const timePart = details.split(' · ')[0]
  const [s, e] = timePart.split(' – ')
  const toHHMM = (str: string): string => {
    const t = (str || '').trim()
    const ampm = t.match(/^(\d+):(\d{2})\s*(AM|PM)$/i)
    if (ampm) {
      let h = parseInt(ampm[1])
      const m = ampm[2], per = ampm[3].toUpperCase()
      if (per === 'PM' && h !== 12) h += 12
      if (per === 'AM' && h === 12) h = 0
      return `${String(h).padStart(2, '0')}:${m}`
    }
    return /^\d{2}:\d{2}$/.test(t) ? t : ''
  }
  return { start: toHHMM(s), end: toHHMM(e) }
}

export default function BabyTrackerApp(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(true)
  const [entries, setEntries] = useState<Entry[]>([
    { id: 1, type: 'Feeding', created_at: '2026-04-16T08:50:22.540Z', details: 'Bottle · 4 oz', note: 'Finished most of it' },
    { id: 2, type: 'Potty',   created_at: (new Date()).toJSON(),         details: 'Wet',           note: '' },
    { id: 3, type: 'Sleep',   created_at: '2026-05-16T08:50:22.540Z',   details: '10:00 – 11:15 · 1h 15m', note: 'Good nap' },
  ])
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [tick, setTick] = useState(0)
  const [activeModal, setActiveModal] = useState<EntryType | null>(null)
  const [activeSleepStart, setActiveSleepStart] = useState<string | null>(
    () => localStorage.getItem('activeSleepStart')
  )

  // Feed form
  const [feedType, setFeedType]               = useState<FeedType>('Bottle')
  const [feedAmount, setFeedAmount]           = useState<number>(4)
  const [feedAmountCustom, setFeedAmountCustom] = useState<string>('')
  const [feedNote, setFeedNote]               = useState<string>('')
  const [feedShowNote, setFeedShowNote]       = useState<boolean>(false)

  // Potty form
  const [pottyType, setPottyType]           = useState<PottyType | null>(null)
  const [pottyLocation, setPottyLocation]   = useState<string>('Toilet')
  const [pottyNote, setPottyNote]           = useState<string>('')
  const [pottyShowNote, setPottyShowNote]   = useState<boolean>(false)

  // Sleep form
  const [sleepNote, setSleepNote]           = useState<string>('')
  const [sleepShowNote, setSleepShowNote]   = useState<boolean>(false)
  const [manualSleepStart, setManualSleepStart] = useState<string>('')
  const [manualSleepEnd, setManualSleepEnd]     = useState<string>('')
  const [showManualSleep, setShowManualSleep]   = useState<boolean>(false)

  // Growth form
  const [weight, setWeight]     = useState<string>('')
  const [weightOz, setWeightOz] = useState<string>('')
  const [height, setHeight]     = useState<string>('')

  // Edit state
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [editTime, setEditTime]         = useState<string>('')

  // Live timer tick (every 30s)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // API fetch
  useEffect(() => {
    if (!loading) return
    const fetchEntries = async () => {
      try {
        const response = await fetch('/api/entries')
        if (!response.ok) throw new Error(`Response status: ${response.status}`)
        const data: Data = await response.json()
        setEntries(data.entries)
      } catch (e) {
        console.error(e)
      }
    }
    fetchEntries()
    setLoading(false)
  }, [loading])

  const updateEntry = useCallback((entry: Entry): void => {
    fetch(`/api/entries/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).then(() => setLoading(true))
    setEntries(prev => prev.map(e => e.id === entry.id ? entry : e))
  }, [])

  const deleteEntry = useCallback((id: number): void => {
    fetch(`/api/entries/${id}`, { method: 'DELETE' }).then(() => setLoading(true))
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const addEntry = useCallback((
    type: EntryType,
    details: string,
    customTime?: string,
    customNote: string = ''
  ): void => {
    const newEntry: Entry = {
      id: Date.now(),
      type,
      created_at: customTime ?? new Date().toJSON(),
      details,
      note: customNote,
    }
    fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    }).then(() => setLoading(true))
    setEntries(prev => [newEntry, ...prev])
  }, [])

  const openModal = useCallback((type: EntryType) => {
    setEditingEntry(null)
    setFeedShowNote(false)
    setFeedNote('')
    setFeedAmount(4)
    setFeedAmountCustom('')
    setPottyType(null)
    setPottyShowNote(false)
    setPottyNote('')
    setSleepShowNote(false)
    setShowManualSleep(false)
    setActiveModal(type)
  }, [])

  const openEditModal = useCallback((entry: Entry): void => {
    setFeedShowNote(false); setFeedNote(''); setFeedAmount(4); setFeedAmountCustom('')
    setPottyType(null); setPottyShowNote(false); setPottyNote(''); setPottyLocation('Toilet')
    setSleepNote(''); setSleepShowNote(false); setShowManualSleep(false)
    setWeight(''); setWeightOz(''); setHeight('')

    setEditingEntry(entry)
    setEditTime(toDatetimeLocal(new Date(entry.created_at)))

    if (entry.type === 'Feeding') {
      const parts = entry.details.split(' · ')
      setFeedType(parts[0] as FeedType)
      if (parts[1]) {
        const oz = parseFloat(parts[1])
        if ((FEED_AMOUNTS as readonly number[]).includes(oz)) setFeedAmount(oz)
        else { setFeedAmount(-1); setFeedAmountCustom(String(oz)) }
      }
      if (entry.note) { setFeedNote(entry.note); setFeedShowNote(true) }
    } else if (entry.type === 'Potty') {
      const parts = entry.details.split(' · ')
      setPottyType(parts[0] as PottyType)
      if (parts[1]) setPottyLocation(parts[1])
      if (entry.note) { setPottyNote(entry.note); setPottyShowNote(true) }
    } else if (entry.type === 'Sleep') {
      const { start, end } = parseSleepDetails(entry.details)
      setManualSleepStart(start)
      setManualSleepEnd(end)
      setShowManualSleep(true)
      if (entry.note) { setSleepNote(entry.note); setSleepShowNote(true) }
    } else if (entry.type === 'Growth') {
      const wlb = entry.details.match(/Weight: (\d+) lb/)
      const woz = entry.details.match(/lb (\d+) oz/)
      const hin = entry.details.match(/Height: ([\d.]+) in/)
      if (wlb) setWeight(wlb[1])
      if (woz) setWeightOz(woz[1])
      if (hin) setHeight(hin[1])
    }

    setActiveModal(entry.type)
  }, [])

  const closeModal = useCallback(() => {
    setActiveModal(null)
    setEditingEntry(null)
    setPottyType(null)
    setShowManualSleep(false)
  }, [])

  const handleAddFeed = (): void => {
    const needsAmount = feedType === 'Bottle' || feedType === 'Formula'
    const actualAmount = feedAmount === -1 ? parseFloat(feedAmountCustom) : feedAmount
    if (needsAmount && !actualAmount) return
    const parts: string[] = [feedType]
    if (needsAmount && actualAmount) parts.push(`${actualAmount} oz`)
    const details = parts.join(' · ')
    if (editingEntry) {
      updateEntry({ ...editingEntry, details, note: feedNote.trim(), created_at: editTime ? new Date(editTime).toJSON() : editingEntry.created_at })
    } else {
      addEntry('Feeding', details, undefined, feedNote.trim())
    }
    closeModal()
  }

  const handleStartSleep = (): void => {
    const now = new Date().toJSON()
    setActiveSleepStart(now)
    localStorage.setItem('activeSleepStart', now)
    closeModal()
  }

  const handleEndSleep = useCallback((): void => {
    if (!activeSleepStart) return
    const startDate = new Date(activeSleepStart)
    const endDate = new Date()
    const fmt = (d: Date) => d.toLocaleTimeString('en-us', { hour: 'numeric', minute: '2-digit' })
    const duration = formatDuration(startDate.getTime(), endDate.getTime())
    addEntry('Sleep', `${fmt(startDate)} – ${fmt(endDate)} · ${duration}`, activeSleepStart, sleepNote.trim())
    setActiveSleepStart(null)
    localStorage.removeItem('activeSleepStart')
    setSleepNote('')
    closeModal()
  }, [activeSleepStart, sleepNote, addEntry, closeModal])

  const handleManualSleep = (): void => {
    if (!manualSleepStart || !manualSleepEnd) return
    const [sh, sm] = manualSleepStart.split(':').map(Number)
    const [eh, em] = manualSleepEnd.split(':').map(Number)
    const startDate = editingEntry && editTime ? new Date(editTime) : new Date()
    startDate.setHours(sh, sm, 0, 0)
    const endDate = new Date(startDate)
    endDate.setHours(eh, em, 0, 0)
    if (endDate <= startDate) return
    const duration = formatDuration(startDate.getTime(), endDate.getTime())
    const details = `${manualSleepStart} – ${manualSleepEnd} · ${duration}`
    if (editingEntry) {
      updateEntry({ ...editingEntry, details, note: sleepNote.trim(), created_at: startDate.toJSON() })
    } else {
      addEntry('Sleep', details, startDate.toJSON(), sleepNote.trim())
    }
    setManualSleepStart('')
    setManualSleepEnd('')
    setSleepNote('')
    closeModal()
  }

  const handleSaveMetrics = (): void => {
    if (!weight.trim() && !height.trim()) return
    const parts: string[] = []
    if (weight.trim()) {
      const ozPart = weightOz.trim() ? ` ${weightOz} oz` : ''
      parts.push(`Weight: ${weight} lb${ozPart}`)
    }
    if (height.trim()) parts.push(`Height: ${height} in`)
    const details = parts.join(' · ')
    if (editingEntry) {
      updateEntry({ ...editingEntry, details, created_at: editTime ? new Date(editTime).toJSON() : editingEntry.created_at })
    } else {
      addEntry('Growth', details)
    }
    setWeight('')
    setWeightOz('')
    setHeight('')
    closeModal()
  }

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [entries]
  )

  const lastFeedEntry  = useMemo(() => sortedEntries.find(e => e.type === 'Feeding'), [sortedEntries])
  const lastPottyEntry = useMemo(() => sortedEntries.find(e => e.type === 'Potty'),   [sortedEntries])
  const lastSleepEntry = useMemo(() => sortedEntries.find(e => e.type === 'Sleep'),   [sortedEntries])

  const sleepActiveLabel = useMemo(
    () => activeSleepStart ? formatDuration(new Date(activeSleepStart).getTime(), Date.now()) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSleepStart, tick]
  )

  const todayNaps = useMemo(() => {
    const today = new Date()
    return entries.filter(e => e.type === 'Sleep' && isSameDay(new Date(e.created_at), today)).length
  }, [entries])

  const timelineEntries = useMemo(
    () => sortedEntries.filter(e => isSameDay(new Date(e.created_at), selectedDate)),
    [sortedEntries, selectedDate]
  )

  const goToPrevDay = () =>
    setSelectedDate(d => { const p = new Date(d); p.setDate(p.getDate() - 1); return p })
  const goToNextDay = () =>
    setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n })

  const isViewingToday = isSameDay(selectedDate, new Date())
  const timelineLabel = isViewingToday
    ? "Today's timeline"
    : selectedDate.toLocaleDateString('en-us', { weekday: 'long', month: 'short', day: 'numeric' })

  const formatDateTime = (date: Date): string => {
    const P7D = 1000 * 60 * 60 * 24 * 7
    const today = new Date()
    const isToday = today.toDateString() === date.toDateString()
    const isWithinAWeek = P7D > today.valueOf() - date.valueOf()
    const time = date.toLocaleTimeString('en-us', { hour: 'numeric', minute: 'numeric' })
    const dateStr = isToday
      ? 'Today'
      : isWithinAWeek
        ? date.toLocaleDateString('en-us', { weekday: 'short' })
        : date.toLocaleDateString('en-us', { month: 'short', day: 'numeric' })
    return `${dateStr} ${time}`
  }

  const feedNeedsAmount  = feedType === 'Bottle' || feedType === 'Formula'
  const feedSaveDisabled = feedNeedsAmount && feedAmount === -1 && !feedAmountCustom.trim()

  return (
    <div className="app-shell">
      <div className="app-frame">

        {/* Header */}
        <header className="tracker-header">
          <div className="hero-kicker">Daily care dashboard</div>
          <h1>Baby Tracker</h1>
        </header>

        {/* Status Card */}
        <section className="status-card">
          <div className="status-item">
            <span className="status-label">Last fed</span>
            <span className="status-value">
              {lastFeedEntry ? timeAgo(new Date(lastFeedEntry.created_at)) : 'No feeds yet'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Last potty</span>
            <span className="status-value">
              {lastPottyEntry ? timeAgo(new Date(lastPottyEntry.created_at)) : 'No entries yet'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Sleep</span>
            <span className={`status-value${activeSleepStart ? ' status-sleeping' : ''}`}>
              {activeSleepStart
                ? `Sleeping · ${sleepActiveLabel}`
                : lastSleepEntry
                  ? `Last: ${timeAgo(new Date(lastSleepEntry.created_at))}`
                  : 'No sleep logged'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Naps today</span>
            <span className="status-value">{todayNaps}</span>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="quick-actions">
          <button className="quick-action-btn quick-action-feed" onClick={() => openModal('Feeding')}>
            Feed
          </button>
          <button className="quick-action-btn quick-action-potty" onClick={() => openModal('Potty')}>
            Potty
          </button>
          <button
            className={`quick-action-btn quick-action-sleep${activeSleepStart ? ' is-active' : ''}`}
            onClick={() => openModal('Sleep')}
          >
            {activeSleepStart ? 'Sleeping' : 'Sleep'}
          </button>
          <button className="quick-action-btn quick-action-growth" onClick={() => openModal('Growth')}>
            Growth
          </button>
        </section>

        {/* Active sleep bar */}
        {activeSleepStart && (
          <section className="sleep-active-bar">
            <div className="sleep-active-info">
              <div className="sleep-dot" />
              <div>
                <div className="sleep-active-label">Baby is sleeping</div>
                <div className="sleep-active-duration">{sleepActiveLabel}</div>
              </div>
            </div>
            <button className="end-sleep-btn" onClick={handleEndSleep}>End sleep</button>
          </section>
        )}

        {/* Timeline */}
        <aside className="tracker-card timeline-card">
          <div className="timeline-header">
            <div>
              <h2>{timelineLabel}</h2>
              <p className="timeline-subtitle">A quick view of the day so far.</p>
            </div>
            <div className="timeline-nav">
              <button onClick={goToPrevDay} className="nav-button" aria-label="Previous day">‹</button>
              <span className="counter">{timelineEntries.length} entries</span>
              <button onClick={goToNextDay} className="nav-button" disabled={isViewingToday} aria-label="Next day">›</button>
            </div>
          </div>

          <div className="ticks" />

          <div className="timeline-list">
            {timelineEntries.length === 0
              ? <p className="timeline-empty">No entries for this day.</p>
              : timelineEntries.map(entry => (
                <article key={entry.id} className="timeline-item">
                  <div className="timeline-topline">
                    <span className={entryTypeClassMap[entry.type]}>{entry.type}</span>
                    <span className="timeline-time">{formatDateTime(new Date(entry.created_at))}</span>
                  </div>
                  <div className="timeline-details">{entry.details}</div>
                  {entry.note ? <div className="timeline-note">{entry.note}</div> : null}
                  <div className="timeline-actions">
                    <button className="timeline-action-btn timeline-action-edit" onClick={() => openEditModal(entry)} aria-label="Edit entry">✎</button>
                    <button className="timeline-action-btn timeline-action-delete" onClick={() => deleteEntry(entry.id)} aria-label="Delete entry">✕</button>
                  </div>
                </article>
              ))
            }
          </div>
        </aside>

        <InsightsCard entries={entries} />

        {/* Modal */}
        {activeModal !== null && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {activeModal === 'Feeding' && (editingEntry ? 'Edit feeding' : 'Log feeding')}
                  {activeModal === 'Potty'   && (editingEntry ? 'Edit potty'   : 'Log potty')}
                  {activeModal === 'Sleep'   && (activeSleepStart ? 'Sleep timer' : editingEntry ? 'Edit sleep' : 'Log sleep')}
                  {activeModal === 'Growth'  && (editingEntry ? 'Edit growth'  : 'Log growth')}
                </h2>
                <button className="modal-close" onClick={closeModal} aria-label="Close">✕</button>
              </div>

              {/* ── Feed modal ── */}
              {activeModal === 'Feeding' && (
                <div className="modal-body">
                  {editingEntry && (
                    <label className="field edit-time-field">
                      <span>Time</span>
                      <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} />
                    </label>
                  )}
                  <span className="chip-label">Type</span>
                  <div className="chip-group">
                    {FEED_TYPES.map(t => (
                      <button
                        key={t}
                        className={`chip${feedType === t ? ' selected' : ''}`}
                        onClick={() => { setFeedType(t); setFeedAmount(4); setFeedAmountCustom('') }}
                      >{t}</button>
                    ))}
                  </div>

                  {feedNeedsAmount && (
                    <>
                      <span className="chip-label">Amount</span>
                      <div className="chip-group amount-chips">
                        {FEED_AMOUNTS.map(oz => (
                          <button
                            key={oz}
                            className={`chip${feedAmount === oz ? ' selected' : ''}`}
                            onClick={() => { setFeedAmount(oz); setFeedAmountCustom('') }}
                          >{oz} oz</button>
                        ))}
                        <button
                          className={`chip${feedAmount === -1 ? ' selected' : ''}`}
                          onClick={() => setFeedAmount(-1)}
                        >Custom</button>
                      </div>
                      {feedAmount === -1 && (
                        <input
                          className="modal-input"
                          type="number"
                          placeholder="Amount (oz)"
                          value={feedAmountCustom}
                          onChange={e => setFeedAmountCustom(e.target.value)}
                          min="0"
                          step="0.5"
                        />
                      )}
                    </>
                  )}

                  {feedShowNote
                    ? <input
                        className="modal-input"
                        placeholder="Add a note..."
                        value={feedNote}
                        onChange={e => setFeedNote(e.target.value)}
                      />
                    : <button className="expand-toggle" onClick={() => setFeedShowNote(true)}>
                        Add note
                      </button>
                  }

                  <button
                    className="action-button modal-save"
                    onClick={handleAddFeed}
                    disabled={feedSaveDisabled}
                  >
                    {editingEntry ? 'Update feeding' : 'Save feeding'}
                  </button>
                </div>
              )}

              {/* ── Potty modal ── */}
              {activeModal === 'Potty' && (
                <div className="modal-body">
                  {editingEntry && (
                    <label className="field edit-time-field">
                      <span>Time</span>
                      <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} />
                    </label>
                  )}
                  <span className="chip-label">What happened?</span>
                  <div className="chip-group potty-chips">
                    {POTTY_TYPES.map(t => (
                      <button
                        key={t}
                        className={`chip${pottyType === t ? ' selected' : ''}`}
                        onClick={() => {
                          setPottyType(t)
                          if (t !== 'Catch' && !editingEntry) {
                            addEntry('Potty', t)
                            closeModal()
                          }
                        }}
                      >{t}</button>
                    ))}
                  </div>

                  {pottyType === 'Catch' && (
                    <>
                      <span className="chip-label">Where?</span>
                      <div className="chip-group">
                        {CATCH_LOCATIONS.map(loc => (
                          <button
                            key={loc}
                            className={`chip${pottyLocation === loc ? ' selected' : ''}`}
                            onClick={() => setPottyLocation(loc)}
                          >{loc}</button>
                        ))}
                      </div>

                      {pottyShowNote
                        ? <input
                            className="modal-input"
                            placeholder="Add a note..."
                            value={pottyNote}
                            onChange={e => setPottyNote(e.target.value)}
                          />
                        : <button className="expand-toggle" onClick={() => setPottyShowNote(true)}>
                            Add note
                          </button>
                      }

                      <button
                        className="action-button modal-save"
                        onClick={() => {
                          const details = `Catch · ${pottyLocation}`
                          if (editingEntry) {
                            updateEntry({ ...editingEntry, details, note: pottyNote.trim(), created_at: editTime ? new Date(editTime).toJSON() : editingEntry.created_at })
                          } else {
                            addEntry('Potty', details, undefined, pottyNote.trim())
                          }
                          closeModal()
                        }}
                      >
                        {editingEntry ? 'Update catch' : 'Save catch'}
                      </button>
                    </>
                  )}

                  {editingEntry && pottyType && pottyType !== 'Catch' && (
                    <button
                      className="action-button modal-save"
                      onClick={() => {
                        updateEntry({ ...editingEntry, details: pottyType, note: '', created_at: editTime ? new Date(editTime).toJSON() : editingEntry.created_at })
                        closeModal()
                      }}
                    >
                      Update potty
                    </button>
                  )}
                </div>
              )}

              {/* ── Sleep modal ── */}
              {activeModal === 'Sleep' && (
                <div className="modal-body">
                  {!activeSleepStart && editingEntry && (
                    <label className="field edit-time-field">
                      <span>Date</span>
                      <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} />
                    </label>
                  )}
                  {activeSleepStart ? (
                    <>
                      <div className="sleep-modal-timer">
                        <span className="sleep-modal-label">Sleeping for</span>
                        <span className="sleep-modal-duration">{sleepActiveLabel}</span>
                      </div>

                      {sleepShowNote
                        ? <input
                            className="modal-input"
                            placeholder="Add a note..."
                            value={sleepNote}
                            onChange={e => setSleepNote(e.target.value)}
                          />
                        : <button className="expand-toggle" onClick={() => setSleepShowNote(true)}>
                            Add note
                          </button>
                      }

                      <button className="action-button modal-save sleep-end-btn" onClick={handleEndSleep}>
                        End sleep
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="action-button modal-save" onClick={handleStartSleep}>
                        Start sleep now
                      </button>

                      <button
                        className="expand-toggle"
                        onClick={() => setShowManualSleep(v => !v)}
                        style={{ marginTop: '12px', display: 'block' }}
                      >
                        {showManualSleep ? 'Hide manual entry' : 'Enter times manually'}
                      </button>

                      {showManualSleep && (
                        <div style={{ marginTop: '16px' }}>
                          <div className="form-grid two-up">
                            <label className="field">
                              <span>Start</span>
                              <input
                                type="time"
                                value={manualSleepStart}
                                onChange={e => setManualSleepStart(e.target.value)}
                              />
                            </label>
                            <label className="field">
                              <span>End</span>
                              <input
                                type="time"
                                value={manualSleepEnd}
                                onChange={e => setManualSleepEnd(e.target.value)}
                              />
                            </label>
                          </div>
                          <input
                            className="modal-input"
                            placeholder="Note (optional)"
                            value={sleepNote}
                            onChange={e => setSleepNote(e.target.value)}
                            style={{ marginTop: '12px' }}
                          />
                          <button
                            className="action-button modal-save"
                            onClick={handleManualSleep}
                            disabled={!manualSleepStart || !manualSleepEnd}
                            style={{ marginTop: '16px' }}
                          >
                            {editingEntry ? 'Update sleep' : 'Save sleep'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Growth modal ── */}
              {activeModal === 'Growth' && (
                <div className="modal-body">
                  {editingEntry && (
                    <label className="field edit-time-field">
                      <span>Time</span>
                      <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} />
                    </label>
                  )}
                  <div className="form-grid three-up" style={{ marginTop: 0 }}>
                    <label className="field">
                      <span>Weight (lb)</span>
                      <input
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="lb"
                        type="number"
                        min="0"
                      />
                    </label>
                    <label className="field">
                      <span>Weight (oz)</span>
                      <input
                        value={weightOz}
                        onChange={e => setWeightOz(e.target.value)}
                        placeholder="oz"
                        type="number"
                        min="0"
                        max="15"
                      />
                    </label>
                    <label className="field">
                      <span>Height (in)</span>
                      <input
                        value={height}
                        onChange={e => setHeight(e.target.value)}
                        placeholder="in"
                        type="number"
                        min="0"
                        step="0.25"
                      />
                    </label>
                  </div>
                  <button
                    className="action-button modal-save"
                    onClick={handleSaveMetrics}
                    disabled={!weight.trim() && !height.trim()}
                    style={{ marginTop: '20px' }}
                  >
                    {editingEntry ? 'Update growth' : 'Save growth'}
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
