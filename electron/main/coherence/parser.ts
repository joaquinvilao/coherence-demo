/* eslint-disable @typescript-eslint/no-use-before-define */
import fs from 'fs'
import path from 'path'

export interface ParsedDocument {
  text: string
  title: string
  // Año extraído del nombre del archivo o del contenido (para valid_at)
  inferredYear: string | null
}

export async function parseFile(filepath: string): Promise<ParsedDocument> {
  const ext = path.extname(filepath).toLowerCase()
  const filename = path.basename(filepath, ext)
  const inferredYear = extractYear(filename) ?? extractYear(filepath)

  if (ext === '.pdf') {
    return { ...(await parsePdf(filepath)), title: filename, inferredYear }
  }
  if (ext === '.docx' || ext === '.doc') {
    return { ...(await parseWord(filepath)), title: filename, inferredYear }
  }
  if (ext === '.txt' || ext === '.md') {
    const text = fs.readFileSync(filepath, 'utf-8')
    return { text, title: filename, inferredYear }
  }
  throw new Error(`Formato no soportado: ${ext}`)
}

async function parsePdf(filepath: string): Promise<{ text: string }> {
  // pdf-parse funciona en el main process de Electron
  const pdfParse = await import('pdf-parse')
  const buffer = fs.readFileSync(filepath)
  const data = await pdfParse.default(buffer)
  return { text: data.text }
}

async function parseWord(filepath: string): Promise<{ text: string }> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filepath })
  return { text: result.value }
}

function extractYear(str: string): string | null {
  // Busca un año de 4 dígitos entre 2000 y 2030
  const match = str.match(/\b(20[0-2][0-9])\b/)
  return match ? match[1] : null
}
