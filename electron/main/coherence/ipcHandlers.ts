import { ipcMain, BrowserWindow, dialog } from 'electron'
import { ingestDocument } from './pipeline'
import { getGraphData, getContradictions, getDateRange, clearDb } from './db'
import { askBrain } from './brain'

function registerCoherenceHandlers() {
  // Ingerir un documento y emitir progreso
  ipcMain.handle('coherence:ingest', async (event, filepath: string) => {
    const onProgress = (progress: object) => {
      event.sender.send('coherence:ingest-progress', progress)
    }

    try {
      const result = await ingestDocument(filepath, onProgress)
      // Notificar al grafo que hay datos nuevos
      event.sender.send('coherence:graph-updated')
      return { success: true, ...result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Datos del grafo para react-force-graph-2d
  ipcMain.handle('coherence:graph-data', () => getGraphData())

  // Solo las contradicciones (para el panel lateral)
  ipcMain.handle('coherence:contradictions', () => getContradictions())

  // Rango de fechas para el timeline scrubber
  ipcMain.handle('coherence:date-range', () => getDateRange())

  // Resetear la DB
  ipcMain.handle('coherence:clear', () => {
    clearDb()
    return { success: true }
  })

  // Brain Q&A: pregunta en lenguaje natural → respuesta + claims citados + contradicciones reveladas
  ipcMain.handle('coherence:ask-brain', async (_event, question: string) => {
    try {
      const result = await askBrain(question)
      return { success: true, ...result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Abrir file picker nativo
  ipcMain.handle('coherence:open-file-dialog', async (event) => {
    const browserWin = BrowserWindow.fromWebContents(event.sender)
    if (!browserWin) return null
    const result = await dialog.showOpenDialog(browserWin, {
      title: 'Seleccionar documento',
      properties: ['openFile'],
      filters: [{ name: 'Documentos', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
export default registerCoherenceHandlers
