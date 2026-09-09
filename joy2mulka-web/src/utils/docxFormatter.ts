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
  ShadingType,
} from 'docx';
import { StartListEntry, GlobalSettings, TexTemplate } from '../types';

/**
 * A4 page dimensions in DXA (twentieths of a point).
 *   A4: 210mm x 297mm = 595.28pt x 841.89pt = 11906 dxa x 16838 dxa
 *
 * Note: docx library's WidthType.PERCENTAGE uses units of 1/50 of a percent,
 * so 100% = 5000. We also supply explicit column widths in DXA for reliable
 * rendering across Word/LibreOffice.
 */
const A4_WIDTH_DXA = 11906;
const A4_HEIGHT_DXA = 16838;

/**
 * Per-template DOCX styling, kept deliberately parallel to the LaTeX
 * templates in outputFormatter.ts so that a .docx and a .tex generated with
 * the same setting look like the same document.
 */
interface DocxStyle {
  /** page margin, dxa (1134 = 2cm) */
  margin: number;
  /** body font size in half-points (20 = 10pt) */
  fontSize: number;
  /** table header background, hex without '#' */
  headerShade: string;
  /** outer rule colour */
  ruleColor: string;
  /** outer rule weight (docx eighths of a point) */
  ruleSize: number;
  /** inner horizontal rule colour */
  innerColor: string;
  /** draw vertical rules between columns */
  verticalRules: boolean;
  /** heading accent colour, hex without '#' */
  accent: string;
}

const DOCX_STYLES: Record<TexTemplate, DocxStyle> = {
  standard: {
    margin: 1021, // 18mm
    fontSize: 20,
    headerShade: 'EDEDED',
    ruleColor: '595959',
    ruleSize: 8,
    innerColor: 'D9D9D9',
    verticalRules: false,
    accent: '595959',
  },
  compact: {
    margin: 567, // 10mm
    fontSize: 16,
    headerShade: 'EBEBEB',
    ruleColor: '666666',
    ruleSize: 6,
    innerColor: 'DDDDDD',
    verticalRules: false,
    accent: '666666',
  },
  japanese: {
    margin: 1418, // 25mm
    fontSize: 21,
    headerShade: 'ECF0F6',
    ruleColor: '26416B',
    ruleSize: 6,
    innerColor: 'C6D0E0',
    verticalRules: false,
    accent: '26416B',
  },
  mono: {
    margin: 907, // 16mm
    fontSize: 20,
    headerShade: 'E0E0E0',
    ruleColor: '000000',
    ruleSize: 12,
    innerColor: '000000',
    verticalRules: true,
    accent: '000000',
  },
};

const TEMPLATE_ALIASES: Record<string, TexTemplate> = {
  default: 'standard',
  modern: 'standard',
  elegant: 'japanese',
  festival: 'standard',
  sporty: 'standard',
  minimal: 'mono',
};

function resolveStyle(template: string | undefined): DocxStyle {
  if (template && template in DOCX_STYLES) return DOCX_STYLES[template as TexTemplate];
  const alias = template ? TEMPLATE_ALIASES[template] : undefined;
  return DOCX_STYLES[alias ?? 'standard'];
}

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

type Labels = typeof LABELS.ja;

interface DocxBuildOptions {
  title: string;
  subtitle: string;
  isRole: boolean; // Role version shows name + furigana
}

/**
 * Column set for the start list table.
 *
 * 練習会モードでは時刻列を、ゼッケン番号を生成しない設定では No. 列を落とす。
 * Remaining width is redistributed so the table always fills the page.
 */
interface ColumnPlan {
  headers: string[];
  widths: number[];
  hasNumber: boolean;
  hasTime: boolean;
}

function buildColumnPlan(
  labels: Labels,
  settings: GlobalSettings,
  contentWidth: number
): ColumnPlan {
  const hasNumber = settings.generateStartNumbers !== false;
  const hasTime = settings.practiceMode !== true;

  const headers: string[] = [];
  const shares: number[] = [];

  if (hasNumber) {
    headers.push(labels.no);
    shares.push(8);
  }
  if (hasTime) {
    headers.push(labels.time);
    shares.push(12);
  }
  headers.push(labels.name);
  shares.push(32);
  headers.push(labels.affiliation);
  shares.push(36);
  headers.push(labels.card);
  shares.push(12);

  const total = shares.reduce((a, b) => a + b, 0);
  const widths = shares.map((s) => Math.round((contentWidth * s) / total));

  return { headers, widths, hasNumber, hasTime };
}

/**
 * Build a table cell with explicit DXA width (keeps column widths stable).
 */
