/* eslint-disable react/no-array-index-key, no-nested-ternary */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface GraphNode {
  id: string
  label: string
  subject: string
  predicate: string
  object: string
  valid_at: string | null
  invalid_at: string | null
  doc_title: string
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  relation: 'contradiction' | 'entailment' | 'neutral'
  explanation: string
}

interface SelectedItem {
  type: 'node' | 'link'
  data: GraphNode | GraphLink
}

const DOC_COLORS: Record<string, string> = {
  CMPC_Memoria_2022: '#f97316',
  CMPC_Memoria_2023: '#3b82f6',
  Codelco_Sustentabilidad_2022: '#a855f7',
}
const DOC_LABELS: Record<string, string> = {
  CMPC_Memoria_2022: 'Memoria CMPC 2022',
  CMPC_Memoria_2023: 'Memoria CMPC 2023',
  Codelco_Sustentabilidad_2022: 'Codelco Sustentabilidad 2022',
}
const DEFAULT_COLOR = '#6b7280'

const DEMO_NODES: GraphNode[] = [
  {
    id: '1',
    label: 'Carbono neutralidad 2040',
    subject: 'CMPC',
    predicate: 'meta carbono neutralidad',
    object: 'año 2040',
    valid_at: '2022-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2022',
  },
  {
    id: '2',
    label: 'Carbono neutralidad 2050',
    subject: 'CMPC',
    predicate: 'meta carbono neutralidad',
    object: 'año 2050',
    valid_at: '2023-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2023',
  },
  {
    id: '3',
    label: 'Emisiones -40% al 2030',
    subject: 'CMPC',
    predicate: 'reducción emisiones Scope 1',
    object: '40% para 2030',
    valid_at: '2022-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2022',
  },
  {
    id: '4',
    label: 'Emisiones -50% al 2030',
    subject: 'CMPC',
    predicate: 'reducción emisiones Scope 1',
    object: '50% para 2030',
    valid_at: '2023-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2023',
  },
  {
    id: '5',
    label: 'Agua 2.8 m³/t',
    subject: 'CMPC',
    predicate: 'consumo agua',
    object: '2.8 m³/t',
    valid_at: '2022-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2022',
  },
  {
    id: '6',
    label: 'Agua 2.6 m³/t',
    subject: 'CMPC',
    predicate: 'consumo agua',
    object: '2.6 m³/t',
    valid_at: '2023-01-01',
    invalid_at: null,
    doc_title: 'CMPC_Memoria_2023',
  },
  {
    id: '7',
    label: 'Codelco 1.4 Mt cobre',
    subject: 'Codelco',
    predicate: 'producción cobre',
    object: '1.4 millones t',
    valid_at: '2022-01-01',
    invalid_at: null,
    doc_title: 'Codelco_Sustentabilidad_2022',
  },
  {
    id: '8',
    label: 'Accidentabilidad 2.1',
    subject: 'Codelco',
    predicate: 'tasa accidentabilidad',
    object: '2.1',
    valid_at: '2022-01-01',
    invalid_at: null,
    doc_title: 'Codelco_Sustentabilidad_2022',
  },
]

const DEMO_LINKS: GraphLink[] = [
  {
    source: '1',
    target: '2',
    relation: 'contradiction',
    explanation: 'CMPC declaró meta de carbono neutralidad para 2040 en 2022 y para 2050 en 2023.',
  },
  {
    source: '3',
    target: '4',
    relation: 'contradiction',
    explanation: 'Meta de reducción de emisiones Scope 1 cambió de 40% a 50% entre memorias.',
  },
  {
    source: '5',
    target: '6',
    relation: 'entailment',
    explanation: 'Mejora progresiva en consumo de agua: de 2.8 a 2.6 m³/t.',
  },
]

function nodeColor(node: GraphNode, timeTravelActive: boolean, date: string): string {
  if (timeTravelActive) {
    const active = !node.invalid_at || node.invalid_at > date
    return active ? (DOC_COLORS[node.doc_title] ?? DEFAULT_COLOR) : '#374151'
  }
  return DOC_COLORS[node.doc_title] ?? DEFAULT_COLOR
}

