import Papa from 'papaparse';
import Encoding from 'encoding-japanese';
import { Entry, ColumnMapping } from '../types';

/**
 * Normalize whitespace in text (matches Python implementation)
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return '';
  // Convert full-width space to half-width
  text = text.replace(/\u3000/g, ' ');
  // Remove leading/trailing whitespace and normalize internal spaces
  return text.split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Parse affiliation string and extract individual affiliations
 * Matches Python: parse_affiliation function
 */
export function parseAffiliation(affiliation: string): string[] {
  if (!affiliation || ['-', '−', '―', ''].includes(affiliation)) {
    return [];
  }

  // Split by / or ,
  const parts = affiliation.split(/[/,、]/);

  const result: string[] = [];
  for (let part of parts) {
    part = normalizeWhitespace(part);
    if (!part || ['-', '−', '―'].includes(part)) {
      continue;
    }
    // Remove trailing numbers (e.g., "東工大OLC1" -> "東工大OLC")
    part = part.replace(/\d+$/, '').trim();
    if (part) {
      result.push(part);
    }
  }

  return result;
}

/**
 * Check if a decoded string appears to be a plausible CSV/TSV file.
 *
 * This is a multi-signal heuristic used to reject incorrect encoding guesses:
 *   1. Few/no replacement chars (U+FFFD)
 *   2. Sufficient ASCII ratio — CSVs always contain delimiters (`,` / `\t`),
 *      newlines and typically digits/punctuation, so ASCII should dominate.
 *   3. Presence of CSV-ish structure (at least some `\n`, and either `,` or `\t`).
 *   4. No runs of control characters (indicates binary misinterpretation).
 *
 * This rejects the common failure mode where legacy-encoded bytes get decoded
 * as UTF-16 LE/BE producing "valid" but garbled CJK characters — those strings
 * have very low ASCII ratio.
 */
function isDecodingClean(text: string): boolean {
  if (!text) return true;
  const len = text.length;

  // 1. Replacement char check
  let fffdCount = 0;
  let asciiCount = 0;
  let controlCount = 0;
  let hasLF = false;
  let hasCommaOrTab = false;

  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code === 0xFFFD) {
      fffdCount++;
      // More than 0.3% replacement chars → wrong encoding
      if (fffdCount > Math.max(2, len * 0.003)) return false;
    }
    if (code < 0x80) asciiCount++;
    if (code === 0x0A) hasLF = true;
    if (code === 0x09 || code === 0x2C) hasCommaOrTab = true;
    // Control chars other than TAB/LF/CR/FF are suspicious
    if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D && code !== 0x0C) {
      controlCount++;
    }
  }

  // 2. ASCII ratio — CSVs inevitably contain many ASCII chars (delimiters,
  // digits, newlines, English fragments, punctuation). Even heavily-Japanese
  // files are >30% ASCII. A ratio below ~15% almost certainly means wrong decoding.
  if (len >= 100 && asciiCount / len < 0.15) return false;

  // 3. Structure check for substantial files
  if (len >= 200 && (!hasLF || !hasCommaOrTab)) return false;

  // 4. Reject if too many control characters (binary misinterpretation)
  if (controlCount > Math.max(3, len * 0.005)) return false;

  return true;
}

/**
 * Strip a leading U+FEFF BOM character from decoded text (defensive; most
 * TextDecoder paths already strip the byte-level BOM).
 */
function stripLeadingBom(text: string): string {
  return text.length > 0 && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/**
 * Map an encoding-japanese encoding name to a TextDecoder-compatible name
 * per the WHATWG Encoding Standard.
 */
function toTextDecoderName(enc: string): string {
  switch (enc) {
    case 'UTF8': return 'utf-8';
    case 'UTF16': return 'utf-16';
    case 'UTF16BE': return 'utf-16be';
    case 'UTF16LE': return 'utf-16le';
    case 'SJIS': return 'shift_jis';
    case 'EUCJP': return 'euc-jp';
    case 'JIS': return 'iso-2022-jp';
    default: return 'utf-8';
  }
}

/**
 * Heuristic endianness detection for UTF-16 without BOM.
 * Japanese/ASCII text in UTF-16 has many zero bytes at predictable positions:
 * UTF-16 LE → zero bytes at odd offsets; UTF-16 BE → at even offsets.
 */
function guessUtf16Endianness(uint8: Uint8Array): 'LE' | 'BE' | null {
  // Must be even length and reasonably long for heuristic
  if (uint8.length < 16 || uint8.length % 2 !== 0) return null;

  const sampleLen = Math.min(uint8.length, 2048);
  let nullsAtEven = 0;
  let nullsAtOdd = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (uint8[i] === 0) {
      if (i % 2 === 0) nullsAtEven++;
      else nullsAtOdd++;
    }
  }

  const threshold = sampleLen / 16; // at least ~6% of sample
  if (nullsAtOdd > threshold && nullsAtOdd > nullsAtEven * 3) return 'LE';
  if (nullsAtEven > threshold && nullsAtEven > nullsAtOdd * 3) return 'BE';
  return null;
}

