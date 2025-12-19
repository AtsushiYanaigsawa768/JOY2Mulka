import Papa from 'papaparse';
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
 * Detect encoding and parse CSV file
 */
export async function parseCSVFile(file: File): Promise<{
  data: string[][];
  header: string[];
  columnNames: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;

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
        reject(new Error('Entry list must have at least 3 rows (2 header rows + data)'));
        return;
      }

      // First row is group headers, second row is column names
      const header = data[0].map(normalizeWhitespace);
      const columnNames = data[1].map(normalizeWhitespace);
      const rows = data.slice(2);

      resolve({ data: rows, header, columnNames });
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    // Try UTF-8 first (most common for modern exports)
    reader.readAsText(file, 'UTF-8');
  });
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
