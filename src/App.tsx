import { useState, useMemo, useEffect } from 'react'
import './App.css'
import type { JSX } from 'react/jsx-runtime'

type EntryType = 'Feeding' | 'Elimination' | 'Sleep' | 'Growth'
type FeedType = 'Bottle' | 'Breastfeeding' | 'Formula' | 'Solid Food'
type EliminationType = 'Pee' | 'Poop' | 'Both'
type EliminationLocation = 'Diaper' | 'Potty' | 'Toilet' | 'Accident' | 'Sink'

interface Entry {
  id: number
  type: EntryType
  time: string
  details: string
  note: string
}

interface Totals {
  todayFeeds: number
  todayEliminations: number
  todaySleep: number
  latestGrowth?: Entry
}

interface Data {
  entries: Entry[]
}

const entryTypeClassMap: Record<EntryType, string> = {
  Feeding: 'entry-badge feeding',
  Elimination: 'entry-badge diaper',
  Sleep: 'entry-badge sleep',
  Growth: 'entry-badge growth',
}

export default function BabyTrackerApp(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(true)
  const [feedType, setFeedType] = useState<FeedType>('Bottle')
  const [amount, setAmount] = useState<number>(0)
  const [eliminationType, setEliminationType] = useState<EliminationType>('Pee')
  const [eliminationLocation, setEliminationLocation] = useState<EliminationLocation>('Diaper')
  const [sleepStart, setSleepStart] = useState<string>('')
  const [sleepEnd, setSleepEnd] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [weight, setWeight] = useState<string>('')
  const [weightOz, setWeightOz] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [entries, setEntries] = useState<Entry[]>([
    {
      id: 1,
      type: 'Feeding',
      time: '07:30',
      details: 'Bottle · 4 oz',
      note: 'Finished most of it',
    },
    {
      id: 2,
      type: 'Elimination',
      time: '09:10',
      details: 'Diaper · Pee',
      note: '',
    },
    {
      id: 3,
      type: 'Sleep',
      time: '10:00',
      details: '10:00 - 11:15',
      note: 'Good nap',
    },
  ])

  useEffect(() => {
    let getEntries = async () => {
      try {
        const response = await fetch('/api/entries');
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }

        const data: Data = await response.json();
        setEntries(data.entries);
      } catch (e) {
        console.error(e);
      }
    }

    if (loading) {
      getEntries();
      setLoading(false)
    }

  }, [loading]);

  const addEntry = (
    type: EntryType,
    details: string,
    customTime?: string,
    customNote: string = ''
  ): void => {
    const fallbackTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    const newEntry: Entry = {
      id: Date.now(),
      type,
      time: customTime || fallbackTime,
      details,
      note: customNote,
    }

    fetch("/api/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newEntry),
    }).then(__ => setLoading(true));

    setEntries((prev) => [newEntry, ...prev])
  }

  const handleAddFeed = (): void => {
    if (!amount) return
    addEntry('Feeding', `${feedType} · ${amount} oz`)
    setAmount(0)
    setNote('')
  }

  const handleAddElimination = (): void => {
    addEntry('Elimination', `${eliminationLocation} · ${eliminationType}`, undefined, note)
    setNote('')
  }

  const handleAddSleep = (): void => {
    if (!sleepStart || !sleepEnd) return
    addEntry('Sleep', `${sleepStart} - ${sleepEnd}`, sleepStart, note)
    setSleepStart('')
    setSleepEnd('')
    setNote('')
  }

  const handleSaveMetrics = (): void => {
    if (!weight.trim() && !height.trim()) return

    const parts: string[] = []
    if (weight.trim()) {
      const ozPart = weightOz.trim() ? ` ${weightOz} oz` : ''
      parts.push(`Weight: ${weight} lb${ozPart}`)
    }
    if (height.trim()) parts.push(`Height: ${height} in`)

    addEntry('Growth', parts.join(' · '))
    setWeight('')
    setWeightOz('')
    setHeight('')
  }

  const totals = useMemo<Totals>(() => {
    const todayFeeds = entries.filter((e) => e.type === 'Feeding').length
    const todayEliminations = entries.filter((e) => e.type === 'Elimination').length
    const todaySleep = entries.filter((e) => e.type === 'Sleep').length
    const latestGrowth = entries.find((e) => e.type === 'Growth')
    return { todayFeeds, todayEliminations, todaySleep, latestGrowth }
  }, [entries])

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="tracker-hero">
          <div className="hero-copy">
            <div className="hero-kicker">Daily care dashboard</div>
            <h1>Baby Tracker</h1>
            <p>
              Log feedings, diaper changes, naps, and growth updates in a calmer,
              more readable layout.
            </p>
          </div>

          <div className="hero metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Feeds</span>
              <strong className="metric-value">{totals.todayFeeds}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Eliminations</span>
              <strong className="metric-value">{totals.todayEliminations}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Naps</span>
              <strong className="metric-value">{totals.todaySleep}</strong>
            </div>
            <div className="metric-card metric-card-wide">
              <span className="metric-label">Latest growth</span>
              <strong className="metric-value metric-value-small">
                {totals.latestGrowth ? totals.latestGrowth.details : 'No data yet'}
              </strong>
            </div>
          </div>
        </header>

        <div className="content-grid">
          <section className="form-column">
            <article className="tracker-card">
              <div className="section-heading">
                <h2>Add feeding</h2>
                <span className="counter">Nutrition</span>
              </div>
              <div className="form-grid two-up">
                <label className="field">
                  <span>Type</span>
                  <select
                    value={feedType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setFeedType(e.target.value as FeedType)
                    }
                  >
                    <option>Bottle</option>
                    <option>Breastfeeding</option>
                    <option>Formula</option>
                    <option>Solid Food</option>
                  </select>
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input
                    value={amount}
                    type='number'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.valueAsNumber)}
                    placeholder="Amount (oz)"
                  />
                </label>
              </div>
              <button onClick={handleAddFeed} className="action-button">
                Save feeding
              </button>
            </article>

            <article className="tracker-card">
              <div className="section-heading">
                <h2>Add elimination change</h2>
                <span className="counter">Care</span>
              </div>
              <div className="form-grid two-up">
                <label className="field">
                  <span>Change type</span>
                  <select
                    value={eliminationType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setEliminationType(e.target.value as EliminationType)
                    }
                  >
                    <option>Pee</option>
                    <option>Poop</option>
                    <option>Both</option>
                  </select>
                </label>
                <label className="field">
                  <span>Where type</span>
                  <select
                    value={eliminationLocation}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setEliminationLocation(e.target.value as EliminationLocation)
                    }
                  >
                    <option>Diaper</option>
                    <option>Potty</option>
                    <option>Toilet</option>
                    <option>Accident</option>
                    <option>Sink</option>
                  </select>
                </label>
                <label className="field">
                  <span>Note</span>
                  <input
                    value={note}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                    placeholder="Optional note"
                  />
                </label>
              </div>
              <button onClick={handleAddElimination} className="action-button">
                Save elimniation change
              </button>
            </article>

            <article className="tracker-card">
              <div className="section-heading">
                <h2>Add sleep</h2>
                <span className="counter">Rest</span>
              </div>
              <div className="form-grid three-up">
                <label className="field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={sleepStart}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSleepStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End</span>
                  <input
                    type="time"
                    value={sleepEnd}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSleepEnd(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Note</span>
                  <input
                    value={note}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                    placeholder="Optional note"
                  />
                </label>
              </div>
              <button onClick={handleAddSleep} className="action-button">
                Save sleep
              </button>
            </article>

            <article className="tracker-card">
              <div className="section-heading">
                <h2>Add growth metrics</h2>
                <span className="counter">Growth</span>
              </div>
              <div className="form-grid three-up">
                <label className="field">
                  <span>Weight (lb)</span>
                  <input
                    value={weight}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeight(e.target.value)}
                    placeholder="lb"
                  />
                </label>
                <label className="field">
                  <span>Weight (oz)</span>
                  <input
                    value={weightOz}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeightOz(e.target.value)}
                    placeholder="oz"
                  />
                </label>
                <label className="field">
                  <span>Height</span>
                  <input
                    value={height}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeight(e.target.value)}
                    placeholder="Height (in)"
                  />
                </label>
              </div>
              <button onClick={handleSaveMetrics} className="action-button">
                Save metrics
              </button>
            </article>
          </section>

          <aside className="tracker-card timeline-card">
            <div className="timeline-header">
              <div>
                <h2>Today’s timeline</h2>
                <p className="timeline-subtitle">A quick view of the day so far.</p>
              </div>
              <span className="counter">{entries.length} entries</span>
            </div>

            <div className="ticks" />

            <div className="timeline-list">
              {entries.map((entry) => (
                <article key={entry.id} className="timeline-item">
                  <div className="timeline-topline">
                    <span className={entryTypeClassMap[entry.type]}>{entry.type}</span>
                    <span className="timeline-time">{entry.time}</span>
                  </div>
                  <div className="timeline-details">{entry.details}</div>
                  {entry.note ? <div className="timeline-note">{entry.note}</div> : null}
                </article>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

