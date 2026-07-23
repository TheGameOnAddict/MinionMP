export interface ParsedItem {
    id: string
    raw: string
    partNumber: string
    nomenclature: string
    qty: string | number
    originalQty: string | number
    qtyUnit?: string
    group: string
}

export interface ParsedIndexBlock {
    id: string
    label: string
    rawText: string
    items: ParsedItem[]
}

// Matches index headers at start of line.
// Handles:
//   -14a   -14b   -25a   -35A-1   -2   (plain index, no figure prefix)
//   2-14a  12-14a (1–2 digit figure number column concatenated onto index)
// Does NOT match part numbers like 35641-006, 400-441, 763-848.
// Capture group 1 or 2 = index token itself (e.g. "14a", "35A-1")
const INDEX_HEADER_RE = /^(?:-(\d{1,4}[A-Za-z]?(?:-\d+)?)\b|\d{1,2}-(\d{1,4}[A-Za-z]?(?:-\d+)?)\b)/

// Part number pattern: digits/letters with a hyphenated suffix.
// e.g. 35115-006, 763-848, NAS6606-13, MS21042-3, AN3-7A
// Does NOT match page footer text like 1A18B.
const PART_NUM_RE = /^[A-Z0-9]+-[A-Z0-9-]*\d[A-Z0-9-]*$/i

// Footer / header lines that are NOT IPC data — used to prune the last block.
// Matches lines starting with common English words or page-level text.
const FOOTER_LINE_RE = /^(When\s|Revised:|Figure\s|PIPER|PA-|AIRPLANE|Index\s|and\s+Part|Note:|NOTE:|\*\s*NOTE|\d+[A-Z]\d+[A-Z]?$)/i

// Continuation lines are part of the current index row but do not start with a part number.
// Example: "(with retaining ring) 2"
const CONTINUATION_LINE_RE = /^\(/

// Serial range suffixes to strip
const SERIAL_RANGE_RE = /\s+\d{2,4}-\d{5,}\s+thru\s+\d{2,4}[\s-]\d{5,}\s*$/i
const SERIAL_UP_RE    = /\s+\d{2,4}-\d{5,}\s+and\s+up\s*$/i
const SERIAL_SOLO_RE  = /\s+\d{2,4}-\d{6,}\s*$/i

function stripSerial(text: string): string {
    return text
        .replace(SERIAL_RANGE_RE, '')
        .replace(SERIAL_UP_RE, '')
        .replace(SERIAL_SOLO_RE, '')
}

function isIPCDataLine(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) return false
    
    // Check index header
    if (INDEX_HEADER_RE.test(trimmed)) return true
    
    // Check continuation line (starts with parenthesis)
    if (CONTINUATION_LINE_RE.test(trimmed)) return true
    
    const tokens = trimmed.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return false
    
    // Check standard part number (hyphenated)
    if (PART_NUM_RE.test(tokens[0])) return true
    
    // Check space-separated part number (e.g. 453 833)
    if (tokens.length >= 2 && /^\d{3,4}$/.test(tokens[0]) && /^\d{3,4}$/.test(tokens[1])) return true
    
    return false
}

/**
 * Parse a single IPC data line (after stripping the index prefix and serials).
 *
 * Column layout (space-delimited):
 *   PartNumber  [Code]  [*]  Nomenclature…  Qty
 *
 * Code is a single uppercase letter (K, T, S, N, U…).
 * * is an asterisk meaning "vendor part", can appear after code.
 * Qty is the last token: a number or AR.
 */
