// Mapeo de documento → equipo de la empresa.
// Single source of truth para el demo Company Brain de Forestal Andina S.A.
// El frontend recibe el team ya resuelto vía getGraphData() para no duplicar lógica.

export type Team = 'Gerencia' | 'Finanzas' | 'Operaciones' | 'Sostenibilidad' | 'Sin equipo'

export const TEAMS: Team[] = ['Gerencia', 'Finanzas', 'Operaciones', 'Sostenibilidad']

// Paleta sutil para etiquetas y halos por equipo (los nodos mantienen su color
// monocromático según contradicción/selección — esto es solo para identidad de cluster).
export const TEAM_COLORS: Record<Team, string> = {
  Gerencia: '#f97316', // naranja
  Finanzas: '#10b981', // verde
  Operaciones: '#3b82f6', // azul
  Sostenibilidad: '#a855f7', // morado
  'Sin equipo': '#94a3b8', // gris (fallback)
}

// Inferencia simple por nombre de archivo / título. Si crece, mover a un YAML o DB.
export function getTeamForDoc(docTitle: string): Team {
  const t = docTitle.toLowerCase()
  if (t.includes('gerencia') || t.includes('estrategi')) return 'Gerencia'
  if (t.includes('finanz') || t.includes('presupuesto')) return 'Finanzas'
  if (t.includes('operaci')) return 'Operaciones'
  if (t.includes('sostenib') || t.includes('esg') || t.includes('ambient')) return 'Sostenibilidad'
  return 'Sin equipo'
}
