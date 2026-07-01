import { createHash } from 'crypto'
import { parseFile } from './parser'
import { chunkText, extractClaimsFromChunk } from './extractor'
import { judgeClaimPair, filterCandidates } from './judge'
import { insertDocument, insertClaims, insertRelation, getClaims, getDocuments } from './db'

export interface IngestProgress {
  stage: 'parsing' | 'extracting' | 'judging' | 'done' | 'error'
  message: string
  claimsFound?: number
  contradictionsFound?: number
}

export type ProgressCallback = (progress: IngestProgress) => void

export async function ingestDocument(
  filepath: string,
  onProgress: ProgressCallback,
): Promise<{ claimsInserted: number; contradictionsFound: number }> {
  // 1. Parsear el archivo
  onProgress({ stage: 'parsing', message: `Parseando ${filepath}...` })
  let parsed
  try {
    parsed = await parseFile(filepath)
  } catch (e) {
    onProgress({ stage: 'error', message: `Error al parsear: ${e}` })
    throw e
  }

  // 2. Verificar si ya fue ingerido (por hash)
  const contentHash = createHash('sha256').update(parsed.text).digest('hex')
  const existingDocs = getDocuments()
  if (existingDocs.some((d) => d.content_hash === contentHash)) {
    onProgress({
      stage: 'done',
      message: 'Documento ya procesado anteriormente',
      claimsFound: 0,
      contradictionsFound: 0,
    })
    return { claimsInserted: 0, contradictionsFound: 0 }
  }

  // 3. Chunking y extracción de claims
  // NOTA: el documento se registra en la BD recién DESPUÉS de que la
  // extracción termina exitosamente (ver más abajo) — no acá. Si se
  // registrara antes y el proceso se interrumpe a mitad de la extracción
  // (ej. la app se cierra/reinicia), el chequeo de "¿ya fue ingerido?" por
  // content_hash daría verdadero en el próximo intento sin haber extraído
  // ningún claim real, dejando un documento "fantasma" con 0 claims que
  // nunca se puede comparar contra el resto del corpus.
  const chunks = chunkText(parsed.text)
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const valid_at = parsed.inferredYear ? `${parsed.inferredYear}-01-01T00:00:00.000Z` : new Date().toISOString()

  let allExtracted: ReturnType<typeof extractClaimsFromChunk> extends Promise<infer T> ? T : never = []
  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < chunks.length; i++) {
    onProgress({
      stage: 'extracting',
      message: `Extrayendo claims del chunk ${i + 1}/${chunks.length}...`,
    })
    // eslint-disable-next-line no-await-in-loop
    const extracted = await extractClaimsFromChunk(chunks[i])
    allExtracted = [...allExtracted, ...extracted]
  }

  if (allExtracted.length === 0) {
    onProgress({
      stage: 'done',
      message: 'No se encontraron claims en el documento',
      claimsFound: 0,
      contradictionsFound: 0,
    })
    return { claimsInserted: 0, contradictionsFound: 0 }
  }

  // 4. Insertar documento (recién ahora que sabemos que la extracción
  // terminó con al menos un claim real) y luego los claims
  const doc = insertDocument({
    filepath,
    title: parsed.title,
    content_hash: contentHash,
  })

  // 5. Insertar claims
  const newClaims = insertClaims(
    allExtracted.map((c) => ({
      document_id: doc.id,
      subject: c.subject,
      predicate: c.predicate,
      object: c.object ?? '',
      confidence: c.confidence,
      valid_at,
      invalid_at: null,
      raw_text: c.raw_text ?? '',
    })),
  )

  onProgress({
    stage: 'judging',
    message: `Buscando contradicciones entre ${newClaims.length} claims nuevos y claims existentes...`,
    claimsFound: newClaims.length,
  })

  // 6. Detectar contradicciones con claims existentes
  const existingClaims = getClaims().filter((c) => !newClaims.some((nc) => nc.id === c.id))
  let contradictionsFound = 0

  // eslint-disable-next-line no-await-in-loop
  for (const newClaim of newClaims) {
    const candidates = filterCandidates(newClaim, existingClaims)
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const result = await judgeClaimPair(newClaim, candidate)
      if (result.relation !== 'neutral' && result.confidence > 0.6) {
        insertRelation({
          claim_a_id: newClaim.id,
          claim_b_id: candidate.id,
          relation: result.relation,
          explanation: result.explanation,
          confidence: result.confidence,
        })
        if (result.relation === 'contradiction') contradictionsFound++
      }
    }
  }

  onProgress({
    stage: 'done',
    message: `✅ Listo: ${newClaims.length} claims extraídos, ${contradictionsFound} contradicciones detectadas`,
    claimsFound: newClaims.length,
    contradictionsFound,
  })

  return { claimsInserted: newClaims.length, contradictionsFound }
}
