import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { getTeamForDoc } from './teams'

// Tipos
export interface Document {
  id: string
  filepath: string
  title: string
  content_hash: string
  ingested_at: string
}

export interface Claim {
  id: string
  document_id: string
  subject: string
  predicate: string
  object: string
  confidence: number
  valid_at: string | null
  invalid_at: string | null
  created_at: string
  raw_text: string
}

export interface Relation {
  id: string
  claim_a_id: string
  claim_b_id: string
  relation: 'contradiction' | 'entailment' | 'neutral'
  explanation: string
  confidence: number
  created_at: string
}

interface DbData {
  documents: Document[]
  claims: Claim[]
  relations: Relation[]
}

// Singleton en memoria
let data: DbData | null = null
let dbPath: string | null = null

function getDbPath(): string {
  if (dbPath) return dbPath
  const userDataPath = app.getPath('userData')
  dbPath = path.join(userDataPath, 'coherence-db.json')
  return dbPath
}

function saveDb() {
  fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function loadDb(): DbData {
  if (data) return data
  const p = getDbPath()
  if (fs.existsSync(p)) {
    data = JSON.parse(fs.readFileSync(p, 'utf-8')) as DbData
  } else {
    data = { documents: [], claims: [], relations: [] }
    saveDb()
  }
  return data
}

// --- Documents ---

export function insertDocument(doc: Omit<Document, 'id' | 'ingested_at'>): Document {
  const db = loadDb()
  const existing = db.documents.find((d) => d.content_hash === doc.content_hash)
  if (existing) return existing
  const newDoc: Document = { ...doc, id: randomUUID(), ingested_at: new Date().toISOString() }
  db.documents.push(newDoc)
  saveDb()
  return newDoc
}

export function getDocuments(): Document[] {
  return loadDb().documents
}

// --- Claims ---

export function insertClaims(claims: Omit<Claim, 'id' | 'created_at'>[]): Claim[] {
  const db = loadDb()
  const inserted: Claim[] = []
  for (const c of claims) {
    const claim: Claim = { ...c, id: randomUUID(), created_at: new Date().toISOString() }
    db.claims.push(claim)
    inserted.push(claim)
  }
  saveDb()
  return inserted
}

export function getClaims(): Claim[] {
  return loadDb().claims
}

// Brain retrieval: filtrar claims que contengan alguna keyword en el campo indicado.
// Devuelve ordenados por # de matches descendente (lista pre-ranqueada para RRF).
export function getClaimsByKeywords(keywords: string[], field: 'subject' | 'predicate' | 'object'): Claim[] {
  if (keywords.length === 0) return []
  const lowered = keywords.map((k) => k.toLowerCase())
  return loadDb()
    .claims.map((c) => {
      const haystack = (c[field] ?? '').toLowerCase()
      const matches = lowered.filter((k) => haystack.includes(k)).length
      return { claim: c, matches }
    })
    .filter((x) => x.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .map((x) => x.claim)
}

// Claims vigentes en una fecha (para el timeline scrubber)
export function getClaimsAtDate(isoDate: string): Claim[] {
  const db = loadDb()
  return db.claims.filter((c) => {
    const after = !c.valid_at || c.valid_at <= isoDate
    const before = !c.invalid_at || c.invalid_at > isoDate
    return after && before
  })
}

// --- Relations ---

export function insertRelation(rel: Omit<Relation, 'id' | 'created_at'>): Relation {
  const db = loadDb()
  const relation: Relation = { ...rel, id: randomUUID(), created_at: new Date().toISOString() }
  db.relations.push(relation)
  saveDb()
  return relation
}

// Brain retrieval: devolver todas las relaciones que involucren al menos uno de los claimIds dados.
// Útil para mostrar contradicciones al usuario incluso si solo uno de los dos claims está en el top-K.
export function getRelationsForClaims(claimIds: string[]): Relation[] {
  if (claimIds.length === 0) return []
  const set = new Set(claimIds)
  return loadDb().relations.filter((r) => set.has(r.claim_a_id) || set.has(r.claim_b_id))
}

export function getContradictions(): Array<Relation & { claimA: Claim; claimB: Claim }> {
  const db = loadDb()
  return db.relations
    .filter((r) => r.relation === 'contradiction')
    .map((r) => {
      const claimA = db.claims.find((c) => c.id === r.claim_a_id)!
      const claimB = db.claims.find((c) => c.id === r.claim_b_id)!
      return { ...r, claimA, claimB }
    })
}

// Grafo completo para react-force-graph-3d
export function getGraphData() {
  const db = loadDb()
  const nodes = db.claims.map((c) => {
    const docTitle = db.documents.find((d) => d.id === c.document_id)?.title ?? ''
    return {
      id: c.id,
      label: `${c.subject} ${c.predicate} ${c.object}`,
      subject: c.subject,
      predicate: c.predicate,
      object: c.object,
      valid_at: c.valid_at,
      invalid_at: c.invalid_at,
      doc_title: docTitle,
      team: getTeamForDoc(docTitle),
    }
  })
  const links = db.relations
    .filter((r) => r.relation !== 'neutral')
    .map((r) => ({
      source: r.claim_a_id,
      target: r.claim_b_id,
      relation: r.relation,
      explanation: r.explanation,
    }))
  return { nodes, links }
}

export function getDateRange(): { min: string | null; max: string | null } {
  const db = loadDb()
  const dates = db.claims.map((c) => c.valid_at).filter(Boolean) as string[]
  if (!dates.length) return { min: null, max: null }
  return { min: dates.reduce((a, b) => (a < b ? a : b)), max: dates.reduce((a, b) => (a > b ? a : b)) }
}

export function clearDb() {
  data = { documents: [], claims: [], relations: [] }
  saveDb()
}
