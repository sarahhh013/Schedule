import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [roster, setRoster] = useState([])
  const [dailySchedule, setDailySchedule] = useState([])
  const [fairnessHistory, setFairnessHistory] = useState({})
  const [showRosterManager, setShowRosterManager] = useState(false)
  const [newTechName, setNewTechName] = useState('')
  const [newTechStart, setNewTechStart] = useState('07:00')
  const [newTechEnd, setNewTechEnd] = useState('15:30')

  useEffect(() => {
    const savedRoster = localStorage.getItem('pharmacyRoster')
    const savedHistory = localStorage.getItem('fairnessHistory')
    if (savedRoster) setRoster(JSON.parse(savedRoster))
    if (savedHistory) setFairnessHistory(JSON.parse(savedHistory))
  }, [])

  useEffect(() => {
    if (roster.length > 0) localStorage.setItem('pharmacyRoster', JSON.stringify(roster))
  }, [roster])

  useEffect(() => {
    if (Object.keys(fairnessHistory).length > 0)
      localStorage.setItem('fairnessHistory', JSON.stringify(fairnessHistory))
  }, [fairnessHistory])

  // Parse "HH:MM" to minutes since midnight
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Convert minutes to 12-hour display string
  const minutesToDisplay = (minutes) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    const period = h >= 12 ? 'PM' : 'AM'
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`
  }

  // Calculate lunch start in raw minutes, rounded to :00 or :30 (:15 as fallback)
  const calcLunchStart = (startMin, endMin) => {
    const totalMinutes = endMin - startMin
    const midpoint = startMin + Math.floor(totalMinutes / 2)
    const rawLunch = midpoint - 30
    const remainder = rawLunch % 30

    let lunchStart
    if (remainder === 0) {
      lunchStart = rawLunch
    } else if (remainder <= 7) {
      lunchStart = rawLunch - remainder          // round to :00
    } else if (remainder >= 23) {
      lunchStart = rawLunch + (30 - remainder)  // round to :30
    } else {
      lunchStart = rawLunch - remainder + 15    // :15 fallback
    }

    // For 7 AM starters: 11:00 AM is the EARLIEST allowed lunch
    if (startMin === 7 * 60 && lunchStart < 11 * 60) {
      lunchStart = 11 * 60
    }

    return lunchStart
  }

  const addTech = () => {
    if (!newTechName.trim()) return
    const tech = {
      id: Date.now(),
      name: newTechName.trim(),
      defaultStart: newTechStart,
      defaultEnd: newTechEnd
    }
    setRoster([...roster, tech])
    setNewTechName('')
    if (!fairnessHistory[tech.id]) {
      setFairnessHistory(prev => ({ ...prev, [tech.id]: { upFrontStarts: 0, productionStarts: 0 } }))
    }
  }

  const removeTech = (id) => {
    setRoster(roster.filter(t => t.id !== id))
    setDailySchedule(dailySchedule.filter(t => t.id !== id))
  }

  const toggleTechWorking = (tech) => {
    const existing = dailySchedule.find(t => t.id === tech.id)
    if (existing) {
      setDailySchedule(dailySchedule.filter(t => t.id !== tech.id))
    } else {
      setDailySchedule([...dailySchedule, {
        ...tech,
        startTime: tech.defaultStart,
        endTime: tech.defaultEnd
      }])
    }
  }

  const updateTechTime = (id, field, value) => {
    setDailySchedule(dailySchedule.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const callOutTech = (id) => {
    setDailySchedule(dailySchedule.filter(t => t.id !== id))
  }

  const generateSchedule = () => {
    if (dailySchedule.length === 0) return []

    const sorted = [...dailySchedule].sort((a, b) =>
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    )

    const n = sorted.length

    // First tech always Up Front. For the rest, use 2:1 ratio.
    // Total UF slots = ceil(n * 2/3), Prod slots = floor(n * 1/3)
    const totalUF = Math.ceil(n * 2 / 3)
    const totalProd = n - totalUF

    // The first tech is locked to Up Front. Distribute remaining slots.
    const remainingUF = totalUF - 1   // already used 1 UF slot for first tech
    const remainingProd = totalProd

    // Sort remaining techs by UF deficit: those with fewer UF starts get UF priority
    const remaining = sorted.slice(1).map(tech => ({
      tech,
      history: fairnessHistory[tech.id] || { upFrontStarts: 0, productionStarts: 0 }
    }))

    // Score: lower score = more deserving of Up Front (has done it less)
    remaining.sort((a, b) => {
      const aTotal = a.history.upFrontStarts + a.history.productionStarts
      const bTotal = b.history.upFrontStarts + b.history.productionStarts
      const aRatio = aTotal === 0 ? 0 : a.history.upFrontStarts / aTotal
      const bRatio = bTotal === 0 ? 0 : b.history.upFrontStarts / bTotal
      return aRatio - bRatio  // ascending: lowest UF ratio gets UF slot first
    })

    // Assign positions: first remainingUF get Up Front, rest get Production
    const positionMap = {}
    remaining.forEach((item, i) => {
      positionMap[item.tech.id] = i < remainingUF ? 'Up Front' : 'Production'
    })

    return sorted.map((tech) => {
      const startMin = timeToMinutes(tech.startTime)
      const endMin = timeToMinutes(tech.endTime)
      const lunchStartMin = calcLunchStart(startMin, endMin)
      const lunchEndMin = lunchStartMin + 30
      const switchMin = lunchEndMin

      const startPosition = sorted[0].id === tech.id
        ? 'Up Front'
        : positionMap[tech.id]

      return {
        ...tech,
        startMin,
        endMin,
        lunchStartMin,
        lunchEndMin,
        switchMin,
        startPosition,
        endPosition: startPosition === 'Up Front' ? 'Production' : 'Up Front'
      }
    })
  }

  const checkCoverage = (schedule) => {
    const warnings = []
    const timeline = {}

    for (let h = 7; h <= 22; h++) {
      for (let m = 0; m < 60; m += 15) {
        const t = h * 60 + m
        if (t <= 22 * 60) timeline[t] = { upFront: 0, production: 0 }
      }
    }

    schedule.forEach(tech => {
      for (let t in timeline) {
        const time = parseInt(t)
        if (time >= tech.lunchStartMin && time < tech.lunchEndMin) continue
        if (time >= tech.startMin && time < tech.endMin) {
          const pos = time < tech.switchMin ? tech.startPosition : tech.endPosition
          timeline[t][pos === 'Up Front' ? 'upFront' : 'production']++
        }
      }
    })

    for (let t in timeline) {
      const time = parseInt(t)
      const hour = Math.floor(time / 60)
      const { upFront } = timeline[t]

      if (hour >= 7 && hour < 8 && upFront < 1) {
        warnings.push({ type: 'critical', message: `CRITICAL: No Up Front coverage at ${minutesToDisplay(time)}` })
      }
      if (hour >= 8 && hour < 21) {
        if (upFront < 2) {
          warnings.push({ type: 'critical', message: `CRITICAL: Only ${upFront} Up Front at ${minutesToDisplay(time)} (need 2+)` })
        } else if (upFront < 3) {
          warnings.push({ type: 'warning', message: `WARNING: Only ${upFront} Up Front at ${minutesToDisplay(time)} (prefer 3-4)` })
        }
      }
      if (hour >= 21 && hour < 22 && upFront < 1) {
        warnings.push({ type: 'critical', message: `CRITICAL: No Up Front coverage at ${minutesToDisplay(time)}` })
      }
    }

    const hasEveningCoverage = Object.keys(timeline)
      .filter(t => parseInt(t) >= 17.5 * 60)
      .some(t => timeline[t].upFront >= 2)

    if (!hasEveningCoverage) {
      warnings.push({ type: 'warning', message: 'WARNING: Insufficient evening coverage after 5:30 PM' })
    }

    return warnings
  }

  const saveFairnessHistory = (schedule) => {
    const newHistory = { ...fairnessHistory }
    schedule.forEach(tech => {
      if (!newHistory[tech.id]) newHistory[tech.id] = { upFrontStarts: 0, productionStarts: 0 }
      if (tech.startPosition === 'Up Front') newHistory[tech.id].upFrontStarts++
      else newHistory[tech.id].productionStarts++
    })
    setFairnessHistory(newHistory)
    alert('Schedule saved! Fairness tracking updated.')
  }

  const schedule = generateSchedule()
  const warnings = checkCoverage(schedule)

  return (
    <div className="app">
      <header className="header">
        <h1>Pharmacy Schedule</h1>
        <button onClick={() => setShowRosterManager(!showRosterManager)}>
          {showRosterManager ? 'Hide' : 'Manage'} Roster
        </button>
      </header>

      {showRosterManager && (
        <div className="roster-manager">
          <h2>Tech Roster</h2>
          <div className="add-tech">
            <input
              type="text"
              placeholder="Tech name"
              value={newTechName}
              onChange={(e) => setNewTechName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTech()}
            />
            <input type="time" value={newTechStart} onChange={(e) => setNewTechStart(e.target.value)} />
            <input type="time" value={newTechEnd} onChange={(e) => setNewTechEnd(e.target.value)} />
            <button onClick={addTech}>Add Tech</button>
          </div>
          <div className="roster-list">
            {roster.map(tech => (
              <div key={tech.id} className="roster-item">
                <span>{tech.name}</span>
                <span>{minutesToDisplay(timeToMinutes(tech.defaultStart))} – {minutesToDisplay(timeToMinutes(tech.defaultEnd))}</span>
                <button onClick={() => removeTech(tech.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="daily-schedule">
        <h2>Today's Schedule</h2>
        <div className="tech-selector">
          {roster.map(tech => (
            <label key={tech.id} className="tech-checkbox">
              <input
                type="checkbox"
                checked={!!dailySchedule.find(t => t.id === tech.id)}
                onChange={() => toggleTechWorking(tech)}
              />
              {tech.name}
            </label>
          ))}
        </div>

        {dailySchedule.length > 0 && (
          <div className="schedule-adjustments">
            <h3>Adjust Times</h3>
            {dailySchedule.map(tech => (
              <div key={tech.id} className="tech-adjustment">
                <span className="tech-name">{tech.name}</span>
                <input
                  type="time"
                  value={tech.startTime}
                  onChange={(e) => updateTechTime(tech.id, 'startTime', e.target.value)}
                />
                <input
                  type="time"
                  value={tech.endTime}
                  onChange={(e) => updateTechTime(tech.id, 'endTime', e.target.value)}
                />
                <button onClick={() => callOutTech(tech.id)} className="callout-btn">Call Out</button>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="warnings">
            <h3>Coverage Warnings</h3>
            {[...new Set(warnings.map(w => w.message))].map((msg, i) => {
              const w = warnings.find(x => x.message === msg)
              return <div key={i} className={`warning ${w.type}`}>{msg}</div>
            })}
          </div>
        )}

        {schedule.length > 0 && (
          <div className="schedule-grid">
            <h3>Generated Schedule</h3>
            <table>
              <thead>
                <tr>
                  <th>Tech</th>
                  <th>Shift</th>
                  <th>Starts</th>
                  <th>Lunch</th>
                  <th>Switch</th>
                  <th>Ends</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map(tech => (
                  <tr key={tech.id}>
                    <td>{tech.name}</td>
                    <td>{minutesToDisplay(tech.startMin)} – {minutesToDisplay(tech.endMin)}</td>
                    <td className="position up-front">{tech.startPosition}</td>
                    <td>{minutesToDisplay(tech.lunchStartMin)} – {minutesToDisplay(tech.lunchEndMin)}</td>
                    <td>{minutesToDisplay(tech.switchMin)}</td>
                    <td className={`position ${tech.endPosition === 'Up Front' ? 'up-front' : 'production'}`}>
                      {tech.endPosition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => saveFairnessHistory(schedule)} className="save-schedule-btn">
              Save Schedule & Update Fairness Tracking
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