/**
 * Attempt to decode a byte buffer with a specific TextDecoder label.
 * Returns null if TextDecoder construction fails or decoding yields too many
 * replacement characters.
 */
function tryTextDecoder(uint8: Uint8Array, label: string): string | null {
  try {
    const decoder = new TextDecoder(label, { fatal: false });
    const text = decoder.decode(uint8);
    if (isDecodingClean(text)) return stripLeadingBom(text);
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to decode via the encoding-japanese library (used as a robust
 * fallback for legacy Japanese encodings).
 */
function tryEncodingJapanese(uint8: Uint8Array, from: Encoding.Encoding): string | null {
  try {
    const arr = Encoding.convert(uint8, {
      to: 'UNICODE',
      from,
      type: 'array',
    }) as number[];
    const text = Encoding.codeToString(arr);
    return isDecodingClean(text) ? stripLeadingBom(text) : null;
  } catch {
    return null;
  }
}

/**
 * Read a file as ArrayBuffer and decode with automatic encoding detection.
 *
 * Detection order (from most to least reliable):
 *   1. BOM-based: UTF-8, UTF-16 LE, UTF-16 BE, UTF-32 LE/BE
 *   2. encoding-japanese `detect()` for UTF-8/SJIS/EUC-JP/JIS/UTF-16
 *   3. Heuristic endianness detection for UTF-16 without BOM
 *   4. Multi-encoding trial with cleanness check (no/few U+FFFD)
 *   5. Fallback to UTF-8
 *
 * Supports: UTF-8 (±BOM), UTF-16 LE/BE (±BOM), Shift_JIS/CP932, EUC-JP,
 * ISO-2022-JP (JIS), and by TextDecoder extension GBK, GB18030, Big5,
 * EUC-KR, Windows-125x, ISO-8859-x and other WHATWG-listed encodings.
 */
export async function readFileWithEncodingDetection(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  // -------- 1. BOM-based detection (highest confidence) --------

  // UTF-8 BOM (EF BB BF)
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(uint8.subarray(3));
  }

  // UTF-32 LE BOM (FF FE 00 00) — check BEFORE UTF-16 LE BOM since prefix overlaps
  if (uint8.length >= 4 && uint8[0] === 0xFF && uint8[1] === 0xFE && uint8[2] === 0x00 && uint8[3] === 0x00) {
    // UTF-32 is rarely supported natively; try TextDecoder (some browsers), else fall through
    const decoded = tryTextDecoder(uint8.subarray(4), 'utf-32le');
    if (decoded) return decoded;
  }

  // UTF-32 BE BOM (00 00 FE FF)
  if (uint8.length >= 4 && uint8[0] === 0x00 && uint8[1] === 0x00 && uint8[2] === 0xFE && uint8[3] === 0xFF) {
    const decoded = tryTextDecoder(uint8.subarray(4), 'utf-32be');
    if (decoded) return decoded;
  }

  // UTF-16 LE BOM (FF FE)
  if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(uint8);
  }

  // UTF-16 BE BOM (FE FF)
  if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(uint8);
  }

  // -------- 2. Library-based detection for Japanese encodings --------
  const detectedRaw = Encoding.detect(uint8);

  // Direct mappable encodings from encoding-japanese detect
  if (detectedRaw === 'UTF8') {
    return new TextDecoder('utf-8').decode(uint8);
  }
  if (detectedRaw === 'SJIS' || detectedRaw === 'EUCJP' || detectedRaw === 'JIS') {
    const label = toTextDecoderName(detectedRaw);
    const decoded = tryTextDecoder(uint8, label) ?? tryEncodingJapanese(uint8, detectedRaw);
    if (decoded) return decoded;
  }
  if (detectedRaw === 'UTF16LE') {
    const decoded = tryTextDecoder(uint8, 'utf-16le');
    if (decoded) return decoded;
  }
  if (detectedRaw === 'UTF16BE') {
    const decoded = tryTextDecoder(uint8, 'utf-16be');
    if (decoded) return decoded;
  }
  // UTF16 without endianness: use byte pattern heuristic + try both
  if (detectedRaw === 'UTF16') {
    const endian = guessUtf16Endianness(uint8);
    const first = endian === 'BE' ? 'utf-16be' : 'utf-16le';
    const second = endian === 'BE' ? 'utf-16le' : 'utf-16be';
    const decoded = tryTextDecoder(uint8, first) ?? tryTextDecoder(uint8, second);
    if (decoded) return decoded;
  }

  // "UNICODE" is encoding-japanese's label when raw bytes don't cleanly match
  // other categories. Do NOT blindly try UTF-16 — these bytes could be any
  // legacy encoding. Fall through to the trial loop below.

  // -------- 3. Trial decoding with cleanness check --------
  // Try the most common encodings in order of likelihood.
  const candidates = [
    'utf-8',        // Default modern encoding
    'shift_jis',    // Windows Japanese legacy
    'euc-jp',       // Unix Japanese legacy
    'iso-2022-jp',  // Email/old Japanese
    'utf-16le',     // UTF-16 LE without BOM
    'utf-16be',     // UTF-16 BE without BOM
    'gbk',          // Simplified Chinese
    'big5',         // Traditional Chinese
    'euc-kr',       // Korean
    'windows-1252', // Western European (Latin-1 superset)
  ];
  for (const label of candidates) {
    const decoded = tryTextDecoder(uint8, label);
    if (decoded) return decoded;
  }

  // -------- 4. Final fallback: UTF-8 (may include replacement chars) --------
  return new TextDecoder('utf-8').decode(uint8);
}