function parseSingleLine(raw: string, group: string, idx: number): ParsedItem | null {
    let text = raw.trim()
    if (!text) return null

    // Strip leading asterisks (double-star refs)
    text = text.replace(/^\*\s*\*?\s*/, '')

    // Strip serial range from end
    text = stripSerial(text)

    // Foot/inch marks
    let qtyUnit: string | undefined
    const footMatch  = text.match(/(\d+)\s*'\s*$/)
    const inchMatch  = !footMatch ? text.match(/(\d+)\s*"\s*$/) : null

    let qty: string | number = 1
    const tokens = text.split(/\s+/).filter(Boolean)
    let textWithoutQty = text

    if (footMatch) {
        qty = parseInt(footMatch[1])
        qtyUnit = 'ft'
        textWithoutQty = text.replace(/\s*\d+\s*'\s*$/, '')
    } else if (inchMatch) {
        qty = parseInt(inchMatch[1])
        qtyUnit = 'in'
        textWithoutQty = text.replace(/\s*\d+\s*"\s*$/, '')
    } else if (tokens.length > 0) {
        const last = tokens[tokens.length - 1]
        if (last.toUpperCase() === 'AR') {
            qty = 'AR'
            textWithoutQty = tokens.slice(0, -1).join(' ')
        } else if (/^\d+$/.test(last)) {
            qty = parseInt(last)
            textWithoutQty = tokens.slice(0, -1).join(' ')
        }
    }

    // Now parse part number + optional code + nomenclature from textWithoutQty
    const remaining = textWithoutQty.split(/\s+/).filter(Boolean)
    if (remaining.length === 0) return null

    let partNumber = ''
    let nomStart = 1

    const isSpaceSeparated = remaining.length >= 2 && 
        /^\d{3,4}$/.test(remaining[0]) && 
        /^\d{3,4}$/.test(remaining[1])

    if (isSpaceSeparated) {
        partNumber = remaining[0] + ' ' + remaining[1]
        nomStart = 2
    } else {
        const firstToken = remaining[0]
        if (!PART_NUM_RE.test(firstToken)) return null
        partNumber = firstToken
        nomStart = 1
    }

    // Skip optional single-letter codes (K, T, S, N, U…) and asterisks
    while (nomStart < remaining.length) {
        const tok = remaining[nomStart]
        if (/^[A-Z]$/.test(tok) || tok === '*') {
            nomStart++
        } else {
            break
        }
    }

    const nomenclature = remaining.slice(nomStart).join(' ').trim() || 'Unknown'

    return {
        id: `item-${Date.now()}-${idx}`,
        raw,
        partNumber,
        nomenclature,
        qty,
        originalQty: qty,
        qtyUnit,
        group
    }
}

/**
 * Parse IPC text split into clean newline-separated rows.
 * Each row is either:
 *   - An index header row: -14a 35115-006 * STIFFENER - Wing tip... qty [serial]
 *   - A sub-row (no leading -###): 35641-006 K * STIFFENER...
 */
export function parseIPC(text: string): ParsedItem[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const items: ParsedItem[] = []
    let currentGroup = ''

    lines.forEach((line, idx) => {
        const headerMatch = line.match(INDEX_HEADER_RE)
        let dataLine = line

        if (headerMatch) {
            currentGroup = `-${headerMatch[1] || headerMatch[2]}`
            // Strip the index prefix to get the data portion
            dataLine = line.slice(headerMatch[0].length).trim()
        }

        if (!dataLine) return // header-only line with no part data

        const parsed = parseSingleLine(dataLine, currentGroup, idx)
        if (parsed) {
            items.push(parsed)
            return
        }

        // Parenthesized continuation rows belong to the previous parsed part in this index.
        // They are common in IPC tables when the description wraps to the next visual line.
        if (CONTINUATION_LINE_RE.test(dataLine) && items.length > 0) {
            const prev = items[items.length - 1]
            if (prev.group === currentGroup) {
                const continuation = stripSerial(dataLine).trim()
                prev.raw = `${prev.raw} ${continuation}`
                prev.nomenclature = `${prev.nomenclature} ${continuation}`.replace(/\s+/g, ' ').trim()
            }
        }
    })

    return items
}

/**
 * Extract discrete index blocks from raw IPC text.
 * Each block spans from one -### header to the next.
 * Returns blocks that have at least one parseable part row.
 */
export function extractIPCIndexBlocks(text: string): ParsedIndexBlock[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const blocks: { label: string; lines: string[] }[] = []
    let current: { label: string; lines: string[] } | null = null

    for (const line of lines) {
        const m = line.match(INDEX_HEADER_RE)
        if (m) {
            current = { label: `-${m[1] || m[2]}`, lines: [line] }
            blocks.push(current)
        } else if (current) {
            current.lines.push(line)
        }
    }

    return blocks
        .map((block, i) => {
            const pruned = [...block.lines]
            while (pruned.length > 1) {
                const last = pruned[pruned.length - 1]
                const isData = isIPCDataLine(last)
                const isFooter = FOOTER_LINE_RE.test(last)
                if (!isData || isFooter) {
                    pruned.pop()
                } else {
                    break
                }
            }
            const rawText = pruned.join('\n')
            return {
                id: `block-${block.label}-${i}`,
                label: block.label,
                rawText,
                items: parseIPC(rawText)
            }
        })
}
