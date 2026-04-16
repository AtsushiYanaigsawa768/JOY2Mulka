import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  PageOrientation,
  TableLayoutType,
} from 'docx';
import { StartListEntry, GlobalSettings } from '../types';

/**
 * A4 page dimensions in DXA (twentieths of a point).
 *   A4: 210mm x 297mm = 595.28pt x 841.89pt = 11906 dxa x 16838 dxa
 *   Margins: 2cm each side = 1134 dxa
 *   Content width: 11906 - 2*1134 = 9638 dxa
 *
 * Note: docx library's WidthType.PERCENTAGE uses units of 1/50 of a percent,
 * so 100% = 5000. We also supply explicit column widths in DXA for reliable
 * rendering across Word/LibreOffice.
 */
const A4_WIDTH_DXA = 11906;
const A4_HEIGHT_DXA = 16838;
const PAGE_MARGIN_DXA = 1134; // 2cm
const CONTENT_WIDTH_DXA = A4_WIDTH_DXA - 2 * PAGE_MARGIN_DXA; // 9638

// Column width distribution (sums to 100%) for the startlist table:
// No. / Time / Name / Affiliation / Card
const COL_WIDTH_PCT = [8, 12, 32, 36, 12]; // percent
const COL_WIDTH_DXA = COL_WIDTH_PCT.map((p) => Math.round((CONTENT_WIDTH_DXA * p) / 100));

/**
 * Language-specific labels (mirrors outputFormatter.ts LABELS)
 */
const LABELS = {
  en: {
    startlist: 'Startlist',
    entries: 'entries',
    no: 'No.',
    time: 'Time',
    name: 'Name',
    affiliation: 'Affiliation',
    card: 'Card',
    rental: '(rental)',
    role: 'Official Startlist',
  },
  ja: {
    startlist: 'スタートリスト',
    entries: '名',
    no: 'No.',
    time: '時刻',
    name: '氏名',
    affiliation: '所属',
    card: 'カード',
    rental: 'レンタル',
    role: '役員用スタートリスト',
  },
};

interface DocxBuildOptions {
  title: string;
  subtitle: string;
  isRole: boolean; // Role version shows name + furigana
}

/**
 * Build a table cell with explicit DXA width (keeps column widths stable).
 */
function buildCell(children: TextRun[], widthDxa: number, bold = false): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    children: [
      new Paragraph({
        children:
          children.length > 0
            ? children
            : [new TextRun({ text: '', bold })],
      }),
    ],
  });
}

function buildHeaderRow(labels: typeof LABELS.ja): TableRow {
  return new TableRow({
    tableHeader: true,
    children: [
      buildCell([new TextRun({ text: labels.no, bold: true })], COL_WIDTH_DXA[0], true),
      buildCell([new TextRun({ text: labels.time, bold: true })], COL_WIDTH_DXA[1], true),
      buildCell([new TextRun({ text: labels.name, bold: true })], COL_WIDTH_DXA[2], true),
      buildCell([new TextRun({ text: labels.affiliation, bold: true })], COL_WIDTH_DXA[3], true),
      buildCell([new TextRun({ text: labels.card, bold: true })], COL_WIDTH_DXA[4], true),
    ],
  });
}

function buildDataRow(
  entry: StartListEntry,
  labels: typeof LABELS.ja,
  isRole: boolean
): TableRow {
  const cardDisplay =
    entry.isRental || !entry.cardNumber ? labels.rental : entry.cardNumber;

  // For role version, include furigana (name2) next to the name if available
  const nameChildren: TextRun[] = [];
  if (isRole && entry.name2 && entry.name1) {
    nameChildren.push(new TextRun({ text: entry.name1 }));
    nameChildren.push(new TextRun({ text: ` (${entry.name2})`, size: 16 }));
  } else {
    nameChildren.push(new TextRun({ text: entry.name1 }));
  }

  return new TableRow({
    children: [
      buildCell([new TextRun({ text: String(entry.startNumber) })], COL_WIDTH_DXA[0]),
      buildCell([new TextRun({ text: entry.startTime })], COL_WIDTH_DXA[1]),
      buildCell(nameChildren, COL_WIDTH_DXA[2]),
      buildCell([new TextRun({ text: entry.affiliation || '-' })], COL_WIDTH_DXA[3]),
      buildCell([new TextRun({ text: cardDisplay })], COL_WIDTH_DXA[4]),
    ],
  });
}