/**
 * Detect encoding and parse CSV file
 */
export async function parseCSVFile(file: File): Promise<{
  data: string[][];
  header: string[];
  columnNames: string[];
}> {
  const text = await readFileWithEncodingDetection(file);

  // Use PapaParse
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  if (result.errors.length > 0) {
    // Try to continue anyway
    console.warn('CSV parse warnings:', result.errors);
  }

  const data = result.data;
  if (data.length < 3) {
    throw new Error('Entry list must have at least 3 rows (2 header rows + data)');
  }

  // First row is group headers, second row is column names
  const header = data[0].map(normalizeWhitespace);
  const columnNames = data[1].map(normalizeWhitespace);
  const rows = data.slice(2);

  return { data: rows, header, columnNames };
}

/**
 * Parse XLSX file using SheetJS
 */
export async function parseXLSXFile(file: File): Promise<{
  data: string[][];
  header: string[];
  columnNames: string[];
}> {
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to array of arrays
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
        });

        if (rows.length < 3) {
          reject(new Error('Entry list must have at least 3 rows (2 header rows + data)'));
          return;
        }

        const header = rows[0].map((cell) => normalizeWhitespace(String(cell)));
        const columnNames = rows[1].map((cell) => normalizeWhitespace(String(cell)));
        const dataRows = rows.slice(2).map((row) => row.map((cell) => String(cell)));

        resolve({ data: dataRows, header, columnNames });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Auto-detect column mapping based on header structure
 * Matches Python: find_column_indices function
 */
