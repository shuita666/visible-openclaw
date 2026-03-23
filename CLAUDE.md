# VisibleOpenclaw — Claude Code 工作指南

## 项目目标
将 OpenClaw AI 助手的实时状态可视化为一个像素角色。角色动画反映 OpenClaw 的工作状态。

## 架构

```
OpenClaw Gateway (ws://127.0.0.1:18789)
        ↕ WebSocket + Ed25519 auth
Bridge Server (Node.js ESM, port 3001)
        ↕ SSE
React Frontend (Vite, port 5173)
        → PixelCharacter 动画
```

## 文件结构

```
E:\VisibleOpenclaw\
├── CLAUDE.md             ← 本文件
├── package.json
├── vite.config.js
├── index.html
├── bridge/
│   └── server.mjs        ← WS 认证 + SSE 服务器
└── src/
    ├── main.jsx
    ├── App.jsx            ← 状态面板 UI
    ├── hooks/
    │   └── useOpenClawStatus.js  ← SSE 客户端 (直连 :3001)
    ├── components/
    │   └── PixelCharacter.jsx    ← 3状态像素角色
    └── styles/
        ├── app.css
        └── pixel-character.css  ← box-shadow 像素艺术 + 动画
```

## 运行方式

```bash
npm run bridge   # 终端1：启动 bridge
npm run dev      # 终端2：启动前端
# 访问 http://localhost:5173
```

## 已完成的部分

### Gateway 认证 (bridge/server.mjs)
- Ed25519 设备密钥对，持久化到 `~/.openclaw/visible-openclaw-identity.json`
- v3 签名 payload: `v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`
- Challenge-response 握手流程完整
- `CLIENT_ID = 'gateway-client'`, `CLIENT_MODE = 'ui'`, `platform = 'windows'`
- 自动3秒重连

### 状态机 (3个状态)
| 状态 | 触发条件 | 颜色 | 动画 |
|------|---------|------|------|
| `idle` | hello-ok / agent lifecycle end / chat final | 绿 #4ade80 | 慢速漂浮 |
| `thinking` | agent lifecycle start | 黄 #facc15 | 快速漂浮+脉冲发光 |
| `error` | WS断连 | 红 #f87171 | 抖动 |

### SSE
- Bridge 广播状态变更，带心跳(15s)防止代理超时
- 前端直连 `http://localhost:3001/status` 绕过 Vite proxy 的 SSE 缓冲问题

## 已知问题 / 待探索空间

### 1. Token 硬编码 (优先级: 中)
`GATEWAY_TOKEN` 当前硬编码在 server.mjs。
应改为从 `~/.openclaw/openclaw.json` → `gateway.auth.token` 读取。

### 2. 缺少 `speaking` 状态 (优先级: 低)
当 OpenClaw 正在流式输出回复时（chat 事件 state≠final），可以加第4个状态。
需要实验: `ev === 'chat' && payload.state !== 'final'` 是否有效触发。

### 3. 未知事件结构 (优先级: 探索)
`sessions.updated` / `session.updated` 的 payload 结构未经验证，
当前用 `payload?.active ?? payload?.isActive` 推测，可能不准确。
建议：在 bridge 里 `console.log` 所有未处理事件来探索真实结构。

### 4. UI 信息量有限 (优先级: 低)
目前只显示 connection status + agent state。
可扩展方向：
- 最近事件日志 (滚动列表)
- 当前任务描述 (如果 gateway 有此字段)
- 在线时长统计

## 关键约束
- 不要改变 WS 认证逻辑，除非 gateway 协议有更新
- `platform` 在签名 payload 和 `client.platform` 字段必须一致
- SSE 必须直连 :3001，不走 Vite proxy (buffering 问题)
