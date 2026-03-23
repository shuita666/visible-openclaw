import { useEffect, useRef, useState } from 'react'

// Connect directly to bridge to avoid Vite proxy buffering SSE
const BRIDGE_URL = 'http://localhost:3001/status'

export function useOpenClawStatus() {
  const [status, setStatus]             = useState('error')
  const [lastUpdated, setLastUpdated]   = useState(null)
  const [lastActiveAt, setLastActiveAt] = useState(null)
  const [lastSource, setLastSource]     = useState(null)
  const [presenceList, setPresenceList] = useState([])
  const [eventLog, setEventLog]         = useState([])
  const [, setTick] = useState(0)  // for real-time timeAgo re-render

  // Re-render every second so timeAgo stays current
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let es = null
    let retryTimer = null
    let cancelled = false

    function connect() {
      if (cancelled) return
      es = new EventSource(BRIDGE_URL)

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          setStatus(data.status)
          setLastUpdated(new Date(data.ts))
          if (data.lastActiveAt != null) setLastActiveAt(new Date(data.lastActiveAt))
          if (data.lastSource   != null) setLastSource(data.lastSource)
          if (data.presenceList != null) setPresenceList(data.presenceList)
          if (data.eventLog     != null) setEventLog(data.eventLog)
        } catch {}
      }

      es.onerror = () => {
        es.close()
        if (!cancelled) {
          setStatus('error')
          retryTimer = setTimeout(connect, 3000)
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      es?.close()
      clearTimeout(retryTimer)
    }
  }, [])

  return { status, lastUpdated, lastActiveAt, lastSource, presenceList, eventLog }
}
