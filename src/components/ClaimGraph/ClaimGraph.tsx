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
  team?: string
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
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

// Paleta monocromática profesional:
//   - Default: gris azulado
//   - Con contradicción: rojo
//   - Seleccionado: azul
//   - Fuera del time-travel activo: gris más oscuro
const NODE_DEFAULT = '#94a3b8'
const NODE_CONTRADICTION = '#ef4444'
const NODE_SELECTED = '#3b82f6'

function nodeColor(node: GraphNode, contradictedIds: Set<string>, selectedId: string | null): string {
  if (selectedId === node.id) return NODE_SELECTED
  if (contradictedIds.has(node.id)) return NODE_CONTRADICTION
  return NODE_DEFAULT
}

const ClaimGraph: React.FC = () => {
  const [ForceGraph, setForceGraph] = useState<any>(null)
  const [nodes, setNodes] = useState<GraphNode[]>(DEMO_NODES)
  const [links, setLinks] = useState<GraphLink[]>(DEMO_LINKS)
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [filter, setFilter] = useState<'all' | 'contradiction' | 'entailment'>('all')
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ w: 600, h: 400 })

  useEffect(() => {
    import('react-force-graph-3d').then((mod) => setForceGraph(() => mod.default))
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

  // Config exacta de DeusData/codebase-memory-mcp GraphScene.tsx:
  // camera={{ position: [0, 0, 800], fov: 50, near: 0.1, far: 100000 }}
  // OrbitControls: damping 0.08, rotate 0.5, zoom 1.5, min/max 10/50000
  useEffect(() => {
    if (!ForceGraph || !graphRef.current) return
    const g = graphRef.current
    const cam = g.camera?.()
    if (cam) {
      cam.fov = 50
      cam.near = 0.1
      cam.far = 100000
      cam.updateProjectionMatrix?.()
    }
    g.cameraPosition?.({ x: 0, y: 0, z: 800 }, { x: 0, y: 0, z: 0 }, 0)
    const ctrl = g.controls?.()
    if (ctrl) {
      ctrl.enableDamping = true
      ctrl.dampingFactor = 0.08
      ctrl.rotateSpeed = 0.5
      ctrl.zoomSpeed = 1.5
      ctrl.minDistance = 10
      ctrl.maxDistance = 50000
      ctrl.autoRotateSpeed = 0.4
    }
  }, [ForceGraph])

  // Auto-rotación tras 15s sin interacción (estilo DeusData)
  useEffect(() => {
    if (!ForceGraph || !graphRef.current) return undefined
    const controls = graphRef.current.controls?.()
    if (!controls) return undefined

    const IDLE_MS = 15_000
    let lastInteraction = Date.now()
    controls.autoRotateSpeed = 0.5

    const reset = () => {
      lastInteraction = Date.now()
      controls.autoRotate = false
    }

    const canvas = containerRef.current?.querySelector('canvas')
    canvas?.addEventListener('pointerdown', reset)
    canvas?.addEventListener('wheel', reset, { passive: true })

    const tick = setInterval(() => {
      const idle = Date.now() - lastInteraction > IDLE_MS
      if (idle && !controls.autoRotate) controls.autoRotate = true
    }, 1000)

    return () => {
      clearInterval(tick)
      canvas?.removeEventListener('pointerdown', reset)
      canvas?.removeEventListener('wheel', reset)
    }
  }, [ForceGraph])

  // Camera fly-to al hacer click en un nodo
  const flyToNode = useCallback((node: GraphNode) => {
    const g = graphRef.current
    if (!g || node.x === undefined || node.y === undefined || node.z === undefined) return
    const d = Math.hypot(node.x, node.y, node.z) || 1
    const dist = 90
    const ratio = (d + dist) / d
    g.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      1200,
    )
  }, [])

  // Escuchar evento del chat (BrainSidebar dispara coherence:focus-claim al clickear un chip)
  useEffect(() => {
    if (!ForceGraph) return undefined
    const handler = (e: Event) => {
      const claimId = (e as CustomEvent).detail?.claimId
      if (!claimId) return
      const node = nodes.find((n) => n.id === claimId)
      if (node) {
        setSelected({ type: 'node', data: node })
        flyToNode(node)
      }
    }
    window.addEventListener('coherence:focus-claim', handler)
    return () => window.removeEventListener('coherence:focus-claim', handler)
  }, [ForceGraph, nodes, flyToNode])

  // Posicionamiento DETERMINISTA estilo DeusData:
  // En vez de simulación física (que colapsa los nodos al origen con corpus chico),
  // distribuimos los nodos en una esfera con golden spiral (Fibonacci sphere).
  // DeusData hace algo parecido: recibe posiciones pre-calculadas del backend C++.
  // Pausamos la simulación d3 para que no vuelva a moverlos.
  useEffect(() => {
    if (!ForceGraph || !graphRef.current) return undefined
    const g = graphRef.current
    const SPHERE_RADIUS = 200
    const apply = () => {
      const scene = g.scene?.()
      const groups: any[] = []
      scene?.traverse?.((o: any) => {
        if (o.type === 'Group' && o.position) groups.push(o)
      })
      if (groups.length === 0) return
      groups.forEach((o, i) => {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / groups.length)
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5)
        o.position.set(
          SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta),
          SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta),
          SPHERE_RADIUS * Math.cos(phi),
        )
      })
      g.pauseAnimation?.()
    }
    // Esperar a que el ForceGraph monte los grupos de nodos en el scene
    const timer = setTimeout(apply, 1500)
    return () => clearTimeout(timer)
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

  const visibleLinks = links.filter((l) => {
    if (filter === 'all') return l.relation !== 'neutral'
    return l.relation === filter
  })

  const visibleNodes = nodes

  // graphData memoizado — react-force-graph-3d compara por referencia y
  // si pasamos un objeto nuevo en cada render, ignora el cambio.
  const graphData = useMemo(() => ({ nodes: visibleNodes, links: visibleLinks }), [visibleNodes, visibleLinks])

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

  // IDs de nodos que participan en alguna contradicción (para colorearlos en rojo)
  const contradictedIds = useMemo(() => {
    const set = new Set<string>()
    for (const l of visibleLinks) {
      if (l.relation !== 'contradiction') {
        // eslint-disable-next-line no-continue
        continue
      }
      const s = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
      const t = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
      set.add(s)
      set.add(t)
    }
    return set
  }, [visibleLinks])

  const selectedId = selected?.type === 'node' ? (selected.data as GraphNode).id : null

  const getLinkColor = useCallback((link: GraphLink) => {
    if (link.relation === 'contradiction') return '#ef4444'
    if (link.relation === 'entailment') return '#2c9f28'
    return 'rgba(148,163,184,0.15)'
  }, [])

  return (
    <div className="flex size-full select-none flex-col bg-[#141414] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1a1a] px-4 py-2">
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
      <div className="flex items-center gap-4 border-b border-white/5 bg-[#141414]/80 px-4 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
          <span className="inline-block size-2 rounded-full" style={{ background: NODE_DEFAULT }} />
          claim
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
          <span className="inline-block size-2 rounded-full" style={{ background: NODE_CONTRADICTION }} />
          con contradicción
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
          <span className="inline-block size-2 rounded-full" style={{ background: NODE_SELECTED }} />
          seleccionado
        </span>
        <span className="ml-auto flex items-center gap-3 text-[10px] text-neutral-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-4 bg-red-500/60" />
            contradicción
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-4 bg-[#2c9f28]/70" />
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
                graphData={graphData}
                width={dimensions.w}
                height={dimensions.h}
                backgroundColor="#141414"
                showNavInfo={false}
                nodeColor={(node: GraphNode) => nodeColor(node, contradictedIds, selectedId)}
                nodeVal={(node: GraphNode) => Math.max(8, Math.min(20, 8 + (nodeDegrees.get(node.id) ?? 0) * 0.8))}
                nodeOpacity={1}
                nodeResolution={12}
                nodeLabel={(node: GraphNode) =>
                  `<div style="background:#0d1117;color:#fff;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);font-size:11px;font-family:Inter,sans-serif;max-width:240px">
                    <div style="opacity:0.5;font-size:9px;margin-bottom:2px">${DOC_LABELS[node.doc_title] ?? node.doc_title} · ${node.valid_at?.slice(0, 4) ?? ''}</div>
                    <div><span style="opacity:0.6">${node.subject}</span> <span style="opacity:0.4">${node.predicate}</span> <span style="font-weight:600">${node.object}</span></div>
                  </div>`
                }
                linkColor={getLinkColor}
                linkWidth={(l: GraphLink) => (l.relation === 'contradiction' ? 0.8 : 0.4)}
                linkOpacity={0.6}
                linkDirectionalParticles={(l: GraphLink) => (l.relation === 'contradiction' ? 3 : 0)}
                linkDirectionalParticleColor={() => '#ef4444'}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleSpeed={0.006}
                linkResolution={6}
                onNodeClick={(node: GraphNode) => {
                  setSelected({ type: 'node', data: node })
                  flyToNode(node)
                }}
                onLinkClick={(link: GraphLink) => setSelected({ type: 'link', data: link })}
                onBackgroundClick={() => setSelected(null)}
                cooldownTicks={0}
                warmupTicks={0}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                controlType="orbit"
                enableNavigationControls
              />
            )}

            {/* Panel de detalle */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className="bg-[#1a1a1a]/98 absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-white/5 p-4 backdrop-blur-sm"
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
    </div>
  )
}

export default ClaimGraph
