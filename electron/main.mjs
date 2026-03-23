import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

let win = null
let tray = null
let alwaysOnTop = true

function createWindow() {
  win = new BrowserWindow({
    width: 200,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    // 右下角初始位置
    x: 1700,
    y: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173?overlay=1')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { overlay: '1' },
    })
  }

  // 右键菜单
  win.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: alwaysOnTop ? '取消置顶' : '始终置顶',
        click() {
          alwaysOnTop = !alwaysOnTop
          win.setAlwaysOnTop(alwaysOnTop)
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click() { app.quit() },
      },
    ])
    menu.popup()
  })

  win.on('closed', () => { win = null })
}

app.whenReady().then(() => {
  createWindow()

  // 最小化托盘图标（保证任务栏不出现）
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('VisibleOpenclaw')
  tray.on('click', () => {
    if (win) {
      win.isVisible() ? win.hide() : win.show()
    }
  })
})

// IPC: 允许渲染进程请求拖拽区域以外的穿透设置
ipcMain.on('set-ignore-mouse', (_, ignore) => {
  win?.setIgnoreMouseEvents(ignore, { forward: true })
})

app.on('window-all-closed', () => {
  app.quit()
})
