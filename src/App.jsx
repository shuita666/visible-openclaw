import PixelCharacter from './components/PixelCharacter'
import { useOpenClawStatus } from './hooks/useOpenClawStatus'

function timeAgo(date) {
  if (!date) return null
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60)   return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

const STATUS_COLOR = {
  idle:       '#4ade80',
  thinking:   '#facc15',
  restarting: '#fb923c',
  error:      '#f87171',
}

const STATUS_DOT = {
  idle:       '●',
  thinking:   '◉',
  restarting: '◌',
  error:      '○',
}

export default function App() {
  const { status, lastUpdated, lastActiveAt, lastSource, presenceList, eventLog } = useOpenClawStatus()

  const connColor = STATUS_COLOR[status] ?? '#f87171'
  const connLabel = status === 'error' ? 'disconnected' : 'ws://127.0.0.1:18789'

  return (
    <div className="app">
      <div className="app-title">VisibleOpenclaw</div>

      <PixelCharacter status={status} />

      <div className="stats-panel">
        <h3>OpenClaw Gateway</h3>
        <div className="stats-row">
          <span>connection</span>
          <span style={{ color: connColor }}>{connLabel}</span>
        </div>
        <div className="stats-row">
          <span>agent state</span>
          <span>{status}</span>
        </div>
        {lastActiveAt && (
          <div className="stats-row">
            <span>last active</span>
            <span>{timeAgo(lastActiveAt)}</span>
          </div>
        )}
        {lastSource && (
          <div className="stats-row">
            <span>last source</span>
            <span>{lastSource}</span>
          </div>
        )}
        {presenceList.length > 0 && (
          <div className="stats-row">
            <span>nodes online</span>
            <span>{presenceList.length} ({presenceList.map(p => p.mode).join(', ')})</span>
          </div>
        )}
        <div className="last-updated">
          {lastUpdated
            ? `updated ${lastUpdated.toLocaleTimeString()}`
            : 'waiting for bridge...'}
        </div>
      </div>

      {eventLog.length > 0 && (
        <div className="stats-panel">
          <h3>Event Log</h3>
          {[...eventLog].reverse().map((e, i) => (
            <div className="stats-row" key={i}>
              <span style={{ color: STATUS_COLOR[e.status] }}>
                {STATUS_DOT[e.status]} {e.status}
              </span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                {e.source ? `${e.source} · ` : ''}{new Date(e.ts).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
