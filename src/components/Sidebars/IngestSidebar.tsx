/* eslint-disable no-nested-ternary, react/no-array-index-key */
import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ProgressEvent {
  stage: 'parsing' | 'extracting' | 'judging' | 'done' | 'error'
  message: string
  claimsFound?: number
  contradictionsFound?: number
}

interface IngestedDoc {
  name: string
  claimsFound: number
  contradictionsFound: number
  timestamp: string
}

// NOTA: ruta local a esta máquina — los PDFs viven en corpus-demo/ (gitignored,
// no se suben al repo por peso). Si movés el proyecto, ajustá esta ruta.
const CORPUS_FILES = [
  { label: 'CMPC Memoria 2022', path: 'C:\\claude\\coherence-demo\\corpus-demo\\CMPC_Memoria_2022.pdf', year: '2022' },
  { label: 'CMPC Memoria 2023', path: 'C:\\claude\\coherence-demo\\corpus-demo\\CMPC_Memoria_2023.pdf', year: '2023' },
  {
    label: 'Codelco Sustentabilidad 2022',
    path: 'C:\\claude\\coherence-demo\\corpus-demo\\Codelco_Sustentabilidad_2022.pdf',
    year: '2022',
  },
]

const STAGE_ICONS = {
  parsing: '📄',
  extracting: '🔍',
  judging: '⚖️',
  done: '✅',
  error: '❌',
}

