import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { extractPagesMarkdown, processPdf } from '@firecrawl/pdf-inspector'
import * as cheerio from 'cheerio'
import mammoth from 'mammoth'

const SCHEMA_VERSION = 1
const SUPPORTED = new Set(['.pdf', '.docx', '.html', '.htm'])

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/gu, ' ')
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function fileHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function markdownTable(rows) {
  const values = rows
    .map((row) => row.map((cell) => normalizeText(cell).replace(/\|/gu, '\\|')))
    .filter((row) => row.some(Boolean))
  if (!values.length) return ''
  const width = Math.max(...values.map((row) => row.length))
  const padded = values.map((row) => row.concat(Array(Math.max(0, width - row.length)).fill('')))
  const lines = [
    '| ' + padded[0].join(' | ') + ' |',
    '| ' + Array(width).fill('---').join(' | ') + ' |',
  ]
  for (const row of padded.slice(1)) lines.push('| ' + row.join(' | ') + ' |')
  return lines.join('\n')
}

function splitLongText(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const paragraphs = text.split(/\n\s*\n/u).map((item) => item.trim()).filter(Boolean)
  const chunks = []
  let current = ''
  for (const paragraph of paragraphs) {
    const candidate = current ? current + '\n\n' + paragraph : paragraph
    if (current && candidate.length > maxChars) {
      chunks.push(current)
      current = paragraph
    } else if (paragraph.length > maxChars) {
      if (current) chunks.push(current)
      current = ''
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars).trim())
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks.length ? chunks : [text.slice(0, maxChars)]
}

function textLooksSuspicious(text) {
  return /\bcid:\w+|(?:X\s+X\s+Y|Y\s+\*N\*X|z2\*top)/u.test(text)
}

function blockRecord(sourcePath, sourceType, sourceHash, ordinal, group, text, status = 'ok') {
  const title = normalizeText(group.title) || 'Block ' + (ordinal + 1)
  const idSource = sourceHash + ':' + ordinal + ':' + title
  const digest = createHash('sha256').update(idSource, 'utf8').digest('hex').slice(0, 16)
  const cleanText = normalizeText(text)
  return {
    record_type: 'block',
    schema_version: SCHEMA_VERSION,
    block_id: basename(sourcePath, extname(sourcePath)) + '-' + digest,
    ordinal,
    source_path: sourcePath,
    source_type: sourceType,
    source_sha256: sourceHash,
    title,
    level: group.level ?? null,
    page_start: group.pageStart ?? null,
    page_end: group.pageEnd ?? null,
    block_type: group.blockType ?? 'section',
    extraction_status: status,
    text: cleanText || '[Текст не извлечён; требуется OCR или ручная проверка.]',
    char_count: cleanText.length,
  }
}

function sectionize(sourcePath, sourceType, sourceHash, units, mode, maxChars) {
  const groups = []
  if (mode === 'page') {
    const pages = new Map()
    for (const unit of units) {
      const page = unit.page ?? 1
      if (!pages.has(page)) pages.set(page, [])
      pages.get(page).push(unit)
    }
    for (const [page, pageUnits] of pages) groups.push({ title: 'Page ' + page, units: pageUnits, pageStart: page, pageEnd: page })
  } else if (mode === 'paragraph') {
    let heading = ''
    let level = null
    for (const unit of units) {
      if (unit.kind === 'heading') {
        heading = unit.text
        level = unit.level
      } else {
        groups.push({ title: heading || 'Page ' + (unit.page ?? 1), level, units: [unit], pageStart: unit.page, pageEnd: unit.page })
      }
    }
  } else {
    let current = null
    for (const unit of units) {
      if (unit.kind === 'heading') {
        if (current?.units.length) groups.push(current)
        current = { title: unit.text, level: unit.level, units: [], pageStart: unit.page, pageEnd: unit.page }
      } else {
        if (!current) current = { title: 'Page ' + (unit.page ?? 1), level: null, units: [], pageStart: unit.page, pageEnd: unit.page }
        current.units.push(unit)
        if (unit.page) current.pageEnd = unit.page
      }
    }
    if (current?.units.length) groups.push(current)
  }

  const records = []
  for (const group of groups) {
    const text = group.units.map((unit) => normalizeText(unit.text)).filter(Boolean).join('\n\n')
    const hasOcr = group.units.some((unit) => unit.status === 'needs_ocr')
    const status = hasOcr ? 'needs_ocr' : group.units.some((unit) => unit.status && unit.status !== 'ok') || textLooksSuspicious(text) ? 'needs_review' : 'ok'
    const parts = splitLongText(text, maxChars)
    parts.forEach((part, index) => {
      const suffix = parts.length > 1 ? ' (part ' + (index + 1) + '/' + parts.length + ')' : ''
      records.push(blockRecord(sourcePath, sourceType, sourceHash, records.length, {
        title: group.title + suffix,
        level: group.level,
        pageStart: group.pageStart,
        pageEnd: group.pageEnd,
        blockType: group.blockType,
      }, part, status))
    })
  }
  return records
}

function htmlUnits(markup) {
  const $ = cheerio.load(markup, { decodeEntities: true })
  $('script, style, noscript, template, svg, canvas').remove()
  const units = []
  $('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table').each((_, element) => {
    const node = $(element)
    if (node.parents('p, li, pre, blockquote, table').length) return
    const tag = String(element.tagName).toLowerCase()
    if (tag === 'table') {
      const rows = []
      node.find('tr').each((__, row) => rows.push($(row).find('th, td').map((___, cell) => $(cell).text()).get()))
      const text = markdownTable(rows)
      if (text) units.push({ kind: 'table', text })
      return
    }
    const fence = String.fromCharCode(96).repeat(3)
    const text = tag === 'pre' ? fence + '\n' + normalizeText(node.text()) + '\n' + fence : normalizeText(node.text())
    if (!text) return
    const level = /^h[1-6]$/u.test(tag) ? Number(tag.slice(1)) : null
    units.push({ kind: level ? 'heading' : 'paragraph', level, text })
  })
  return units
}

