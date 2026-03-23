/**
 * VisibleOpenclaw Bridge Server
 * Connects to OpenClaw Gateway via WebSocket, exposes agent state via SSE.
 * Port: 3001  —  GET /status → SSE stream
 */

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ── Config ────────────────────────────────────────────────────────────────────
const GATEWAY_URL    = 'ws://127.0.0.1:18789'
const BRIDGE_PORT    = 3001
const IDENTITY_FILE  = path.join(os.homedir(), '.openclaw', 'visible-openclaw-identity.json')
const OPENCLAW_CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'openclaw.json')

function loadGatewayToken() {
  try {
    const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_FILE, 'utf8'))
    const token = cfg?.gateway?.auth?.token
    if (token) return token
    console.warn('[bridge] No gateway.auth.token found in openclaw.json, using empty token')
  } catch (e) {
    console.warn('[bridge] Could not read openclaw.json:', e.message)
  }
  return ''
}

const GATEWAY_TOKEN = loadGatewayToken()
console.log('[bridge] Token loaded:', GATEWAY_TOKEN ? `${GATEWAY_TOKEN.slice(0, 8)}...` : '(empty)')
const CLIENT_ID      = 'gateway-client'
const CLIENT_MODE    = 'ui'
const CLIENT_PLATFORM = 'windows'

// ── Device Identity ───────────────────────────────────────────────────────────
function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function derivePublicKeyRaw(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return der.slice(-32) // last 32 bytes = raw Ed25519 public key
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex')
}

function signDevicePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem)
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem))
}

function buildDeviceAuthPayloadV3({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce, platform = '', deviceFamily = '' }) {
  // Normalize: lowercase ASCII, empty string if blank
  const norm = (v) => (v ?? '').trim().toLowerCase()
  return ['v3', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token ?? '', nonce, norm(platform), norm(deviceFamily)].join('|')
}

function loadOrCreateDeviceIdentity() {
  try {
    if (fs.existsSync(IDENTITY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'))
      if (parsed?.version === 1 && parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
        return parsed
      }
    }
  } catch {}

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem  = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const identity = { version: 1, deviceId: fingerprintPublicKey(publicKeyPem), publicKeyPem, privateKeyPem }

  try {
    fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2) + '\n', { mode: 0o600 })
    console.log('[bridge] Generated new device identity:', identity.deviceId)
  } catch (e) {
    console.warn('[bridge] Could not persist identity:', e.message)
  }
  return identity
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentStatus   = 'error'
let lastActiveAt    = null   // ms timestamp from health event sessions.recent[0].updatedAt
let lastSource      = null   // parsed from session key e.g. "飞书群" / "直连"
let presenceList    = []     // connected nodes from presence event
let isRestarting    = false  // gateway is doing a planned restart
const eventLog      = []     // last 10 status change records
const EVENT_LOG_MAX = 10
const sseClients    = new Set()

function parseSessionSource(key) {
  if (!key) return null
  if (key.includes(':feishu:group:')) return '飞书群'
  if (key.includes(':feishu:'))       return '飞书'
  if (key.endsWith(':main'))          return '直连'
  return key.split(':').slice(2).join(':')
}

function currentPayload() {
  return { status: currentStatus, lastActiveAt, lastSource, presenceList, eventLog, ts: Date.now() }
}

