import { Ollama } from 'ollama'
import { z } from 'zod'

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })

const ClaimSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().nullable().optional().default(''),
  confidence: z.number().min(0).max(1).default(0.9),
  raw_text: z.string().nullable().optional().default(''),
})

const ClaimsResponseSchema = z.object({
  claims: z.array(ClaimSchema),
})

export type ExtractedClaim = z.infer<typeof ClaimSchema>

const EXTRACTION_PROMPT = `Eres un extractor de afirmaciones factuales de documentos corporativos.

Dado el siguiente fragmento de texto, extrae todas las afirmaciones factuales atómicas y verificables.
Una afirmación factual es una declaración concreta sobre una política, meta, número, fecha, o procedimiento de la empresa.

REGLAS CRÍTICAS:
- El SUJETO siempre debe ser la entidad principal mencionada en el TEXTO, NUNCA copies entidades del ejemplo
- Si el texto no nombra una empresa explícita, usa la entidad implícita (por ejemplo: el sujeto del documento)
- Extrae solo afirmaciones verificables y específicas (no opiniones vagas)
- Cada afirmación debe tener sujeto, predicado y objeto concretos
- Para temas comparables entre documentos (metas, presupuestos, fechas), usá un predicado CORTO y CONSISTENTE
  - Bueno: "meta carbono neutralidad" / "inversión planta norte" / "nuevas contrataciones 2024"
  - Malo: "se compromete a alcanzar la carbono neutralidad para" (muy largo, no se compara)
- Incluye el fragmento exacto del texto del que proviene en raw_text
- confidence: 0.9 si es explícita, 0.7 si es implícita
- Máximo 10 afirmaciones por fragmento
- Responde SOLO con JSON válido, sin texto adicional

FORMATO DE RESPUESTA (ejemplo abstracto — REEMPLAZA por entidades del texto real):
{
  "claims": [
    {
      "subject": "<entidad-principal-del-texto>",
      "predicate": "<predicado-corto-y-comparable>",
      "object": "<valor-concreto-con-numero-o-fecha>",
      "confidence": 0.9,
      "raw_text": "<fragmento-literal-del-texto>"
    }
  ]
}

TEXTO A ANALIZAR:
`

export async function extractClaimsFromChunk(
  chunk: string,
  model = 'llama3.1:8b-instruct-q4_K_M',
): Promise<ExtractedClaim[]> {
  if (chunk.trim().length < 50) return []

  try {
    const response = await ollama.generate({
      model,
      prompt: EXTRACTION_PROMPT + chunk,
      format: 'json',
      options: { temperature: 0.1, num_predict: 600 },
    })

    const parsed = ClaimsResponseSchema.safeParse(JSON.parse(response.response))
    if (!parsed.success) {
      console.error('Claim parse error:', parsed.error.message)
      return []
    }
    return parsed.data.claims.filter((c) => (c.object ?? '').trim().length > 0)
  } catch (e) {
    console.error('Extractor error:', e)
    return []
  }
}

// Partir texto en chunks de tamaño manejable para Llama
// Maneja PDFs con saltos de línea simples (no dobles)
export function chunkText(text: string, maxChunkSize = 800): string[] {
  // Normalizar: colapsar espacios múltiples (artefactos de PDF)
  const normalized = text
    .replace(/[ \t]{2,}/g, ' ') // múltiples espacios → uno
    .replace(/\n{3,}/g, '\n\n') // más de 2 newlines → 2
    .trim()

  // Intentar dividir por párrafos dobles primero
  let paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30)

  // Si hay muy pocos párrafos (PDF con \n simples), dividir por oraciones
  if (paragraphs.length < 5) {
    paragraphs = normalized
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 30)
  }

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    // Si el párrafo solo es más grande que el chunk, dividirlo por oraciones
    if (para.length > maxChunkSize) {
      if (current.trim()) {
        chunks.push(current.trim())
        current = ''
      }
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para]
      let sentChunk = ''
      for (const s of sentences) {
        if ((sentChunk + s).length > maxChunkSize && sentChunk) {
          chunks.push(sentChunk.trim())
          sentChunk = s
        } else {
          sentChunk += ` ${s}`
        }
      }
      if (sentChunk.trim()) chunks.push(sentChunk.trim())
      // eslint-disable-next-line no-continue
      continue
    }

    if (`${current}\n${para}`.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current += (current ? '\n' : '') + para
    }
  }
  if (current.trim()) chunks.push(current.trim())

  return chunks
    .filter((c) => c.length > 80) // mínimo de contenido
    .filter((c) => /[a-záéíóúñ]{3,}/i.test(c)) // tiene palabras reales en español
    .slice(0, 50) // máx 50 chunks por doc
}