async function extractDocx(sourcePath, buffer, sourceHash, mode, maxChars) {
  const converted = await mammoth.convertToHtml({ buffer })
  const units = htmlUnits(converted.value)
  const blocks = sectionize(sourcePath, 'docx', sourceHash, units, mode, maxChars)
  return {
    blocks,
    diagnostics: { messages: converted.messages },
    status: converted.messages.some((message) => message.type === 'error') ? 'needs_review' : 'ok',
  }
}

function extractHtml(sourcePath, buffer, sourceHash, mode, maxChars) {
  const units = htmlUnits(buffer.toString('utf8'))
  return { blocks: sectionize(sourcePath, 'html', sourceHash, units, mode, maxChars), diagnostics: {}, status: 'ok' }
}

function extractPdf(sourcePath, buffer, sourceHash, mode, maxChars) {
  const processed = processPdf(buffer)
  const pagesResult = extractPagesMarkdown(buffer)
  const pages = pagesResult.pages ?? []
  const ocrPages = new Set((processed.pagesNeedingOcr ?? []).map((page) => Number(page) + 1))
  const units = []
  for (const page of pages) {
    const pageNumber = Number(page.page) + 1
    const pageStatus = ocrPages.has(pageNumber) || !page.markdown?.trim() ? 'needs_ocr' : 'ok'
    const lines = String(page.markdown ?? '').split(/\r?\n/u)
    let paragraph = []
    const flushParagraph = () => {
      const value = normalizeText(paragraph.join('\n'))
      if (value) units.push({ kind: 'paragraph', page: pageNumber, text: value, status: pageStatus })
      paragraph = []
    }
    for (const line of lines) {
      const text = normalizeText(line)
      if (!text) {
        flushParagraph()
        continue
      }
      const match = text.match(/^(#{1,6})\s+(.+)$/u)
      const headingText = match?.[2] ?? ''
      const isMetadataHeading = /^arXiv:/iu.test(headingText)
      if (match && match[1].length <= 3 && !isMetadataHeading) {
        flushParagraph()
        units.push({ kind: 'heading', level: match[1].length, page: pageNumber, text: headingText, status: pageStatus })
      } else if (isMetadataHeading) {
        flushParagraph()
      } else if (!match && !isMetadataHeading) {
        paragraph.push(text)
      }
    }
    flushParagraph()
    if (!lines.some((line) => normalizeText(line))) units.push({ kind: 'paragraph', page: pageNumber, text: '', status: 'needs_ocr' })
  }
  const abstractIndex = units.findIndex((unit) => unit.kind === 'heading' && /^abstract$/iu.test(unit.text))
  if (abstractIndex > 0) units.splice(0, abstractIndex)
  const status = ocrPages.size || processed.hasEncodingIssues ? 'needs_review' : 'ok'
  return {
    blocks: sectionize(sourcePath, 'pdf', sourceHash, units, mode, maxChars),
    diagnostics: {
      pdf_type: processed.pdfType,
      page_count: processed.pageCount,
      confidence: processed.confidence,
      pages_needing_ocr: processed.pagesNeedingOcr ?? [],
      ocr_reasons_by_page: processed.ocrReasonsByPage ?? [],
      has_encoding_issues: Boolean(processed.hasEncodingIssues),
      is_complex_layout: Boolean(processed.isComplexLayout),
      pages_with_tables: processed.pagesWithTables ?? [],
      pages_with_columns: processed.pagesWithColumns ?? [],
      processing_time_ms: processed.processingTimeMs,
    },
    status,
  }
}

export async function extractDocument(input, options = {}) {
  const sourcePath = resolve(input)
  const extension = extname(sourcePath).toLowerCase()
  if (!SUPPORTED.has(extension)) throw new Error('Unsupported document type. Supported: .pdf, .docx, .html, .htm')
  const buffer = readFileSync(sourcePath)
  const sourceHash = fileHash(buffer)
  const mode = options.blockMode ?? 'heading'
  const maxChars = options.maxChars ?? 14000
  let extracted
  if (extension === '.pdf') extracted = extractPdf(sourcePath, buffer, sourceHash, mode, maxChars)
  else if (extension === '.docx') extracted = await extractDocx(sourcePath, buffer, sourceHash, mode, maxChars)
  else extracted = extractHtml(sourcePath, buffer, sourceHash, mode, maxChars)
  if (!extracted.blocks.length) throw new Error('No meaningful blocks found in ' + sourcePath)
  const blockNeedsReview = extracted.blocks.some((block) => block.extraction_status !== 'ok')
  return {
    metadata: {
      record_type: 'document',
      schema_version: SCHEMA_VERSION,
      source_path: sourcePath,
      source_type: extension === '.htm' ? 'html' : extension.slice(1),
      source_sha256: sourceHash,
      block_mode: mode,
      block_count: extracted.blocks.length,
      extractor: extension === '.pdf' ? '@firecrawl/pdf-inspector' : extension === '.docx' ? 'mammoth' : 'cheerio',
      extraction_status: extracted.status !== 'ok' ? extracted.status : blockNeedsReview ? 'needs_review' : 'ok',
      diagnostics: extracted.diagnostics,
    },
    blocks: extracted.blocks,
  }
}
