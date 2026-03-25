# VisibleOpenclaw

> Visualize your OpenClaw AI assistant's real-time state as an animated pixel character.
> 将 OpenClaw AI 助手的实时状态可视化为像素角色动画。

## Prerequisites / 前提条件

- **Node.js ≥ 18**
- **OpenClaw Gateway** running locally at `ws://127.0.0.1:18789`
- `~/.openclaw/openclaw.json` must contain `gateway.auth.token`

```json
{
  "gateway": {
    "auth": {
      "token": "your-token-here"
    }
  }
}
```

## Quick Start / 快速上手

```bash
# 1. Clone and install / 克隆并安装依赖
git clone https://github.com/shuita666/visible-openclaw.git
cd visible-openclaw
npm install

# 2. Terminal 1 — Start bridge server / 启动桥接服务
npm run bridge

# 3. Terminal 2 — Start frontend / 启动前端
npm run dev

# 4. Open browser / 打开浏览器
# http://localhost:5173
```

## Architecture / 架构

```
OpenClaw Gateway (ws://127.0.0.1:18789)
        ↕  WebSocket + Ed25519 auth
Bridge Server  (Node.js, port 3001)
        ↕  SSE
React Frontend (Vite, port 5173)
        →  Pixel Character animation
```

The bridge authenticates with the Gateway using a persistent Ed25519 device identity stored at `~/.openclaw/visible-openclaw-identity.json` (auto-generated on first run).

## Status States / 状态说明

| State | Color | Animation | Trigger |
|-------|-------|-----------|---------|
| `idle` | Green `#4ade80` | Slow float | Connected, agent not running |
| `thinking` | Yellow `#facc15` | Fast pulse + glow | Agent lifecycle start |
| `restarting` | Orange `#fb923c` | — | Gateway planned restart |
| `error` | Red `#f87171` | Shake | WebSocket disconnected |

## PM2 Auto-Start / 开机自启（生产环境）

Uses [PM2](https://pm2.keymetrics.io/) to keep the bridge and frontend running.

```bash
# Install PM2 globally (first time)
npm install -g pm2

# Start both services
npm run start

# Other commands
npm run stop      # Stop all
npm run restart   # Restart all
npm run logs      # View live logs

# Auto-start on system boot (Windows)
npm install -g pm2-windows-startup
pm2-startup install
npm run start
pm2 save
```

## Customizing the UI / 自定义 UI

The character UI is a pluggable React component. You can replace `PixelCharacter` with any component that accepts a `status` prop.

### Step 1 — Create your component / 创建你的组件

```jsx
// src/components/MyCharacter.jsx
// status: 'idle' | 'thinking' | 'restarting' | 'error'
export default function MyCharacter({ status }) {
  const emoji = {
    idle:       '😌',
    thinking:   '🤔',
    restarting: '🔄',
    error:      '😵',
  }[status] ?? '❓'

  return <div style={{ fontSize: 64 }}>{emoji}</div>
}
```

### Step 2 — Pass it to App / 传入 App

In `src/main.jsx`, pass your component via the `CharacterComponent` prop:

```jsx
import MyCharacter from './components/MyCharacter'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App CharacterComponent={MyCharacter} />
  </StrictMode>
)
```

That's it — the stats panel and event log remain unchanged.

## File Structure / 文件结构

```
VisibleOpenclaw/
├── bridge/
│   └── server.mjs          ← WebSocket auth + SSE server
├── src/
│   ├── App.jsx             ← Main UI, accepts CharacterComponent prop
│   ├── main.jsx            ← Entry point
│   ├── hooks/
│   │   └── useOpenClawStatus.js  ← SSE client hook
│   ├── components/
│   │   └── PixelCharacter.jsx    ← Default pixel art character
│   └── styles/
│       ├── app.css
│       └── pixel-character.css
├── ecosystem.config.cjs    ← PM2 config
├── vite.config.js
└── package.json
```

## Troubleshooting / 常见问题

**Bridge shows "empty token"**
→ Check that `~/.openclaw/openclaw.json` exists and contains `gateway.auth.token`.

**Frontend shows "error" state**
→ Make sure `npm run bridge` is running in another terminal, and the bridge can connect to the Gateway at `ws://127.0.0.1:18789`.

**SSE not updating**
→ The frontend connects directly to `http://localhost:3001/status` (not through Vite proxy) to avoid buffering issues. Ensure port 3001 is free.
