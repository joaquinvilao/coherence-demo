/* eslint-disable react/no-array-index-key, no-nested-ternary */
import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Claim {
  id: string
  subject: string
  predicate: string
  object: string
  valid_at: string | null
  document_id: string
}

interface Relation {
  claim_a_id: string
  claim_b_id: string
  relation: 'contradiction' | 'entailment' | 'neutral'
  explanation: string
}

interface BrainResponse {
  success: boolean
  answer?: string
  citedClaims?: Claim[]
  contradictionsRevealed?: Relation[]
  retrievedClaimIds?: string[]
  error?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  citedClaims?: Claim[]
  contradictionsRevealed?: Relation[]
  isError?: boolean
}

const DEMO_QUESTIONS = [
  '¿Cuál es la meta de carbono neutralidad de CMPC?',
  '¿Cuánta agua consume CMPC por tonelada?',
  '¿Cuál es la meta de reducción de emisiones Scope 1?',
  '¿Qué dice Codelco sobre producción de cobre?',
]

const BrainSidebar: React.FC = () => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendQuestion = async (question: string) => {
    if (!question.trim() || isLoading) return
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setInput('')
    setIsLoading(true)

    try {
      const res = (await window.coherence.askBrain(question)) as BrainResponse
      if (res.success && res.answer) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: res.answer ?? '',
            citedClaims: (res.citedClaims as Claim[] | undefined) ?? [],
            contradictionsRevealed: (res.contradictionsRevealed as Relation[] | undefined) ?? [],
          },
        ])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.error ?? 'Error desconocido', isError: true }])
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${String(e)}`, isError: true }])
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendQuestion(input)
  }

  const focusOnClaim = (claimId: string) => {
    window.dispatchEvent(new CustomEvent('coherence:focus-claim', { detail: { claimId } }))
  }

  return (
    <div className="flex h-full flex-col bg-dark-gray-c-eleven text-[#EDECE9]">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <p className="text-sm font-semibold text-[#EDECE9]">Preguntale al Brain</p>
        </div>
        <p className="mt-0.5 text-[11px] text-[#8a8a85]">Q&A sobre el corpus, con alertas de contradicciones</p>
      </div>

      {/* Mensajes / Preguntas guion */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#8a8a85]">Probá una de estas preguntas:</p>
            <div className="space-y-1.5">
              {DEMO_QUESTIONS.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => sendQuestion(q)}
                  disabled={isLoading}
                  className="block w-full rounded-lg border border-white/5 bg-[#1c1c1c] px-3 py-2 text-left text-xs text-[#c9c9c5] transition-all hover:border-[#3ECF8E]/50 hover:bg-[#3ECF8E]/10 hover:text-[#EDECE9]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#3ECF8E]/20 text-[#c9f5e2] ring-1 ring-[#3ECF8E]/30'
                  : msg.isError
                    ? 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30'
                    : 'bg-[#1c1c1c] text-[#e8e6e1] ring-1 ring-white/5'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Banner de contradicciones detectadas */}
              {msg.contradictionsRevealed && msg.contradictionsRevealed.length > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-red-500/10 px-2 py-1.5 ring-1 ring-red-500/30">
                  <span className="mt-0.5 text-red-400">⚠</span>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-red-400">
                      {msg.contradictionsRevealed.length} contradicción
                      {msg.contradictionsRevealed.length > 1 ? 'es' : ''} en el corpus
                    </p>
                    {msg.contradictionsRevealed.slice(0, 2).map((r, j) => (
                      <p key={j} className="mt-0.5 text-[10px] text-[#a8a8a3]">
                        {r.explanation}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Chips de claims citados */}
              {msg.citedClaims && msg.citedClaims.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.citedClaims.slice(0, 4).map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => focusOnClaim(c.id)}
                      className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-[#a8a8a3] transition-all hover:bg-white/10 hover:text-[#EDECE9]"
                      title={`${c.subject} ${c.predicate} ${c.object}`}
                    >
                      {c.subject.slice(0, 12)} · {c.object.slice(0, 16)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Loading bubble */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl bg-[#1c1c1c] px-3 py-2 ring-1 ring-white/5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-1.5 animate-bounce rounded-full bg-[#8a8a85]" />
                  <span
                    className="inline-block size-1.5 animate-bounce rounded-full bg-[#8a8a85]"
                    style={{ animationDelay: '0.15s' }}
                  />
                  <span
                    className="inline-block size-1.5 animate-bounce rounded-full bg-[#8a8a85]"
                    style={{ animationDelay: '0.3s' }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="border-t border-white/5 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? 'Pensando...' : 'Hacé una pregunta...'}
            className="flex-1 rounded-lg border border-white/10 bg-[#1c1c1c] px-3 py-2 text-xs text-[#EDECE9] placeholder-[#6e6e6a] outline-none ring-[#3ECF8E]/30 focus:border-[#3ECF8E] focus:ring-1 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-[#3ECF8E] px-3 py-2 text-xs font-medium text-[#0d1f16] transition-all hover:bg-[#5AD9A2] disabled:bg-[#212121] disabled:text-[#6e6e6a]"
          >
            →
          </button>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="mt-2 text-[10px] text-[#6e6e6a] transition-colors hover:text-[#a8a8a3]"
          >
            Limpiar conversación
          </button>
        )}
      </form>
    </div>
  )
}

export default BrainSidebar