function buildCell(
  children: TextRun[],
  widthDxa: number,
  shade?: string
): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    ...(shade
      ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: shade } }
      : {}),
    children: [
      new Paragraph({
        children: children.length > 0 ? children : [new TextRun({ text: '' })],
      }),
    ],
  });
}

function buildHeaderRow(plan: ColumnPlan, style: DocxStyle, fontSize: number): TableRow {
  return new TableRow({
    tableHeader: true,
    children: plan.headers.map((h, i) =>
      buildCell(
        [new TextRun({ text: h, bold: true, size: fontSize })],
        plan.widths[i],
        style.headerShade
      )
    ),
  });
}

function buildDataRow(
  entry: StartListEntry,
  plan: ColumnPlan,
  labels: Labels,
  isRole: boolean,
  fontSize: number
): TableRow {
  const cardDisplay =
    entry.isRental || !entry.cardNumber ? labels.rental : entry.cardNumber;

  // For role version, include furigana (name2) next to the name if available
  const nameChildren: TextRun[] = [];
  if (isRole && entry.name2 && entry.name1) {
    nameChildren.push(new TextRun({ text: entry.name1, size: fontSize }));
    nameChildren.push(
      new TextRun({ text: ` (${entry.name2})`, size: Math.max(12, fontSize - 4) })
    );
  } else {
    nameChildren.push(new TextRun({ text: entry.name1, size: fontSize }));
  }

  const cells: TextRun[][] = [];
  if (plan.hasNumber) cells.push([new TextRun({ text: String(entry.startNumber), size: fontSize })]);
  if (plan.hasTime) cells.push([new TextRun({ text: entry.startTime, size: fontSize })]);
  cells.push(nameChildren);
  cells.push([new TextRun({ text: entry.affiliation || '-', size: fontSize })]);
  cells.push([new TextRun({ text: cardDisplay, size: fontSize })]);

  return new TableRow({
    children: cells.map((c, i) => buildCell(c, plan.widths[i])),
  });
}

async function buildDocxBlob(
  startList: StartListEntry[],
  settings: GlobalSettings,
  options: DocxBuildOptions
): Promise<Blob> {
  const labels = LABELS[settings.language] || LABELS.en;
  const style = resolveStyle(settings.texTemplate);
  const practiceMode = settings.practiceMode === true;

  const contentWidth = A4_WIDTH_DXA - 2 * style.margin;
  const plan = buildColumnPlan(labels, settings, contentWidth);

  // Group entries by lane, then by class.
  // 練習会モードにはレーンが無いので、すべて一つのグループに入る。
  const byLane: Map<string, Map<string, StartListEntry[]>> = new Map();
  for (const entry of startList) {
    const laneKey = practiceMode ? '' : `${entry.startArea} - ${entry.lane}`;
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

    if (laneKey) {
      const laneName = laneKey.includes(' - ') ? laneKey.split(' - ')[1] : laneKey;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: laneName, bold: true, color: style.accent })],
        })
      );
    }

    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      // 練習会モードは入力順のまま。通常はスタート時刻順に並べる。
      if (!practiceMode) {
        entries.sort(
          (a, b) => a.startTime.localeCompare(b.startTime) || a.startNumber - b.startNumber
        );
      }

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: `${className} `, bold: true }),
            new TextRun({ text: `(${entries.length} ${labels.entries})`, size: 20 }),
          ],
        })
      );

      const rows: TableRow[] = [buildHeaderRow(plan, style, style.fontSize)];
      for (const entry of entries) {
        rows.push(buildDataRow(entry, plan, labels, options.isRole, style.fontSize));
      }

      const noRule = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const table = new Table({
        rows,
        // Explicit DXA width — guaranteed to span the full A4 content area
        // (some Word/LibreOffice versions ignore PERCENTAGE on unbounded layouts).
        width: { size: contentWidth, type: WidthType.DXA },
        // Fixed layout so column widths are honoured exactly as specified.
        layout: TableLayoutType.FIXED,
        columnWidths: plan.widths,
        borders: {
          top: { style: BorderStyle.SINGLE, size: style.ruleSize, color: style.ruleColor },
          bottom: { style: BorderStyle.SINGLE, size: style.ruleSize, color: style.ruleColor },
          // Horizontal rules only, matching the booktabs look of the .tex output
          left: noRule,
          right: noRule,
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: style.innerColor },
          insideVertical: style.verticalRules
            ? { style: BorderStyle.SINGLE, size: 2, color: style.innerColor }
            : noRule,
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
              top: style.margin,
              right: style.margin,
              bottom: style.margin,
              left: style.margin,
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
