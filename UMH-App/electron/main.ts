import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SerialService } from './services/SerialService'
import { DeviceCommand, IPC_CHANNELS } from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const serialService = new SerialService()

function createWindow() {
  win = new BrowserWindow({
    title: 'UMH Host',
    icon: path.join(process.env.VITE_PUBLIC, 'umh-host.svg'),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false, // Ensure Node integration if needed, though contextBridge is safer
    },
  })

  serialService.setMainWindow(win)

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// IPC Handlers
ipcMain.handle(IPC_CHANNELS.SERIAL_LIST, async () => {
  return await serialService.listPorts()
})

ipcMain.handle(IPC_CHANNELS.SERIAL_CONNECT, async (_event, path, baudRate) => {
  try {
    await serialService.connect(path, baudRate)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle(IPC_CHANNELS.SERIAL_DISCONNECT, async () => {
  await serialService.disconnect()
  return { success: true }
})

ipcMain.on(IPC_CHANNELS.DEVICE_COMMAND, (_event, cmdType, payload) => {
  if (payload) {
    const buffer = Buffer.from(payload)
    if (cmdType === DeviceCommand.PING && buffer.length >= 1) {
      serialService.sendPingWithEchoedByte(buffer[0])
      return
    }
    serialService.sendCommand(cmdType, buffer)
  } else {
    serialService.sendCommand(cmdType)
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
