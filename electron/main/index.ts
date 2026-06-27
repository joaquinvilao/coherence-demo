import { release, homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { config as dotenvConfig } from 'dotenv'

import { app, BrowserWindow } from 'electron'
import Store from 'electron-store'

import errorToStringMainProcess from './common/error'
import WindowsManager from './common/windowManager'
import { registerStoreHandlers } from './electron-store/ipcHandlers'
import { StoreSchema } from './electron-store/storeConfig'
import registerElectronUtilsHandlers from './electron-utils/ipcHandlers'
import registerFileHandlers from './filesystem/ipcHandlers'
import { ollamaService, registerLLMSessionHandlers } from './llm/ipcHandlers'
import registerPathHandlers from './path/ipcHandlers'
import { registerDBSessionHandlers } from './vector-database/ipcHandlers'
import registerCoherenceHandlers from './coherence/ipcHandlers'

// Cargar .env desde el directorio del proyecto (solo en dev)
dotenvConfig({ path: join(__dirname, '../../.env') })

const store = new Store<StoreSchema>()
const windowsManager = new WindowsManager()

// Pre-configurar vault y embedding model para saltarse el onboarding de Reor
// Usamos string literals para evitar problemas con el bundler
const demoCorpusDir = join(homedir(), 'coherence-demo-corpus')
try {
  mkdirSync(demoCorpusDir, { recursive: true })
} catch (_e) {
  // directory may already exist
}
if (!store.get('user.directoryFromPreviousSession')) {
  store.set('user.directoryFromPreviousSession', demoCorpusDir)
}
if (!store.get('defaultEmbeddingModelAlias')) {
  store.set('defaultEmbeddingModelAlias', 'Xenova/bge-small-en-v1.5')
  store.set('embeddingModels', {
    'Xenova/bge-small-en-v1.5': {
      type: 'repo',
      repoName: 'Xenova/bge-small-en-v1.5',
      readableName: 'BGE Small (demo)',
    },
  })
}

process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Disable GPU acceleration for macOS 21.6
if (process.platform === 'darwin' && release().startsWith('21.6')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')
app.whenReady().then(async () => {
  await ollamaService.init()
  windowsManager.createWindow(store, preload, url, indexHtml)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  ollamaService.stop()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    windowsManager.createWindow(store, preload, url, indexHtml)
  }
})

process.on('uncaughtException', (error: Error) => {
  windowsManager.appendNewErrorToDisplayInWindow(errorToStringMainProcess(error))
})

process.on('unhandledRejection', (reason: unknown) => {
  windowsManager.appendNewErrorToDisplayInWindow(errorToStringMainProcess(reason))
})

registerLLMSessionHandlers(store)
registerDBSessionHandlers(store, windowsManager)
registerStoreHandlers(store, windowsManager)
registerFileHandlers(store, windowsManager)
registerElectronUtilsHandlers(store, windowsManager, preload, url, indexHtml)
registerPathHandlers()
try {
  registerCoherenceHandlers()
  console.log('[coherence] handlers registered OK')
} catch (e) {
  console.error('[coherence] FAILED to register handlers:', e)
}
