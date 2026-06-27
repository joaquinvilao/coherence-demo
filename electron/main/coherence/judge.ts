/* eslint-disable @typescript-eslint/no-use-before-define */
import { Ollama } from 'ollama'
import { z } from 'zod'
import type { Claim } from './db'

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })

// RouteLLM-inspired routing: scoreClaimPair → float[0,1], two thresholds, three zones
//   score < NEUTRAL_THRESHOLD   → clearly neutral, skip Llama
//   score >= CERTAIN_THRESHOLD  → clear structural contradiction, skip Llama
//   between                     → uncertain, route to Llama (the "strong model")
const NEUTRAL_THRESHOLD = 0.2
const CERTAIN_THRESHOLD = 0.65

const JudgeResponseSchema = z.object({
  relation: z.enum(['contradiction', 'entailment', 'neutral']),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).default(0.8),
})

export type JudgeResult = z.infer<typeof JudgeResponseSchema>

const JUDGE_PROMPT = (
  a: Claim,
  b: Claim,
) => `You are an NLI judge for corporate documents. Analyze if two claims contradict, support, or are unrelated.

CLAIM A (${a.valid_at?.slice(0, 4) ?? '?'}): "${a.subject} ${a.predicate} ${a.object}"
CLAIM B (${b.valid_at?.slice(0, 4) ?? '?'}): "${b.subject} ${b.predicate} ${b.object}"

Rules:
- contradiction: same topic, incompatible values (e.g. target year 2040 vs 2050, percentage 40% vs 50%)
- entailment: one confirms or implies the other
- neutral: unrelated topics

Respond ONLY with valid JSON:
{"relation":"contradiction"|"entailment"|"neutral","explanation":"brief reason in Spanish","confidence":0.0-1.0}`

// Like calculate_strong_win_rate in RouteLLM: one clean number [0,1]
// High score = high likelihood of a meaningful relation (contradiction or entailment)
// Low score = clearly neutral (no overlap in topic)
function scoreClaimPair(claimA: Claim, claimB: Claim): number {
  const sNorm = normalize(claimA.subject)
  const pNorm = normalize(claimA.predicate)
  const sNorm2 = normalize(claimB.subject)
  const pNorm2 = normalize(claimB.predicate)

  const subjSim = similarity(sNorm, sNorm2)
  const predSim = similarity(pNorm, pNorm2)

  // No topic overlap → score 0 (route to neutral fast-path)
  const topicSim = Math.max(subjSim, predSim)
  if (topicSim < 0.3) return 0

  const objSim = similarity(normalize(claimA.object), normalize(claimB.object))

  // High topic similarity + low object similarity → strong contradiction signal
  // High topic similarity + high object similarity → entailment signal
  // Both get high scores; Llama disambiguates in the uncertain middle
  return topicSim * (1 - Math.abs(0.5 - objSim))
}

function buildHeuristicResult(claimA: Claim, claimB: Claim): JudgeResult {
  const subjSim = similarity(normalize(claimA.subject), normalize(claimB.subject))
  const predSim = similarity(normalize(claimA.predicate), normalize(claimB.predicate))
  const objSim = similarity(normalize(claimA.object), normalize(claimB.object))

  if (subjSim > 0.5 && predSim > 0.5 && objSim < 0.3) {
    return {
      relation: 'contradiction',
      explanation: `Mismo tema (${claimA.subject} / ${claimA.predicate}), valores incompatibles: "${claimA.object}" vs "${claimB.object}"`,
      confidence: 0.75,
    }
  }
  if (subjSim > 0.6 && predSim > 0.6 && objSim > 0.6) {
    return {
      relation: 'entailment',
      explanation: 'Las afirmaciones expresan esencialmente lo mismo',
      confidence: 0.8,
    }
  }
  return { relation: 'neutral', explanation: 'No hay relación directa detectada', confidence: 0.65 }
}

async function llamaJudge(claimA: Claim, claimB: Claim): Promise<JudgeResult | null> {
  try {
    const response = await ollama.generate({
      model: 'llama3.1:8b-instruct-q4_K_M',
      prompt: JUDGE_PROMPT(claimA, claimB),
      format: 'json',
      options: { temperature: 0.05, num_predict: 200 },
    })
    const parsed = JudgeResponseSchema.safeParse(JSON.parse(response.response))
    return parsed.success ? parsed.data : null
  } catch (e) {
    console.error('Llama judge error:', e)
    return null
  }
}

export async function judgeClaimPair(claimA: Claim, claimB: Claim): Promise<JudgeResult> {
  const score = scoreClaimPair(claimA, claimB)

  // Fast-path: clearly neutral (no topic overlap)
  if (score < NEUTRAL_THRESHOLD) {
    return { relation: 'neutral', explanation: 'Sujetos y predicados no relacionados', confidence: 0.9 }
  }

  // Fast-path: clear structural contradiction/entailment, Llama not needed
  if (score >= CERTAIN_THRESHOLD) {
    return buildHeuristicResult(claimA, claimB)
  }

  // Uncertain zone → route to Llama (the "strong model" in RouteLLM terms)
  return (await llamaJudge(claimA, claimB)) ?? buildHeuristicResult(claimA, claimB)
}

// Filter candidates before judging: only compare claims with topic overlap
// Avoids O(n²) Llama calls
export function filterCandidates(newClaim: Claim, existingClaims: Claim[]): Claim[] {
  const newKey = normalize(`${newClaim.subject} ${newClaim.predicate}`)
  return existingClaims.filter((c) => {
    if (c.id === newClaim.id) return false
    const key = normalize(`${c.subject} ${c.predicate}`)
    return similarity(newKey, key) > 0.4
  })
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-záéíóúñ\s]/g, '')
    .trim()
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.split(/\s+/).filter(Boolean))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}