function broadcast(payload) {
  const data = JSON.stringify(payload)
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`)
  }
}

function broadcastStatus(status) {
  const changed = status !== currentStatus
  currentStatus = status
  if (changed) {
    console.log(`[bridge] status → ${status}`)
    eventLog.push({ status, source: lastSource, ts: Date.now() })
    if (eventLog.length > EVENT_LOG_MAX) eventLog.shift()
  }
  broadcast(currentPayload())
}

function updateHealthInfo(payload) {
  const recent = payload?.sessions?.recent
  if (!Array.isArray(recent) || recent.length === 0) return
  const top = recent[0]
  lastActiveAt = top.updatedAt ?? null
  lastSource   = parseSessionSource(top.key)
  broadcast(currentPayload())
}

// ── OpenClaw WebSocket Connection ─────────────────────────────────────────────
const identity = loadOrCreateDeviceIdentity()
console.log('[bridge] Device ID:', identity.deviceId)

let reconnectTimer = null

function connect() {
  const ws = new WebSocket(GATEWAY_URL)
  let connected = false

  ws.onopen = () => {
    console.log('[bridge] WebSocket connected')
  }

  ws.onmessage = (evt) => {
    let msg
    try { msg = JSON.parse(evt.data) } catch { return }

    // ── Challenge: respond with connect request ──
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce      = msg.payload.nonce
      const signedAtMs = Date.now()
      const role       = 'operator'
      const scopes     = ['operator.read']

      const payloadStr = buildDeviceAuthPayloadV3({
        deviceId:   identity.deviceId,
        clientId:   CLIENT_ID,
        clientMode: CLIENT_MODE,
        role, scopes,
        signedAtMs,
        token: GATEWAY_TOKEN,
        nonce,
        platform:     CLIENT_PLATFORM,
        deviceFamily: '',
      })
      const signature = signDevicePayload(identity.privateKeyPem, payloadStr)

      const req = {
        type: 'req',
        id:   crypto.randomUUID(),
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: { id: CLIENT_ID, version: '0.1.0', platform: CLIENT_PLATFORM, mode: CLIENT_MODE },
          role, scopes,
          caps: [], commands: [], permissions: {},
          auth: { token: GATEWAY_TOKEN },
          locale: 'zh-CN',
          userAgent: 'visible-openclaw/0.1.0',
          device: {
            id:        identity.deviceId,
            publicKey: publicKeyRawBase64UrlFromPem(identity.publicKeyPem),
            signature,
            signedAt:  signedAtMs,
            nonce,
          },
        },
      }
      ws.send(JSON.stringify(req))
      return
    }

    // ── Hello OK: connected ──
    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
      connected = true
      console.log('[bridge] Authenticated, protocol:', msg.payload.protocol)
      broadcastStatus('idle')
      return
    }

    // ── Connect error ──
    if (msg.type === 'res' && !msg.ok) {
      console.error('[bridge] Connect failed:', JSON.stringify(msg.error))
      return
    }

    // ── Events ──
    if (msg.type === 'event' && connected) {
      const ev = msg.event

      // Agent lifecycle: start → thinking, end → idle
      if (ev === 'agent') {
        const stream = msg.payload?.stream
        const phase  = msg.payload?.data?.phase
        if (stream === 'lifecycle' && phase === 'start') {
          broadcastStatus('thinking')
        } else if (stream === 'lifecycle' && phase === 'end') {
          broadcastStatus('idle')
        }
        return
      }

      // Chat final: fallback to idle (covers edge cases)
      if (ev === 'chat') {
        if (msg.payload?.state === 'final' && msg.payload?.message?.role === 'assistant') {
          broadcastStatus('idle')
        }
        return
      }

      // Tick: Gateway heartbeat, no business value
      if (ev === 'tick') return

      // Health: extract last active session info
      if (ev === 'health') {
        updateHealthInfo(msg.payload)
        return
      }

      // Session update: try to infer from active status
      if (ev === 'sessions.updated' || ev === 'session.updated') {
        const active = msg.payload?.active ?? msg.payload?.isActive
        if (active === true)  broadcastStatus('thinking')
        if (active === false) broadcastStatus('idle')
        return
      }

      // Shutdown: gateway is doing a planned restart, not an error
      if (ev === 'shutdown') {
        isRestarting = true
        console.log('[bridge] Gateway restarting:', msg.payload?.reason)
        return
      }

      // Presence: update connected nodes list
      if (ev === 'presence') {
        presenceList = (msg.payload?.presence ?? []).map(p => ({
          host: p.host,
          mode: p.mode,
          reason: p.reason,
        }))
        broadcast(currentPayload())
        return
      }

      // Unknown events: log for exploration
      console.log('[bridge] unhandled event:', ev, JSON.stringify(msg.payload))
    }
  }

  ws.onerror = (e) => {
    console.error('[bridge] WS error:', e.message)
    // onclose may not fire for handshake failures (non-101), so schedule reconnect here too
    if (!reconnectTimer) {
      broadcastStatus(isRestarting ? 'restarting' : 'error')
      connected = false
      isRestarting = false
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 3000)
    }
  }

  ws.onclose = (e) => {
    console.log(`[bridge] WS closed (${e.code}), reconnecting in 3s...`)
    broadcastStatus(isRestarting ? 'restarting' : 'error')
    connected = false
    isRestarting = false
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 3000)
    }
  }
}

connect()

// ── SSE HTTP Server ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.url === '/status') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx/proxy buffering
    })

    // Send current state immediately
    res.write(`data: ${JSON.stringify(currentPayload())}\n\n`)
    sseClients.add(res)

    // Heartbeat every 15s to keep connection alive through proxies/firewalls
    const heartbeat = setInterval(() => {
      if (res.destroyed) { clearInterval(heartbeat); return }
      res.write(`: ping\n\n`)
    }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      sseClients.delete(res)
    })
    return
  }

  res.writeHead(404); res.end('Not found')
})

server.listen(BRIDGE_PORT, () => {
  console.log(`[bridge] SSE server listening on http://localhost:${BRIDGE_PORT}/status`)
})