export function detectColumnMapping(
  headerRow: string[],
  columnNamesRow: string[]
): ColumnMapping {
  const mapping: ColumnMapping = {
    class: null,
    affiliation: null,
    teamName: null,
    rentalCount: null,
    participants: {},
  };

  // Find team/class columns (in チーム(組) section)
  let teamStart = -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i].includes('チーム') || headerRow[i].includes('組')) {
      teamStart = i;
      break;
    }
  }

  // Find participant sections (1人目, 2人目, ...)
  const participantStarts: { [key: number]: number } = {};
  for (let i = 0; i < headerRow.length; i++) {
    const match = headerRow[i].match(/(\d+)人目/);
    if (match) {
      const num = parseInt(match[1]);
      if (!(num in participantStarts)) {
        participantStarts[num] = i;
      }
    }
  }

  // Find the minimum participant start index
  const participantStartValues = Object.values(participantStarts);
  const minParticipantStart =
    participantStartValues.length > 0 ? Math.min(...participantStartValues) : columnNamesRow.length;

  // Map column names to indices within team section
  for (let i = 0; i < columnNamesRow.length; i++) {
    const colName = columnNamesRow[i];

    // Team section columns
    if (teamStart >= 0 && i >= teamStart && i < minParticipantStart) {
      if (colName === 'クラス') {
        mapping.class = i;
      } else if (colName === '所属') {
        mapping.affiliation = i;
      } else if (colName === 'チーム名(氏名)') {
        mapping.teamName = i;
      } else if (colName === 'カードレンタル枚数') {
        mapping.rentalCount = i;
      }
    }
  }

  // Participant columns
  for (const [pNumStr, pStart] of Object.entries(participantStarts)) {
    const pNum = parseInt(pNumStr);
    // Find end of this participant section
    let pEnd = columnNamesRow.length;
    for (const [, start] of Object.entries(participantStarts)) {
      if (start > pStart && start < pEnd) {
        pEnd = start;
      }
    }

    mapping.participants[pNum] = {
      name1: null,
      name2: null,
      gender: null,
      cardNumber: null,
      joaNumber: null,
    };

    for (let i = pStart; i < pEnd && i < columnNamesRow.length; i++) {
      const colName = columnNamesRow[i];

      if (colName === '氏名1') {
        mapping.participants[pNum].name1 = i;
      } else if (colName === '氏名2') {
        mapping.participants[pNum].name2 = i;
      } else if (colName === '性別') {
        mapping.participants[pNum].gender = i;
      } else if (colName === 'カード番号') {
        mapping.participants[pNum].cardNumber = i;
      } else if (colName === 'JOA競技者番号') {
        mapping.participants[pNum].joaNumber = i;
      }
    }
  }

  return mapping;
}

/**
 * Parse entries from data using column mapping
 * Matches Python: parse_entry_list function
 */
export function parseEntries(
  data: string[][],
  mapping: ColumnMapping
): Entry[] {
  const entries: Entry[] = [];
  let entryId = 0;

  const safeGet = (row: string[], idx: number | null, defaultVal = ''): string => {
    if (idx === null || idx >= row.length) return defaultVal;
    const val = row[idx];
    return val ? normalizeWhitespace(val) : defaultVal;
  };

  for (let rowNum = 0; rowNum < data.length; rowNum++) {
    const row = data[rowNum];
    if (!row || row.every((cell) => !cell.trim())) {
      continue;
    }

    // Get class and affiliation from team section
    const className = safeGet(row, mapping.class);
    const affiliation = safeGet(row, mapping.affiliation);
    const rentalCountStr = safeGet(row, mapping.rentalCount, '0');

    // Skip rows without class or with continuation marker
    if (!className || className === '〃') {
      continue;
    }

    // Parse each participant in the row
    for (let pNum = 1; pNum <= 5; pNum++) {
      const pMapping = mapping.participants[pNum];
      if (!pMapping) continue;

      const name1 = safeGet(row, pMapping.name1);
      if (!name1) continue; // No participant in this slot

      const name2 = safeGet(row, pMapping.name2);
      const gender = safeGet(row, pMapping.gender);
      const cardNumber = safeGet(row, pMapping.cardNumber);
      const joaNumber = safeGet(row, pMapping.joaNumber);

      // Determine if rental card
      let rentalCount = 0;
      try {
        rentalCount = parseInt(rentalCountStr) || 0;
      } catch {
        rentalCount = 0;
      }
      const isRental = rentalCount > 0 && !cardNumber;

      // Parse affiliations for split detection
      const affiliations = parseAffiliation(affiliation);

      entries.push({
        id: `entry-${entryId++}`,
        className,
        name1,
        name2,
        affiliation: affiliation && affiliation !== '-' ? affiliation : '',
        affiliations,
        cardNumber,
        joaNumber,
        isRental,
        gender,
        rowNumber: rowNum + 3, // 1-indexed, after 2 header rows
        participantNumber: pNum,
      });
    }
  }

  return entries;
}

/**
 * Detect unique classes and their counts
 */
export function detectClasses(entries: Entry[]): { name: string; count: number }[] {
  const classCounts: { [key: string]: number } = {};

  for (const entry of entries) {
    if (entry.className) {
      classCounts[entry.className] = (classCounts[entry.className] || 0) + 1;
    }
  }

  return Object.entries(classCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