async function buildDocxBlob(
  startList: StartListEntry[],
  settings: GlobalSettings,
  options: DocxBuildOptions
): Promise<Blob> {
  const labels = LABELS[settings.language] || LABELS.en;

  // Group entries by lane, then by class
  const byLane: Map<string, Map<string, StartListEntry[]>> = new Map();
  for (const entry of startList) {
    const laneKey = `${entry.startArea} - ${entry.lane}`;
    if (!byLane.has(laneKey)) {
      byLane.set(laneKey, new Map());
    }
    const laneMap = byLane.get(laneKey)!;
    if (!laneMap.has(entry.className)) {
      laneMap.set(entry.className, []);
    }
    laneMap.get(entry.className)!.push(entry);
  }

  const sortedLanes = Array.from(byLane.keys()).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '999');
    const numB = parseInt(b.match(/\d+/)?.[0] || '999');
    return numA - numB || a.localeCompare(b);
  });

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: options.title, bold: true, size: 40 })],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: options.subtitle, size: 28 })],
    })
  );
  children.push(new Paragraph({ text: '' }));

  for (const laneKey of sortedLanes) {
    const classesInLane = byLane.get(laneKey)!;
    const laneName = laneKey.includes(' - ') ? laneKey.split(' - ')[1] : laneKey;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: laneName, bold: true })],
      })
    );

    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      entries.sort((a, b) => a.startNumber - b.startNumber);

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: `${className} `, bold: true }),
            new TextRun({ text: `(${entries.length} ${labels.entries})`, size: 20 }),
          ],
        })
      );

      const rows: TableRow[] = [buildHeaderRow(labels)];
      for (const entry of entries) {
        rows.push(buildDataRow(entry, labels, options.isRole));
      }

      const table = new Table({
        rows,
        // Explicit DXA width — guaranteed to span the full A4 content area
        // (some Word/LibreOffice versions ignore PERCENTAGE on unbounded layouts).
        width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
        // Fixed layout so column widths are honoured exactly as specified.
        layout: TableLayoutType.FIXED,
        columnWidths: COL_WIDTH_DXA,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
        },
      });

      children.push(table);
      children.push(new Paragraph({ text: '' }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_DXA,
              height: A4_HEIGHT_DXA,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: PAGE_MARGIN_DXA,
              right: PAGE_MARGIN_DXA,
              bottom: PAGE_MARGIN_DXA,
              left: PAGE_MARGIN_DXA,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Generate Public startlist DOCX (Public_Startlist.docx)
 */
export async function generatePublicDocx(
  startList: StartListEntry[],
  settings: GlobalSettings
): Promise<Blob> {
  const labels = LABELS[settings.language] || LABELS.en;
  return buildDocxBlob(startList, settings, {
    title: settings.outputFolder || settings.competitionName || labels.startlist,
    subtitle: labels.startlist,
    isRole: false,
  });
}

/**
 * Generate Role startlist DOCX (Role_Startlist.docx) with furigana
 */
export async function generateRoleDocx(
  startList: StartListEntry[],
  settings: GlobalSettings
): Promise<Blob> {
  const labels = LABELS[settings.language] || LABELS.en;
  return buildDocxBlob(startList, settings, {
    title: settings.outputFolder || settings.competitionName || labels.role,
    subtitle: labels.role,
    isRole: true,
  });
}
