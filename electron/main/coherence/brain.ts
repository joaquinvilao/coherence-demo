import { Ollama } from 'ollama'
import { getClaimsByKeywords, getRelationsForClaims, getDocuments, type Claim, type Relation } from './db'
import { getTeamForDoc } from './teams'
import rrfFuse from './rrf'
import { SYSTEM_PROMPT, formatContext, buildUserMessage } from './brainPrompts'

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })

export interface BrainAnswer {
  answer: string
  citedClaims: Claim[]
  contradictionsRevealed: Relation[]
  retrievedClaimIds: string[]
}

// Lista mínima de stopwords español — descartamos palabras que no aportan a la búsqueda
const STOPWORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'y',
  'o',
  'u',
  'que',
  'qué',
  'cual',
  'cuál',
  'es',
  'son',
  'fue',
  'ser',
  'está',
  'están',
  'su',
  'sus',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'para',
  'por',
  'con',
  'sin',
  'en',
  'a',
  'tiene',
  'tienen',
  'tener',
  'hay',
  'cuanto',
  'cuánto',
  'cuanta',
  'cuánta',
  'cómo',
  'como',
  'cuándo',
  'cuando',
  'dónde',
  'donde',
  'sobre',
  'entre',
  'también',
  'muy',
  'más',
  'menos',
  'si',
  'sí',
  'no',
])

// Extracción de keywords vía regex (sin LLM): rápido, determinístico, suficiente para 4 preguntas guion
function extractKeywords(question: string): string[] {
  const normalized = question.toLowerCase().replace(/[¿?¡!.,;:()]/g, ' ')
  const words = normalized.split(/\s+/).filter(Boolean)
  const filtered = words.filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  // Stemming heurístico: si la palabra termina en "es"/"as"/"os" y mide >5, recortar 1 char ("emisiones" → "emisione")
  return filtered.map((w) => (w.length > 5 && /[eoa]s$/.test(w) ? w.slice(0, -1) : w))
}

export async function askBrain(question: string): Promise<BrainAnswer> {
  const keywords = extractKeywords(question)

  if (keywords.length === 0) {
    return {
      answer: 'No pude identificar palabras clave en tu pregunta. ¿Podés ser más específico?',
      citedClaims: [],
      contradictionsRevealed: [],
      retrievedClaimIds: [],
    }
  }

  // Retrieval: buscar claims que matcheen keywords en sujeto y predicado por separado
  const bySubject = getClaimsByKeywords(keywords, 'subject')
  const byPredicate = getClaimsByKeywords(keywords, 'predicate')
  const byObject = getClaimsByKeywords(keywords, 'object')

  // RRF fuse para combinar las 3 listas sin tunear pesos
  const fused = rrfFuse([bySubject.map((c) => c.id), byPredicate.map((c) => c.id), byObject.map((c) => c.id)])

  const topClaimIds = fused.slice(0, 10).map(([id]) => id)
  const allClaimsById = new Map<string, Claim>()
  for (const c of [...bySubject, ...byPredicate, ...byObject]) allClaimsById.set(c.id, c)
  const topClaims = topClaimIds.map((id) => allClaimsById.get(id)).filter((c): c is Claim => c !== undefined)

  if (topClaims.length === 0) {
    return {
      answer: `No encontré claims en el corpus que respondan a tu pregunta. Palabras clave buscadas: ${keywords.join(', ')}.`,
      citedClaims: [],
      contradictionsRevealed: [],
      retrievedClaimIds: [],
    }
  }

  // Relaciones conocidas entre los top claims (especialmente contradicciones)
  const relations = getRelationsForClaims(topClaimIds)
  const contradictions = relations.filter((r) => r.relation === 'contradiction')

  // Construir contexto y armar mensaje (mapas doc → título y doc → equipo)
  const docs = getDocuments()
  const docTitleById = new Map(docs.map((d) => [d.id, d.title]))
  const docTeamById = new Map(docs.map((d) => [d.id, getTeamForDoc(d.title) as string]))
  const formatted = formatContext(topClaims, relations, docTitleById, docTeamById)
  const userMessage = buildUserMessage(formatted, question)

  // Llamar a Llama 3.1 vía Ollama (mismo cliente que extractor.ts y judge.ts)
  try {
    const response = await ollama.generate({
      model: 'llama3.1:8b-instruct-q4_K_M',
      prompt: userMessage,
      system: SYSTEM_PROMPT,
      options: { temperature: 0.2, num_predict: 600 },
    })

    return {
      answer: response.response.trim(),
      citedClaims: topClaims,
      contradictionsRevealed: contradictions,
      retrievedClaimIds: topClaimIds,
    }
  } catch (e) {
    return {
      answer: `Error consultando al modelo: ${String(e)}. Verificá que Ollama esté corriendo en localhost:11434.`,
      citedClaims: topClaims,
      contradictionsRevealed: contradictions,
      retrievedClaimIds: topClaimIds,
    }
  }
}