const ClaimGraph: React.FC = () => {
  const [ForceGraph, setForceGraph] = useState<any>(null)
  const [nodes, setNodes] = useState<GraphNode[]>(DEMO_NODES)
  const [links, setLinks] = useState<GraphLink[]>(DEMO_LINKS)
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [timelineDate, setTimelineDate] = useState<string>('2023-12-31')
  const [timeTravelActive, setTimeTravelActive] = useState(false)
  const [filter, setFilter] = useState<'all' | 'contradiction' | 'entailment'>('all')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ w: 600, h: 400 })

  useEffect(() => {
    import('react-force-graph-2d').then((mod) => setForceGraph(() => mod.default))
  }, [])

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDimensions({ w: width, h: height })
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Exponer graphRef al window para zoomToFit desde CDP (dev only)
  useEffect(() => {
    ;(window as any).__graphRef = graphRef
  }, [])

  // Fuerzas D3 estilo Obsidian
  useEffect(() => {
    if (!graphRef.current) return
    const charge = graphRef.current.d3Force('charge')
    const link = graphRef.current.d3Force('link')
    // Repulsión muy suave para que el grafo quede compacto
    if (charge) charge.strength(-15)
    // Links cortos y fuertes — los nodos conectados se agrupan
    if (link) link.distance(25).strength(0.8)
    // Gravedad hacia el centro: evita que nodos se vayan al infinito
    graphRef.current.d3Force('gravity', (alpha: number) => {
      const g = graphRef.current
      if (!g) return
      // Acceder a los nodos del simulador vía el grafo
      const graphNodes: any[] =
        g
          .d3Force('link')
          ?.links?.()
          ?.flatMap((l: any) => [l.source, l.target]) ?? []
      const seen = new Set()
      for (const n of graphNodes) {
        if (!n || seen.has(n.id)) {
          // eslint-disable-next-line no-continue
          continue
        }
        seen.add(n.id)
        n.vx = (n.vx ?? 0) - (n.x ?? 0) * alpha * 0.02
        n.vy = (n.vy ?? 0) - (n.y ?? 0) * alpha * 0.02
      }
    })
    graphRef.current.d3ReheatSimulation?.()
  }, [ForceGraph, nodes.length])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await window.coherence.getGraphData()
        if ((data.nodes as any[]).length > 0) {
          setNodes(data.nodes as GraphNode[])
          setLinks(data.links as GraphLink[])
        }
      } catch (_e) {
        // coherence API not available in dev without data
      }
    }
    load()
    const unsub = window.ipcRenderer.receive('coherence:graph-updated', load)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const timeFilteredNodes = nodes.filter((n) => {
    if (!timeTravelActive) return true
    return (!n.valid_at || n.valid_at <= timelineDate) && (!n.invalid_at || n.invalid_at > timelineDate)
  })
  const timeFilteredIds = new Set(timeFilteredNodes.map((n) => n.id))

  const visibleLinks = links.filter((l) => {
    const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
    const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
    if (!timeFilteredIds.has(sid) || !timeFilteredIds.has(tid)) return false
    if (filter === 'all') return l.relation !== 'neutral'
    return l.relation === filter
  })

  // Solo mostrar nodos que tienen al menos un link visible (los aislados no aportan)
  const linkedIds = useMemo(
    () =>
      new Set([
        ...visibleLinks.map((l) => (typeof l.source === 'string' ? l.source : (l.source as GraphNode).id)),
        ...visibleLinks.map((l) => (typeof l.target === 'string' ? l.target : (l.target as GraphNode).id)),
      ]),
    [visibleLinks],
  )

  const visibleNodes = timeFilteredNodes.filter((n) => linkedIds.has(n.id))

  // Grado de cada nodo (para escalar el radio como Obsidian)
  const nodeDegrees = useMemo(() => {
    const deg = new Map<string, number>()
    for (const l of visibleLinks) {
      const s = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
      const t = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
      deg.set(s, (deg.get(s) ?? 0) + 1)
      deg.set(t, (deg.get(t) ?? 0) + 1)
    }
    return deg
  }, [visibleLinks])

  const contradictions = links.filter((l) => l.relation === 'contradiction')

  // Estilo Obsidian: nodo pequeño + etiqueta debajo
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color = nodeColor(node, timeTravelActive, timelineDate)
      const isActive = !timeTravelActive || !node.invalid_at || node.invalid_at > timelineDate
      const degree = nodeDegrees.get(node.id) ?? 0
      const r = Math.max(3, Math.min(7, 3 + degree * 0.35))

      // Círculo relleno
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = isActive ? color : '#374151'
      ctx.fill()

      // Etiqueta — siempre visible como Obsidian, escala con zoom
      if (isActive && globalScale > 0.5) {
        const label = `${node.subject} ${node.object}`.slice(0, 28)
        const fontSize = Math.max(3, Math.min(10, 5 / globalScale))
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        // Sombra de texto para legibilidad
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillText(label, node.x! + 0.5, node.y! + r + 2.5)
        ctx.fillStyle = isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)'
        ctx.fillText(label, node.x!, node.y! + r + 2)
      }
    },
    [timeTravelActive, timelineDate, nodeDegrees],
  )

  const getLinkColor = useCallback((link: GraphLink) => {
    if (link.relation === 'contradiction') return 'rgba(239,68,68,0.45)'
    if (link.relation === 'entailment') return 'rgba(34,197,94,0.35)'
    return 'rgba(107,114,128,0.15)'
  }, [])

  const dateMin = '2022-01-01'
  const dateMax = '2024-12-31'

  return (
    <div className="flex size-full select-none flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#0d1117] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight text-white">Grafo de Claims</span>
          {contradictions.length > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-red-500/30"
            >
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-red-500" />
              {contradictions.length} contradiccion{contradictions.length > 1 ? 'es' : ''}
            </motion.span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="mr-2 flex rounded-md bg-white/5 p-0.5">
            {(['graph', 'list'] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 text-xs transition-all ${view === v ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                {v === 'graph' ? '⬡ Grafo' : '≡ Lista'}
              </button>
            ))}
          </div>
          {(['all', 'contradiction', 'entailment'] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 text-xs transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
            >
              {/* eslint-disable-next-line no-nested-ternary */}
              {f === 'all' ? 'Todas' : f === 'contradiction' ? '🔴' : '🟢'}
            </button>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 border-b border-white/5 bg-[#0d1117]/80 px-4 py-1.5">
        {Object.entries(DOC_COLORS).map(([doc, color]) => (
          <span key={doc} className="flex items-center gap-1.5 text-[10px] text-neutral-500">
            <span className="inline-block size-2 rounded-full" style={{ background: color }} />
            {DOC_LABELS[doc] ?? doc}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[10px] text-neutral-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-4 bg-red-500/60" />
            contradicción
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-4 bg-green-500/60" />
            consistencia
          </span>
        </span>
      </div>

      {/* Área principal */}
      <div className="relative flex-1 overflow-hidden" ref={containerRef}>
        {view === 'graph' ? (
          <>
            {ForceGraph && (
              <ForceGraph
                ref={graphRef}
                graphData={{ nodes: visibleNodes, links: visibleLinks }}
                width={dimensions.w}
                height={dimensions.h}
                backgroundColor="#0d1117"
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => 'replace'}
                nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
                  ctx.beginPath()
                  ctx.arc(node.x!, node.y!, 12, 0, 2 * Math.PI)
                  ctx.fillStyle = color
                  ctx.fill()
                }}
                linkColor={getLinkColor}
                linkWidth={(l: GraphLink) => (l.relation === 'contradiction' ? 1 : 0.6)}
                linkDirectionalParticles={(l: GraphLink) => (l.relation === 'contradiction' ? 2 : 0)}
                linkDirectionalParticleColor={() => 'rgba(239,68,68,0.8)'}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkCurvature={0.1}
                onNodeClick={(node: GraphNode) => setSelected({ type: 'node', data: node })}
                onLinkClick={(link: GraphLink) => setSelected({ type: 'link', data: link })}
                onBackgroundClick={() => setSelected(null)}
                onEngineStop={() => graphRef.current?.zoomToFit?.(400, 60)}
                cooldownTicks={200}
                warmupTicks={50}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
              />
            )}

            {/* Banner time-travel */}
            <AnimatePresence>
              {timeTravelActive && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
                >
                  <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-500/30 bg-blue-950/80 px-4 py-1.5 text-sm backdrop-blur">
                    <span className="text-blue-400">🕐</span>
                    <span className="font-medium text-blue-200">
                      {new Date(timelineDate).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-blue-400 underline underline-offset-2 hover:text-blue-200"
                      onClick={() => setTimeTravelActive(false)}
                    >
                      Volver al presente
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Panel de detalle */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className="bg-[#0d1117]/98 absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-white/5 p-4 backdrop-blur-sm"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                      {selected.type === 'link' ? 'Relación' : 'Afirmación'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="text-sm text-neutral-700 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {selected.type === 'link' &&
                    (() => {
                      const link = selected.data as GraphLink
                      const srcNode = nodes.find(
                        (n) => n.id === (typeof link.source === 'string' ? link.source : (link.source as GraphNode).id),
                      )
                      const tgtNode = nodes.find(
                        (n) => n.id === (typeof link.target === 'string' ? link.target : (link.target as GraphNode).id),
                      )
                      const isContra = link.relation === 'contradiction'
                      return (
                        <div className="space-y-4">
                          <div
                            className={`flex items-center gap-2 rounded-lg p-3 ${isContra ? 'bg-red-500/10 ring-1 ring-red-500/20' : 'bg-green-500/10 ring-1 ring-green-500/20'}`}
                          >
                            <span className="text-xl">{isContra ? '⚠️' : '✅'}</span>
                            <div>
                              <p className={`text-sm font-semibold ${isContra ? 'text-red-400' : 'text-green-400'}`}>
                                {isContra ? 'Contradicción detectada' : 'Soporte / consistencia'}
                              </p>
                              <p className="mt-0.5 text-xs text-neutral-400">{link.explanation}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {[srcNode, tgtNode].filter(Boolean).map((n, i) => {
                              // eslint-disable-next-line no-nested-ternary
                              const borderClass =
                                i === 0 ? 'border-white/10' : isContra ? 'border-red-500/30' : 'border-green-500/30'
                              return (
                                // eslint-disable-next-line react/no-array-index-key
                                <div key={i} className={`rounded-lg border p-3 ${borderClass}`}>
                                  <div className="mb-2 flex items-center gap-2">
                                    <span
                                      className="inline-block size-2 rounded-full"
                                      style={{ background: DOC_COLORS[n!.doc_title] ?? DEFAULT_COLOR }}
                                    />
                                    <span className="text-[10px] text-neutral-500">
                                      {DOC_LABELS[n!.doc_title] ?? n!.doc_title} · {n!.valid_at?.slice(0, 4)}
                                    </span>
                                  </div>
                                  <p className="text-xs leading-relaxed text-white">
                                    <span className="text-neutral-400">{n!.subject}</span>{' '}
                                    <span className="text-neutral-500">{n!.predicate}</span>{' '}
                                    <span className="font-medium">{n!.object}</span>
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                  {selected.type === 'node' &&
                    (() => {
                      const node = selected.data as GraphNode
                      const color = DOC_COLORS[node.doc_title] ?? DEFAULT_COLOR
                      return (
                        <div className="space-y-4">
                          <div className="rounded-lg border border-white/10 p-3">
                            <div className="mb-3 flex items-center gap-2">
                              <span className="inline-block size-2.5 rounded-full" style={{ background: color }} />
                              <span className="text-[10px] text-neutral-500">
                                {DOC_LABELS[node.doc_title] ?? node.doc_title} · {node.valid_at?.slice(0, 4)}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-white">{node.subject}</p>
                            <p className="mt-1 text-xs text-neutral-400">{node.predicate}</p>
                            <p className="mt-2 text-sm font-medium" style={{ color }}>
                              {node.object}
                            </p>
                          </div>
                        </div>
                      )
                    })()}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="h-full space-y-3 overflow-y-auto p-4">
            <p className="mb-4 text-xs text-neutral-600">
              {contradictions.length} contradiccion{contradictions.length !== 1 ? 'es' : ''} detectadas
            </p>
            {contradictions.map((link, i) => {
              const sid = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id
              const tid = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id
              const srcNode = nodes.find((n) => n.id === sid)
              const tgtNode = nodes.find((n) => n.id === tid)
              return (
                // eslint-disable-next-line react/no-array-index-key
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="cursor-pointer rounded-lg border border-red-500/20 bg-red-500/5 p-4 transition-colors hover:border-red-500/40"
                  onClick={() => {
                    setSelected({ type: 'link', data: link })
                    setView('graph')
                  }}
                >
                  <div className="mb-3 flex items-start gap-2">
                    <span className="mt-0.5 text-red-500">⚠</span>
                    <p className="text-xs leading-relaxed text-neutral-300">{link.explanation}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[srcNode, tgtNode].filter(Boolean).map((n, j) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={j} className="bg-white/3 rounded border border-white/5 p-2">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: DOC_COLORS[n!.doc_title] ?? DEFAULT_COLOR }}
                          />
                          <span className="text-[9px] text-neutral-600">{n!.valid_at?.slice(0, 4)}</span>
                        </div>
                        <p className="text-[10px] leading-tight text-neutral-400">
                          {n!.subject} {n!.predicate}
                          <span className="block font-medium text-white">{n!.object}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Timeline scrubber */}
      <div className="border-t border-white/5 bg-[#0d1117] px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-neutral-600">Timeline bi-temporal</span>
          {timeTravelActive && (
            <span className="text-[10px] font-medium text-blue-400">
              {new Date(timelineDate).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 text-right text-[10px] text-neutral-600">2022</span>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 flex w-full items-center">
              {['2022', '2023', '2024'].map((y, i) => (
                <div key={y} className="absolute h-2 w-px bg-white/10" style={{ left: `${(i / 2) * 100}%` }} />
              ))}
            </div>
            <input
              type="range"
              min={new Date(dateMin).getTime()}
              max={new Date(dateMax).getTime()}
              value={new Date(timelineDate).getTime()}
              onChange={(e) => {
                setTimelineDate(new Date(Number(e.target.value)).toISOString().slice(0, 10))
                setTimeTravelActive(true)
              }}
              className="relative w-full cursor-pointer accent-blue-500"
              style={{ background: 'transparent' }}
            />
          </div>
          <span className="w-8 text-[10px] text-neutral-600">2024</span>
          <button
            type="button"
            onClick={() => setTimeTravelActive(!timeTravelActive)}
            className={`ml-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              timeTravelActive
                ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/30'
                : 'bg-white/5 text-neutral-500 hover:bg-white/10 hover:text-neutral-300'
            }`}
          >
            {timeTravelActive ? '🕐 Activo' : 'Time-travel'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClaimGraph
