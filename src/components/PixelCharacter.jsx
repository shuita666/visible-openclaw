import '../styles/pixel-character.css'

const STATUS_CONFIG = {
  idle: {
    label: '空闲',
    color: '#4ade80',
    animClass: 'char-idle',
  },
  thinking: {
    label: '思考中',
    color: '#facc15',
    animClass: 'char-thinking',
  },
  error: {
    label: '未连接',
    color: '#f87171',
    animClass: 'char-error',
  },
}

export default function PixelCharacter({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.error

  return (
    <div className="char-wrapper">
      <div
        className={`char-pixel ${config.animClass}`}
        style={{ '--char-color': config.color }}
      />
      <div className="char-label" style={{ color: config.color }}>
        {config.label}
      </div>
    </div>
  )
}