const IngestSidebar: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [isIngesting, setIsIngesting] = useState(false)
  const [docs, setDocs] = useState<IngestedDoc[]>([])
  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = window.ipcRenderer.receive('coherence:ingest-progress', (p: ProgressEvent) => {
      setProgress(p)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const ingestFile = async (filepath: string) => {
    console.log('[coherence] ingestFile called with:', filepath)
    setIsIngesting(true)
    setProgress({ stage: 'parsing', message: 'Iniciando...' })

    const result = await window.coherence.ingest(filepath)

    if (result.success) {
      const name = filepath.split('/').pop() ?? filepath
      setDocs((prev) => [
        {
          name,
          claimsFound: result.claimsInserted ?? 0,
          contradictionsFound: result.contradictionsFound ?? 0,
          timestamp: new Date().toLocaleTimeString('es-CL'),
        },
        ...prev,
      ])
    }
    setIsIngesting(false)
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // webUtils.getPathForFile es el API correcto en Electron 32+
    const filepath = (window as any).electronWebUtils?.getPathForFile(file) ?? (file as any).path
    console.log('[coherence] file selected:', file.name, 'path:', filepath)
    if (filepath) {
      await ingestFile(filepath)
    } else {
      setProgress({ stage: 'error', message: 'No se pudo obtener el path del archivo' })
    }
    e.target.value = ''
  }

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filepath = (window as any).electronWebUtils?.getPathForFile(file) ?? (file as any).path
    if (filepath) await ingestFile(filepath)
  }

  const clearAll = async () => {
    await window.coherence.clear()
    setDocs([])
    setProgress(null)
  }

  return (
    <div className="flex h-full flex-col bg-[#191919] text-[#EDECE9]">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3">
        <p className="text-sm font-semibold text-[#EDECE9]">Ingerir documentos</p>
        <p className="mt-0.5 text-[11px] text-[#8a8a85]">PDF · Word · TXT</p>
      </div>

      {/* Input de archivo oculto — Electron expone el path real del archivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Corpus pre-cargado — botones para el demo */}
      <div className="px-3 pb-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6e6e6a]">Corpus del demo</p>
        <div className="space-y-1.5">
          {CORPUS_FILES.map((f) => {
            const alreadyDone = docs.some((d) => d.name === f.label)
            return (
              <button
                type="button"
                key={f.path}
                disabled={isIngesting || alreadyDone}
                onClick={() =>
                  ingestFile(f.path).then(() => {
                    setDocs((prev) =>
                      prev.map((d) => (d.name.startsWith(f.label.split(' ')[0]) ? { ...d, name: f.label } : d)),
                    )
                  })
                }
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                  alreadyDone
                    ? 'cursor-default border-[#165014]/60 bg-[#092008]/40 text-[#2c9f28]'
                    : isIngesting
                      ? 'cursor-wait border-white/5 bg-[#1c1c1c] text-[#6e6e6a]'
                      : 'cursor-pointer border-white/10 bg-[#1c1c1c] text-[#c9c9c5] hover:border-[#3ECF8E]/50 hover:bg-[#3ECF8E]/10 hover:text-[#EDECE9]'
                }`}
              >
                <span>{f.label}</span>
                <span className={`text-[10px] ${alreadyDone ? 'text-[#2c9f28]' : 'text-[#6e6e6a]'}`}>
                  {alreadyDone ? '✓ listo' : f.year}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-3 mb-2 border-t border-white/5" />

      {/* Drop zone */}
      <div className="px-3 pb-2">
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={isIngesting ? undefined : openFilePicker}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all ${
            isDragging
              ? 'border-[#3ECF8E] bg-[#3ECF8E]/10'
              : isIngesting
                ? 'cursor-wait border-white/10 bg-[#212121]/30'
                : 'border-white/10 bg-[#212121]/20 hover:border-white/25 hover:bg-[#212121]/40'
          }`}
        >
          <div className="mb-2 text-3xl">{isIngesting ? '⏳' : '📂'}</div>
          <p className="text-center text-xs text-[#a8a8a3]">
            {isIngesting
              ? 'Procesando...'
              : isDragging
                ? 'Soltá el archivo'
                : 'Arrastrá un PDF aquí\no hacé click para elegir'}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <AnimatePresence>
        {progress && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-3 overflow-hidden rounded-lg border border-white/5 bg-[#1c1c1c]"
          >
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <span className="text-base">{STAGE_ICONS[progress.stage]}</span>
                <span
                  className={`text-xs font-medium ${progress.stage === 'error' ? 'text-red-400' : progress.stage === 'done' ? 'text-[#2c9f28]' : 'text-[#3ECF8E]'}`}
                >
                  {progress.stage === 'done' ? 'Completado' : progress.stage === 'error' ? 'Error' : 'Procesando'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#a8a8a3]">{progress.message}</p>
              {progress.stage === 'done' &&
                progress.contradictionsFound !== undefined &&
                progress.contradictionsFound > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 py-1">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-red-500" />
                    <span className="text-[11px] font-medium text-red-400">
                      {progress.contradictionsFound} contradicción{progress.contradictionsFound > 1 ? 'es' : ''}{' '}
                      detectada{progress.contradictionsFound > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
            </div>
            {/* Progress bar animada */}
            {progress.stage !== 'done' && progress.stage !== 'error' && (
              <div className="h-0.5 w-full bg-[#212121]">
                <motion.div
                  className="h-full bg-[#3ECF8E]"
                  animate={{ width: ['0%', '90%'] }}
                  transition={{ duration: 8, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Documentos ingeridos */}
      {docs.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6e6e6a]">
              Procesados ({docs.length})
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-[#565652] transition-colors hover:text-red-400"
            >
              Limpiar todo
            </button>
          </div>
          <div className="space-y-2">
            {docs.map((doc, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/5 bg-[#1c1c1c] p-3"
              >
                <p className="truncate text-xs font-medium text-[#EDECE9]" title={doc.name}>
                  {doc.name}
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-[10px] text-[#8a8a85]">{doc.claimsFound} claims</span>
                  {doc.contradictionsFound > 0 && (
                    <span className="text-[10px] font-medium text-red-400">
                      ⚠ {doc.contradictionsFound} contradicciones
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-[#565652]">{doc.timestamp}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && !isIngesting && (
        <div className="flex flex-1 items-center justify-center">
          <p className="px-4 text-center text-[11px] text-[#565652]">
            Ingerí un documento para empezar a detectar contradicciones
          </p>
        </div>
      )}
    </div>
  )
}

export default IngestSidebar
