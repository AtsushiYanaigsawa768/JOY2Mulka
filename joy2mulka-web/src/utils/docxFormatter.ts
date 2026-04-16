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
} from 'docx';
import { StartListEntry, GlobalSettings } from '../types';

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

function textCell(text: string, bold = false, width?: number): TableCell {
  return new TableCell({
    width: width != null ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
  });
}

function buildHeaderRow(labels: typeof LABELS.ja): TableRow {
  return new TableRow({
    tableHeader: true,
    children: [
      textCell(labels.no, true, 10),
      textCell(labels.time, true, 15),
      textCell(labels.name, true, 35),
      textCell(labels.affiliation, true, 30),
      textCell(labels.card, true, 10),
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

  // For role version, include furigana (name2) under the name if available
  const nameChildren: TextRun[] = [];
  if (isRole && entry.name2 && entry.name1) {
    nameChildren.push(new TextRun({ text: entry.name1 }));
    nameChildren.push(new TextRun({ text: ` (${entry.name2})`, size: 16 }));
  } else {
    nameChildren.push(new TextRun({ text: entry.name1 }));
  }

  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(entry.startNumber) })] })],
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: entry.startTime })] })],
      }),
      new TableCell({
        children: [new Paragraph({ children: nameChildren })],
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: entry.affiliation || '-' })] })],
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: cardDisplay })] })],
      }),
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
        width: { size: 100, type: WidthType.PERCENTAGE },
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
        properties: {},
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
