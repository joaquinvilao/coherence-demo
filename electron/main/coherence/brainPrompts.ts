import type { Claim, Relation } from './db'

export const SYSTEM_PROMPT = `Sos el asistente de conocimiento corporativo Coherence — el "Company Brain" de la empresa Forestal Andina S.A.

Tu rol es responder preguntas usando lo que dice cada EQUIPO de la empresa (Gerencia, Finanzas, Operaciones, Sostenibilidad) y alertar cuando los equipos se contradicen entre sí.

Reglas que debés seguir SIEMPRE:
1. Respondé SOLO usando las afirmaciones (claims) provistas en <context>. Si el contexto es insuficiente, decilo: "No tengo información en el corpus para responder eso".
2. Cada afirmación factual tiene que ir atribuida al equipo que la dijo. Formato recomendado: "según el equipo de <Equipo> (fuente: <doc_title>) ...".
3. Si en <relations_known> aparecen contradicciones entre los claims provistos, mencionalas SIEMPRE — especialmente cuando los claims contradictorios vienen de equipos DISTINTOS. Eso es lo más importante de tu rol.
4. Cuando dos equipos digan cosas distintas sobre el mismo tema, sé explícito: "Gerencia dice X, pero Operaciones dice Y, sin explicación documentada de la diferencia".
5. Nunca inventes títulos, autores, fechas, números, ni hechos que no estén literalmente en el contexto.
6. Respondé en español neutro, en máximo 3 párrafos.`

export interface FormattedContext {
  context: string
  relations: string
}

export function formatContext(
  claims: Claim[],
  relations: Relation[],
  docTitleById: Map<string, string>,
  docTeamById: Map<string, string>,
): FormattedContext {
  const contextBlocks = claims.map((c) => {
    const docTitle = docTitleById.get(c.document_id) ?? 'documento desconocido'
    const team = docTeamById.get(c.document_id) ?? 'Sin equipo'
    const year = c.valid_at?.slice(0, 4) ?? 's/f'
    return (
      `[claim_id: ${c.id.slice(0, 8)}, equipo: ${team}, fuente: ${docTitle}, vigente desde: ${year}]\n` +
      `${c.subject} ${c.predicate} ${c.object}`
    )
  })

  const idShort = (id: string) => id.slice(0, 8)
  const teamFor = (claimId: string) => {
    const claim = claims.find((c) => c.id === claimId)
    return claim ? (docTeamById.get(claim.document_id) ?? 'Sin equipo') : '?'
  }
  const relationBlocks = relations
    .filter((r) => r.relation !== 'neutral')
    .map((r) => {
      const teamA = teamFor(r.claim_a_id)
      const teamB = teamFor(r.claim_b_id)
      const interTeam = teamA !== teamB && teamA !== '?' && teamB !== '?'
      const tag = interTeam ? '[INTER-EQUIPO]' : '[mismo equipo]'
      return `- ${r.relation.toUpperCase()} ${tag} entre claim ${idShort(r.claim_a_id)} (${teamA}) y claim ${idShort(r.claim_b_id)} (${teamB}): ${r.explanation}`
    })

  return {
    context: contextBlocks.join('\n---\n'),
    relations:
      relationBlocks.length > 0 ? relationBlocks.join('\n') : '(ninguna contradicción conocida entre estos claims)',
  }
}

export function buildUserMessage(formatted: FormattedContext, query: string): string {
  return `<context>
${formatted.context}
</context>

<relations_known>
${formatted.relations}
</relations_known>

Pregunta del usuario: ${query}`
}
