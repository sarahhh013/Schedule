import { useState, useEffect, useMemo } from 'react'
import './App.css'

function App() {
  const [roster, setRoster] = useState([])
  const [dailySchedule, setDailySchedule] = useState([])
  const [fairnessHistory, setFairnessHistory] = useState({})
  const [showRosterManager, setShowRosterManager] = useState(false)
  const [newTechName, setNewTechName] = useState('')
  const [newTechStart, setNewTechStart] = useState('07:00')
  const [newTechEnd, setNewTechEnd] = useState('15:30')

  // Load data from localStorage on mount
  useEffect(() => {
    const savedRoster = localStorage.getItem('pharmacyRoster')
    const savedHistory = localStorage.getItem('fairnessHistory')

    if (savedRoster) {
      setRoster(JSON.parse(savedRoster))
    }
    if (savedHistory) {
      setFairnessHistory(JSON.parse(savedHistory))
    }
  }, [])

  // Save roster to localStorage whenever it changes
  useEffect(() => {
    if (roster.length > 0) {
      localStorage.setItem('pharmacyRoster', JSON.stringify(roster))
    }
  }, [roster])

  // Save fairness history to localStorage
  useEffect(() => {
    if (Object.keys(fairnessHistory).length > 0) {
      localStorage.setItem('fairnessHistory', JSON.stringify(fairnessHistory))
    }
  }, [fairnessHistory])

  // Add tech to roster
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

    // Initialize fairness tracking
    if (!fairnessHistory[tech.id]) {
      setFairnessHistory({
        ...fairnessHistory,
        [tech.id]: { upFrontStarts: 0, productionStarts: 0 }
      })
    }
  }

  // Remove tech from roster
  const removeTech = (id) => {
    setRoster(roster.filter(t => t.id !== id))
    setDailySchedule(dailySchedule.filter(t => t.id !== id))
  }

  // Toggle tech working today
  const toggleTechWorking = (tech) => {
    const existing = dailySchedule.find(t => t.id === tech.id)

    if (existing) {
      setDailySchedule(dailySchedule.filter(t => t.id !== tech.id))
    } else {
      const dailyTech = {
        ...tech,
        startTime: tech.defaultStart,
        endTime: tech.defaultEnd,
        status: 'working'
      }
      setDailySchedule([...dailySchedule, dailyTech])
    }
  }

  // Update tech times for today
  const updateTechTime = (id, field, value) => {
    setDailySchedule(dailySchedule.map(tech =>
      tech.id === id ? { ...tech, [field]: value } : tech
    ))
  }

  // Call out tech
  const callOutTech = (id) => {
    setDailySchedule(dailySchedule.filter(t => t.id !== id))
  }

  // Parse time string to minutes since midnight
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Convert minutes to time string (12-hour format)
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    const displayMins = mins.toString().padStart(2, '0')
    return `${displayHours}:${displayMins} ${period}`
  }

  // Round minutes to nearest 30-minute increment
  const roundToHalfHour = (minutes) => {
    const remainder = minutes % 30
    if (remainder <= 15) {
      return minutes - remainder
    } else {
      return minutes + (30 - remainder)
    }
  }

  // Calculate midpoint, lunch, and switch times
  const calculateShiftDetails = (startTime, endTime) => {
    const start = timeToMinutes(startTime)
    const end = timeToMinutes(endTime)
    const totalMinutes = end - start
    const midpoint = start + Math.floor(totalMinutes / 2)

    // Calculate ideal lunch start (30 min before midpoint), rounded to nearest :00 or :30
    // Allow :15 only if midpoint falls exactly there and rounding would push too far
    const rawLunchStart = midpoint - 30
    const remainder = rawLunchStart % 30
    let lunchStart

    if (remainder === 0) {
      // Already on a :00 or :30
      lunchStart = rawLunchStart
    } else if (remainder <= 7) {
      // Very close to :00 — round down
      lunchStart = rawLunchStart - remainder
    } else if (remainder >= 23) {
      // Very close to :30 — round up
      lunchStart = rawLunchStart + (30 - remainder)
    } else {
      // In between — use :15 as acceptable fallback if it's closer to midpoint logic
      lunchStart = rawLunchStart - remainder + 15
    }

    // For 7 AM starters: 11:00 AM is the EARLIEST allowed lunch
    if (start === 7 * 60) {
      const elevenAM = 11 * 60
      if (lunchStart < elevenAM) {
        lunchStart = elevenAM
      }
    }

    const lunchEnd = lunchStart + 30

    return {
      midpoint: lunchEnd,
      lunchStart,
      lunchEnd,
      switchTime: lunchEnd
    }
  }

  // Generate schedule with 2:1 ratio and fairness
  const generateSchedule = () => {
    if (dailySchedule.length === 0) return []

    // Sort by start time
    const sorted = [...dailySchedule].sort((a, b) =>
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    )

    const schedule = []

    // Apply 2:1 ratio with fairness
    sorted.forEach((tech, index) => {
      const shiftDetails = calculateShiftDetails(tech.startTime, tech.endTime)
      const history = fairnessHistory[tech.id] || { upFrontStarts: 0, productionStarts: 0 }

      // Determine starting position
      let startPosition

      // First tech always starts Up Front
      if (index === 0) {
        startPosition = 'Up Front'
      } else {
        // Apply 2:1 pattern with fairness consideration
        // Pattern: UF, UF, Prod, UF, UF, Prod...
        const patternIndex = index % 3

        if (patternIndex === 2) {
          // This position in pattern should be Production
          startPosition = 'Production'
        } else {
          // This position should be Up Front, but check fairness
          // If this person has significantly more UF starts, consider swapping
          const upFrontRatio = history.upFrontStarts / (history.upFrontStarts + history.productionStarts + 1)

          // If they've started Up Front more than 70% of the time, give them Production
          if (upFrontRatio > 0.7 && index > 1) {
            startPosition = 'Production'
          } else {
            startPosition = 'Up Front'
          }
        }
      }

      const endPosition = startPosition === 'Up Front' ? 'Production' : 'Up Front'

      schedule.push({
        ...tech,
        startPosition,
        endPosition,
        lunchStart: minutesToTime(shiftDetails.lunchStart),
        lunchEnd: minutesToTime(shiftDetails.lunchEnd),
        switchTime: minutesToTime(shiftDetails.switchTime)
      })
    })

    return schedule
  }

  // Save fairness history for the day
  const saveFairnessHistory = () => {
    const schedule = generateSchedule()
    const newHistory = { ...fairnessHistory }

    schedule.forEach(tech => {
      if (!newHistory[tech.id]) {
        newHistory[tech.id] = { upFrontStarts: 0, productionStarts: 0 }
      }
      if (tech.startPosition === 'Up Front') {
        newHistory[tech.id].upFrontStarts++
      } else {
        newHistory[tech.id].productionStarts++
      }
    })

    setFairnessHistory(newHistory)
    alert('Schedule saved! Fairness tracking updated.')
  }

  // Check coverage warnings
  const checkCoverage = (schedule) => {
    const warnings = []

    // Create timeline of coverage (in 15-minute increments)
    const timeline = {}
    for (let hour = 7; hour <= 22; hour++) {
      for (let min = 0; min < 60; min += 15) {
        const time = hour * 60 + min
        if (time >= 7 * 60 && time <= 22 * 60) {
          timeline[time] = { upFront: 0, production: 0 }
        }
      }
    }

    // Fill timeline with coverage
    schedule.forEach(tech => {
      const start = timeToMinutes(tech.startTime)
      const end = timeToMinutes(tech.endTime)
      const switchTime = timeToMinutes(tech.switchTime)
      const lunchStart = timeToMinutes(tech.lunchStart)
      const lunchEnd = timeToMinutes(tech.lunchEnd)

      for (let time in timeline) {
        const t = parseInt(time)

        // Skip if during lunch
        if (t >= lunchStart && t < lunchEnd) continue

        // Check if working at this time
        if (t >= start && t < end) {
          if (t < switchTime) {
            timeline[t][tech.startPosition === 'Up Front' ? 'upFront' : 'production']++
          } else {
            timeline[t][tech.endPosition === 'Up Front' ? 'upFront' : 'production']++
          }
        }
      }
    })

    // Check for coverage issues
    for (let time in timeline) {
      const t = parseInt(time)
      const hour = Math.floor(t / 60)
      const coverage = timeline[t]

      // 7-8 AM: Min 1 Up Front
      if (hour >= 7 && hour < 8 && coverage.upFront < 1) {
        warnings.push({
          type: 'critical',
          time: minutesToTime(t),
          message: `CRITICAL: No Up Front coverage at ${minutesToTime(t)}`
        })
      }

      // 8 AM - 9 PM: Min 2 Up Front (preferably 3-4)
      if (hour >= 8 && hour < 21) {
        if (coverage.upFront < 2) {
          warnings.push({
            type: 'critical',
            time: minutesToTime(t),
            message: `CRITICAL: Only ${coverage.upFront} Up Front at ${minutesToTime(t)} (need 2+)`
          })
        } else if (coverage.upFront < 3) {
          warnings.push({
            type: 'warning',
            time: minutesToTime(t),
            message: `WARNING: Only ${coverage.upFront} Up Front at ${minutesToTime(t)} (prefer 3-4)`
          })
        }
      }

      // 9-10 PM: Min 1 Up Front
      if (hour >= 21 && hour < 22 && coverage.upFront < 1) {
        warnings.push({
          type: 'critical',
          time: minutesToTime(t),
          message: `CRITICAL: No Up Front coverage at ${minutesToTime(t)}`
        })
      }
    }

    // Check evening coverage (after 5:30 PM)
    const eveningTimes = Object.keys(timeline).filter(t => parseInt(t) >= 17.5 * 60)
    const hasEveningCoverage = eveningTimes.some(t => timeline[t].upFront >= 2)

    if (!hasEveningCoverage) {
      warnings.push({
        type: 'warning',
        time: '17:30',
        message: 'WARNING: Insufficient evening coverage after 5:30 PM'
      })
    }

    return warnings
  }

  const schedule = generateSchedule()
  const warnings = checkCoverage()

  return (
    <div className="app">
      <header className="header">
        <h1>Pharmacy Schedule Manager</h1>
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
            <input
              type="time"
              value={newTechStart}
              onChange={(e) => setNewTechStart(e.target.value)}
            />
            <input
              type="time"
              value={newTechEnd}
              onChange={(e) => setNewTechEnd(e.target.value)}
            />
            <button onClick={addTech}>Add Tech</button>
          </div>
          <div className="roster-list">
            {roster.map(tech => (
              <div key={tech.id} className="roster-item">
                <span>{tech.name}</span>
                <span>{tech.defaultStart} - {tech.defaultEnd}</span>
                <button onClick={() => removeTech(tech.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="daily-schedule">
        <h2>Today's Schedule</h2>
        <div className="tech-selector">
          {roster.map(tech => {
            const isWorking = dailySchedule.find(t => t.id === tech.id)
            return (
              <label key={tech.id} className="tech-checkbox">
                <input
                  type="checkbox"
                  checked={!!isWorking}
                  onChange={() => toggleTechWorking(tech)}
                />
                {tech.name}
              </label>
            )
          })}
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
                <button onClick={() => callOutTech(tech.id)} className="callout-btn">
                  Call Out
                </button>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="warnings">
            <h3>Coverage Warnings</h3>
            {[...new Set(warnings.map(w => w.message))].map((msg, i) => {
              const warning = warnings.find(w => w.message === msg)
              return (
                <div key={i} className={`warning ${warning.type}`}>
                  {msg}
                </div>
              )
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
                  <th>Start Position</th>
                  <th>Lunch</th>
                  <th>Switch</th>
                  <th>End Position</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map(tech => (
                  <tr key={tech.id}>
                    <td>{tech.name}</td>
                    <td>{tech.startTime} - {tech.endTime}</td>
                    <td className="position up-front">{tech.startPosition}</td>
                    <td>{tech.lunchStart} - {tech.lunchEnd}</td>
                    <td>{tech.switchTime}</td>
                    <td className={`position ${tech.endPosition === 'Up Front' ? 'up-front' : 'production'}`}>
                      {tech.endPosition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={saveFairnessHistory} className="save-schedule-btn">
              Save Schedule & Update Fairness Tracking
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
