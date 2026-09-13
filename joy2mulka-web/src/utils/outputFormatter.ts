import { StartListEntry, GlobalSettings, OutputFiles, TexTemplate, TexTemplateInfo, RoleVariantFile } from '../types';
import { generatePublicDocx, generateRoleDocx } from './docxFormatter';

/**
 * Available TeX templates.
 *
 * The four templates differ in typography and page economy — not merely in
 * colour. Each one is a complete layout decision:
 *   standard  … 一般的な A4 掲示・配布用。ゴシック、booktabs の水平罫のみ。
 *   compact   … 2段組。人数が多い大会で紙を節約する。
 *   japanese  … 明朝。余白を広くとった落ち着いた組版。
 *   mono      … 白黒コピー前提。太い罫と縞模様で行を追いやすくする。
 */
export const TEX_TEMPLATES: TexTemplateInfo[] = [
  {
    id: 'standard',
    name: '標準',
    description: 'A4片面・掲示および配布用の基本レイアウト',
    preview: 'ゴシック体／水平罫のみ／クラス見出しに細い下線',
  },
  {
    id: 'compact',
    name: 'コンパクト',
    description: '2段組で紙面を節約する（大規模大会向け）',
    preview: '8pt・2段組／余白10mm／1ページあたりの行数が約2倍',
  },
  {
    id: 'japanese',
    name: '和',
    description: '明朝体・広い余白の落ち着いた組版',
    preview: '明朝体／藍色の細罫／余白25mm',
  },
  {
    id: 'mono',
    name: 'モノクロ',
    description: '白黒コピー・FAX前提。行を追いやすい縞模様',
    preview: '完全白黒／太い上下罫／1行おきの淡いグレー',
  },
];

/** Legacy template ids (旧8種) → 新4種 への読み替え */
const TEMPLATE_ALIASES: Record<string, TexTemplate> = {
  default: 'standard',
  modern: 'standard',
  elegant: 'japanese',
  festival: 'standard',
  sporty: 'standard',
  minimal: 'mono',
};

function resolveTemplate(template: string | undefined): TexTemplate {
  if (!template) return 'standard';
  if (TEX_TEMPLATES.some((t) => t.id === template)) return template as TexTemplate;
  return TEMPLATE_ALIASES[template] ?? 'standard';
}

/**
 * Escape special LaTeX characters
 * Matches Python: escape_latex function
 */
function escapeLatex(text: string): string {
  if (!text) return '';

  const replacements: [string, string][] = [
    ['\\', '\\textbackslash{}'],
    ['&', '\\&'],
    ['%', '\\%'],
    ['$', '\\$'],
    ['#', '\\#'],
    ['_', '\\_'],
    ['{', '\\{'],
    ['}', '\\}'],
    ['~', '\\textasciitilde{}'],
    ['^', '\\textasciicircum{}'],
  ];

  for (const [old, newStr] of replacements) {
    text = text.split(old).join(newStr);
  }

  return text;
}

/**
 * Which optional columns are present, derived from the global settings.
 *
 * 練習会モードではスタート時刻を割り当てないため時刻列を出さない。
 * ゼッケン番号を生成しない設定のときはスタートナンバー列を出さない。
 */
function columnFlags(settings: GlobalSettings) {
  return {
    startTime: !settings.practiceMode,
    startNumber: settings.generateStartNumbers !== false,
  };
}

/**
 * Generate Mulka CSV (Startlist.csv)
 * Matches Python: write_startlist_csv function
 *
 * Requirements:
 * - Line endings: CRLF (\r\n)
 * - Trailing newline: Yes
 * - Quoting: No quotes on data rows (only quote if field contains comma, newline, or quote)
 */
export function generateMulkaCsv(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  const CRLF = '\r\n';
  const cols = columnFlags(settings);

  const header = [
    'クラス',
    ...(cols.startNumber ? ['スタートナンバー'] : []),
    '氏名１',
    '氏名2',
    '所属',
    ...(cols.startTime ? ['スタート時刻'] : []),
    'カード番号',
    'カード備考',
    '競技者登録番号',
  ].join(',');

  const rows = startList.map((entry) => {
    const cardNote = entry.isRental || !entry.cardNumber ? 'レンタル' : 'my card';
    return [
      entry.className,
      ...(cols.startNumber ? [entry.startNumber] : []),
      entry.name1,
      entry.name2,
      entry.affiliation || '-',
      ...(cols.startTime ? [entry.startTime] : []),
      entry.cardNumber,
      cardNote,
      entry.joaNumber,
    ]
      .map((v) => {
        const str = String(v);
        // Only quote if field contains comma, newline, or double quote
        if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',');
  });

  // Add BOM for UTF-8, use CRLF line endings, and add trailing newline
  return '\uFEFF' + header + CRLF + rows.join(CRLF) + CRLF;
}

/**
 * Generate Role CSV (Role_Startlist.csv)
 * Matches Python: write_role_startlist_csv function
 */
export function generateRoleCsv(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  const cols = columnFlags(settings);

  const header = [
    'クラス',
    ...(cols.startNumber ? ['スタートナンバー'] : []),
    '氏名',
    '所属',
    ...(cols.startTime ? ['スタート時刻'] : []),
    'カード番号',
    'チェックイン',
    '備考',
  ].join(',');

  const rows = startList.map((entry) => {
    const note = entry.isRental ? 'レンタル' : '';
    return [
      entry.className,
      ...(cols.startNumber ? [entry.startNumber] : []),
      entry.name1,
      entry.affiliation || '-',
      ...(cols.startTime ? [entry.startTime] : []),
      entry.cardNumber,
      '', // Check-in column (empty)
      note,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  // Add BOM for UTF-8
  return '\uFEFF' + header + '\n' + rows.join('\n');
}

/**
 * Generate Class Summary CSV
 * Matches Python: write_class_summary_csv function
 */
export function generateClassSummaryCsv(startList: StartListEntry[]): string {
  const header = 'クラス,人数';

  // Count entries per class
  const classCounts: { [key: string]: number } = {};
  for (const entry of startList) {
    classCounts[entry.className] = (classCounts[entry.className] || 0) + 1;
  }

  // Sort classes
  const sortedClasses = Object.keys(classCounts).sort();

  const rows = sortedClasses.map((cls) => `${cls},${classCounts[cls]}`);

  // Add total
  const total = Object.values(classCounts).reduce((a, b) => a + b, 0);
  rows.push(`合計,${total}`);

  // Add BOM for UTF-8
  return '\uFEFF' + header + '\n' + rows.join('\n');
}

/**
 * Language-specific labels
 */
const LABELS = {
  en: {
    startlist: 'Startlist',
    role: 'Official Startlist',
    entries: 'entries',
    no: 'No.',
    time: 'Time',
    name: 'Name',
    affiliation: 'Affiliation',
    card: 'Card',
    rental: 'rental',
    continued: 'continued',
  },
  ja: {
    startlist: 'スタートリスト',
    role: '役員用スタートリスト',
    entries: '名',
    no: 'No.',
    time: '時刻',
    name: '氏名',
    affiliation: '所属',
    card: 'カード',
    rental: 'レンタル',
    continued: '続き',
  },
};

type Labels = typeof LABELS.ja;

/**
 * Per-template layout parameters.
 *
 * Everything that distinguishes the four templates lives here, so that the
 * document body below can be written once.
 */
interface TemplateSpec {
  /** documentclass options */
  classOptions: string;
  /** \geometry{...} argument */
  geometry: string;
  /** Extra preamble lines (colour definitions, font family, table options) */
  extraPreamble: string;
  /** Font family switch applied to the whole document body */
  bodyFont: string;
  /** Colour name used for rules and headings ('' = plain black) */
  accent: string;
  /** Two-column body via multicol. longtable cannot break across multicol
   *  columns, so these templates use supertabular instead. */
  twoColumn: boolean;
  /** \arraystretch inside tables */
  arrayStretch: string;
  /** \tabcolsep inside tables */
  tabColSep: string;
  /** Alternating row shading (mono only) */
  zebra: boolean;
  /** Rule weights, in the order top / mid / bottom */
  rules: { top: string; bottom: string };
}

const TEMPLATE_SPECS: Record<TexTemplate, TemplateSpec> = {
  standard: {
    classOptions: 'a4paper,10pt',
    geometry: 'top=20mm,bottom=20mm,left=18mm,right=18mm,headsep=6mm',
    extraPreamble: `\\definecolor{rule}{gray}{0.35}
\\definecolor{band}{gray}{0.90}`,
    bodyFont: '\\gtfamily\\sffamily',
    accent: 'rule',
    twoColumn: false,
    arrayStretch: '1.25',
    tabColSep: '5pt',
    zebra: false,
    rules: { top: '0.8pt', bottom: '0.8pt' },
  },
  compact: {
    classOptions: 'a4paper,8pt',
    geometry: 'top=12mm,bottom=12mm,left=10mm,right=10mm,headsep=4mm',
    extraPreamble: `\\definecolor{rule}{gray}{0.4}
\\definecolor{band}{gray}{0.92}
\\setlength{\\columnsep}{7mm}
\\setlength{\\columnseprule}{0.2pt}`,
    bodyFont: '\\gtfamily\\sffamily',
    accent: 'rule',
    twoColumn: true,
    arrayStretch: '1.08',
    tabColSep: '3pt',
    zebra: false,
    rules: { top: '0.6pt', bottom: '0.6pt' },
  },
  japanese: {
    classOptions: 'a4paper,11pt',
    geometry: 'top=25mm,bottom=25mm,left=25mm,right=25mm,headsep=8mm',
    extraPreamble: `\\definecolor{rule}{RGB}{38,65,107}
\\definecolor{band}{RGB}{236,240,246}`,
    bodyFont: '\\mcfamily\\rmfamily',
    accent: 'rule',
    twoColumn: false,
    arrayStretch: '1.35',
    tabColSep: '6pt',
    zebra: false,
    rules: { top: '0.6pt', bottom: '0.6pt' },
  },
  mono: {
    classOptions: 'a4paper,10pt',
    geometry: 'top=18mm,bottom=18mm,left=16mm,right=16mm,headsep=5mm',
    extraPreamble: `\\definecolor{rule}{gray}{0}
\\definecolor{band}{gray}{0.80}
\\definecolor{zebra}{gray}{0.94}`,
    bodyFont: '\\gtfamily\\sffamily',
    accent: '',
    twoColumn: false,
    arrayStretch: '1.3',
    tabColSep: '5pt',
    zebra: true,
    rules: { top: '1.2pt', bottom: '1.2pt' },
  },
};

/** Wrap text in the template accent colour (no-op for the mono template) */
function accented(spec: TemplateSpec, text: string): string {
  return spec.accent ? `\\textcolor{${spec.accent}}{${text}}` : text;
}

/**
 * Column layout for the start list table.
 *
 * Widths are fractions of \textwidth so long affiliation names wrap instead of
 * running off the page — the single biggest readability problem in the old
 * templates, which used bare `l` columns.
 */
interface ColumnLayout {
  spec: string;
  headers: string[];
  count: number;
}

function buildColumnLayout(
  labels: Labels,
  cols: { startTime: boolean; startNumber: boolean },
  isRole: boolean,
  twoColumn: boolean
): ColumnLayout {
  // In two-column mode every width refers to the (narrow) column, so the
  // fractions are the same but of \columnwidth.
  const W = twoColumn ? '\\columnwidth' : '\\textwidth';
  const parts: string[] = [];
  const headers: string[] = [];

  // Fixed-width leading columns
  let used = 0;
  if (cols.startNumber) {
    parts.push('r');
    headers.push(labels.no);
    used += 0.09;
  }
  if (cols.startTime) {
    parts.push('l');
    headers.push(labels.time);
    used += 0.12;
  }

  // Remaining space split between name and affiliation. The card column is a
  // plain `l` — its content is short ("レンタル" / a card number) and must not
  // be broken over two lines, which is what the old templates did.
  const remaining = 0.95 - used - 0.13;
  const nameShare = isRole ? 0.46 : 0.42;
  const affShare = 1 - nameShare;

  const w = (share: number) => (remaining * share).toFixed(3);

  parts.push(`>{\\raggedright\\arraybackslash}p{${w(nameShare)}${W}}`);
  headers.push(labels.name);
  parts.push(`>{\\raggedright\\arraybackslash}p{${w(affShare)}${W}}`);
  headers.push(labels.affiliation);
  parts.push('l');
  headers.push(labels.card);

  return { spec: parts.join(''), headers, count: parts.length };
}

/**
 * Shared preamble for both the public and the role start list.
 */
function buildPreamble(
  spec: TemplateSpec,
  settings: GlobalSettings,
  runningTitle: string,
  withRuby: boolean
): string {
  const zebraOption = spec.zebra ? '[table]' : '';

  return `% !TEX program = lualatex
\\documentclass[${spec.classOptions}]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{array}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{needspace}
\\usepackage{fancyhdr}
\\usepackage${zebraOption}{xcolor}
\\usepackage{colortbl}
${spec.twoColumn ? '\\usepackage{multicol}\n\\raggedcolumns\n' : ''}${withRuby ? '\\usepackage{luatexja-ruby}\n' : ''}${spec.extraPreamble}

\\geometry{${spec.geometry}}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small ${escapeLatex(settings.competitionName)}}
\\fancyhead[R]{\\small ${runningTitle}}
\\fancyfoot[C]{\\small \\thepage}
\\setlength{\\headheight}{14pt}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0pt}

\\setlength{\\tabcolsep}{${spec.tabColSep}}
\\renewcommand{\\arraystretch}{${spec.arrayStretch}}
\\setlength{\\LTpre}{2pt}
\\setlength{\\LTpost}{10pt}

% クラス見出し
\\newcommand{\\classheading}[2]{%
  \\Needspace*{6\\baselineskip}%
  \\par\\vspace{3pt}%
  \\noindent{\\large\\bfseries #1}\\hspace{0.6em}{\\small #2}%
  \\par\\vspace{1pt}%
  \\noindent${accented(spec, `\\rule{${spec.twoColumn ? '\\columnwidth' : '\\textwidth'}}{0.4pt}`)}%
  \\par\\vspace{2pt}%
}
% レーン見出し
\\newcommand{\\laneheading}[1]{%
  \\par\\vspace{10pt}%
  \\noindent${accented(spec, '\\rule{2.5mm}{3.4mm}')}\\hspace{0.5em}{\\LARGE\\bfseries #1}%
  \\par\\vspace{4pt}%
}
`;
}

/** Table header block, repeated on every page of a longtable */
function buildTableHead(
  spec: TemplateSpec,
  layout: ColumnLayout,
  labels: Labels
): string {
  const headerCells = layout.headers
    .map((h) => `\\textbf{${h}}`)
    .join(' & ');

  const top = `\\specialrule{${spec.rules.top}}{0pt}{0pt}`;
  const bottom = `\\specialrule{${spec.rules.bottom}}{0pt}{0pt}`;
  const cont = `\\multicolumn{${layout.count}}{@{}l}{\\small\\itshape ${labels.continued}}\\\\`;

  // \endfirsthead / \endhead give a proper "(続き)" marker after a page break.
  // \rowcolors must be issued *before* the table for the striping to apply.
  return `${spec.zebra ? '\\rowcolors{1}{}{zebra}\n' : ''}\\begin{longtable}{${layout.spec}}
${top}
\\rowcolor{band} ${headerCells} \\\\
\\midrule
\\endfirsthead
${cont}
${top}
\\rowcolor{band} ${headerCells} \\\\
\\midrule
\\endhead
${bottom}
\\endfoot
${bottom}
\\endlastfoot
`;
}

/** Matching table terminator for buildTableHead */
function buildTableEnd(): string {
  return '\\end{longtable}\n\n';
}

/**
 * Two-column body for the `compact` template.
 *
 * longtable cannot break across multicol columns, so the rows are chunked into
 * plain tabulars that each fit inside one column; multicol then flows the
 * chunks. Every chunk repeats the header so a column is readable on its own.
 */
const COMPACT_CHUNK_ROWS = 40;

function buildChunkedTable(
  spec: TemplateSpec,
  layout: ColumnLayout,
  labels: Labels,
  rows: string[]
): string {
  const headerCells = layout.headers.map((h) => `\\textbf{${h}}`).join(' & ');
  const top = `\\specialrule{${spec.rules.top}}{0pt}{0pt}`;
  const bottom = `\\specialrule{${spec.rules.bottom}}{0pt}{0pt}`;

  let out = '';
  for (let i = 0; i < rows.length; i += COMPACT_CHUNK_ROWS) {
    const chunk = rows.slice(i, i + COMPACT_CHUNK_ROWS);
    out += `\\begin{tabular}{${layout.spec}}\n${top}\n`;
    if (i > 0) {
      out += `\\multicolumn{${layout.count}}{@{}l}{\\small\\itshape ${labels.continued}}\\\\\n`;
    }
    out += `\\rowcolor{band} ${headerCells} \\\\\n\\midrule\n`;
    out += chunk.join('');
    out += `${bottom}\n\\end{tabular}\n\n\\vspace{4pt}\n\n`;
  }
  return out;
}

/** One data row */
function buildRow(
  entry: StartListEntry,
  cols: { startTime: boolean; startNumber: boolean },
  labels: Labels,
  nameCell: string
): string {
  const cardDisplay =
    entry.isRental || !entry.cardNumber ? labels.rental : escapeLatex(entry.cardNumber);
  const cells: string[] = [];
  if (cols.startNumber) cells.push(String(entry.startNumber));
  if (cols.startTime) cells.push(entry.startTime);
  cells.push(nameCell);
  cells.push(escapeLatex(entry.affiliation || '-'));
  cells.push(cardDisplay);
  return cells.join(' & ') + ' \\\\\n';
}

/**
 * Group the start list by lane (start area + lane) and then by class.
 * In 練習会モード there are no lanes, so everything lands in a single group.
 */
function groupStartList(
  startList: StartListEntry[],
  practiceMode: boolean
): Map<string, Map<string, StartListEntry[]>> {
  const byLane: Map<string, Map<string, StartListEntry[]>> = new Map();
  for (const entry of startList) {
    const laneKey = practiceMode ? '' : `${entry.startArea} - ${entry.lane}`;
    if (!byLane.has(laneKey)) byLane.set(laneKey, new Map());
    const laneMap = byLane.get(laneKey)!;
    if (!laneMap.has(entry.className)) laneMap.set(entry.className, []);
    laneMap.get(entry.className)!.push(entry);
  }
  return byLane;
}

function sortLaneKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '999');
    const numB = parseInt(b.match(/\d+/)?.[0] || '999');
    return numA - numB || a.localeCompare(b);
  });
}

/**
 * Build a start list document. Shared by the public and role variants.
 */
function buildTex(
  startList: StartListEntry[],
  settings: GlobalSettings,
  opts: { isRole: boolean }
): string {
  const labels = LABELS[settings.language] || LABELS.en;
  const template = resolveTemplate(settings.texTemplate);
  const spec = TEMPLATE_SPECS[template];
  const cols = columnFlags(settings);
  const practiceMode = settings.practiceMode === true;
  const docTitle = opts.isRole ? labels.role : labels.startlist;

  const layout = buildColumnLayout(labels, cols, opts.isRole, spec.twoColumn);

  let tex = buildPreamble(spec, settings, docTitle, opts.isRole);
  tex += `\n\\begin{document}\n${spec.bodyFont}\n\n`;

  // Cover title
  tex += `\\begin{center}
{\\LARGE\\bfseries ${escapeLatex(settings.outputFolder || settings.competitionName)}}\\\\[4pt]
{\\large ${docTitle}}
\\end{center}
\\vspace{4mm}

`;

  if (spec.twoColumn) tex += '\\begin{multicols}{2}\n';

  const byLane = groupStartList(startList, practiceMode);

  for (const laneKey of sortLaneKeys(Array.from(byLane.keys()))) {
    const classesInLane = byLane.get(laneKey)!;

    if (laneKey) {
      const laneName = laneKey.includes(' - ') ? laneKey.split(' - ')[1] : laneKey;
      tex += `\\laneheading{${escapeLatex(laneName)}}\n\n`;
    }

    for (const className of Array.from(classesInLane.keys()).sort()) {
      const entries = classesInLane.get(className)!;
      // 練習会モードは入力順のまま。通常はスタート時刻順（番号なしでも崩れない）
      if (!practiceMode) {
        entries.sort(
          (a, b) => a.startTime.localeCompare(b.startTime) || a.startNumber - b.startNumber
        );
      }

      tex += `\\classheading{${escapeLatex(className)}}{${entries.length} ${labels.entries}}\n`;

      const rows = entries.map((entry) => {
        let nameCell: string;
        if (opts.isRole && entry.name1 && entry.name2) {
          nameCell = `\\ruby{${escapeLatex(entry.name1)}}{${escapeLatex(entry.name2)}}`;
        } else {
          nameCell = escapeLatex(entry.name1);
        }
        return buildRow(entry, cols, labels, nameCell);
      });

      if (spec.twoColumn) {
        tex += buildChunkedTable(spec, layout, labels, rows);
      } else {
        tex += buildTableHead(spec, layout, labels);
        tex += rows.join('');
        tex += buildTableEnd();
      }
    }
  }

  if (spec.twoColumn) tex += '\\end{multicols}\n';

  tex += '\\end{document}\n';
  return tex;
}

/**
 * Generate Public TeX (Public_Startlist.tex)
 */
export function generatePublicTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  return buildTex(startList, settings, { isRole: false });
}

/**
 * Generate Role TeX (Role_Startlist.tex) — 氏名にふりがな（ルビ）を付ける
 */
export function generateRoleTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  return buildTex(startList, settings, { isRole: true });
}

/* ------------------------------------------------------------------ *
 * 役職用スタートリスト（役割ごとに複数種類）
 *
 * 山の中では無線も携帯もつながらないことがあり、当日は紙だけで判断する。
 * 役職によって「何から引くか」が違うので、役職ごとに紙を分ける。
 * さらに同じ役職でも引くキーが変わることがあるため、1 役職につき
 * 複数の並び順を出しておく。
 * ------------------------------------------------------------------ */

export type RoleName = '救護' | 'スタート' | 'フィニッシュ';

export interface RoleListVariant {
  id: string;
  role: RoleName;
  /** 出力ファイル名の元になる名前 */
  fileBase: string;
  /** 紙の表題 */
  title: string;
  /** 何のための並びかの説明 */
  purpose: string;
  sortBy: 'startNumber' | 'kana' | 'cardNumber' | 'startTime';
  /** レーンごとに分けて出す */
  groupByLane: boolean;
}

export const ROLE_LIST_VARIANTS: RoleListVariant[] = [
  {
    id: 'rescue-bib',
    role: '救護',
    fileBase: 'Rescue_ByBib',
    title: '救護用スタートリスト（ゼッケン番号順）',
    purpose: 'ゼッケン番号から引く。全クラス通し。',
    sortBy: 'startNumber',
    groupByLane: false,
  },
  {
    id: 'rescue-kana',
    role: '救護',
    fileBase: 'Rescue_ByKana',
    title: '救護用スタートリスト（ふりがな順）',
    purpose: '名前しか分からないときに引く。全クラス通し。',
    sortBy: 'kana',
    groupByLane: false,
  },
  {
    id: 'rescue-card',
    role: '救護',
    fileBase: 'Rescue_ByCard',
    title: '救護用スタートリスト（カード番号順）',
    purpose: '拾得カードや読み取り記録から人を特定するときに引く。',
    sortBy: 'cardNumber',
    groupByLane: false,
  },
  {
    id: 'start-lane-time',
    role: 'スタート',
    fileBase: 'Start_ByLaneTime',
    title: 'スタート用リスト（レーン別・時刻順）',
    purpose: '枠に立った人を呼ぶための本番用。姓のふりがなを大きく出す。',
    sortBy: 'startTime',
    groupByLane: true,
  },
  {
    id: 'start-bib',
    role: 'スタート',
    fileBase: 'Start_ByBib',
    title: 'スタート用リスト（ゼッケン番号順）',
    purpose: '遅刻・枠違いの人をゼッケンから確認するための控え。',
    sortBy: 'startNumber',
    groupByLane: false,
  },
  {
    id: 'finish-bib',
    role: 'フィニッシュ',
    fileBase: 'Finish_ByBib',
    title: 'フィニッシュ用リスト（ゼッケン番号順）',
    purpose: '戻ってきた人のゼッケンを見て消し込む本番用。',
    sortBy: 'startNumber',
    groupByLane: false,
  },
  {
    id: 'finish-time',
    role: 'フィニッシュ',
    fileBase: 'Finish_ByStartTime',
    title: 'フィニッシュ用リスト（スタート時刻順）',
    purpose: '未帰還者を早い順に洗い出すための控え。',
    sortBy: 'startTime',
    groupByLane: false,
  },
];

/** ふりがなの姓（最初の空白まで）。空白が無ければ全体を返す */
function kanaSurname(entry: StartListEntry): string {
  const kana = entry.name2 || '';
  const parts = kana.split(/[\s\u3000]+/).filter(Boolean);
  return parts[0] || kana;
}

/** 1 列の定義 */
interface RoleColumn {
  header: string;
  /** LaTeX の列指定。p{} を使うときは幅の割合を width に入れる */
  align: 'l' | 'r' | 'p';
  width?: number;
  /** その列を大きく出す */
  big?: boolean;
  value: (entry: StartListEntry) => string;
}

function roleColumns(role: RoleName): RoleColumn[] {
  const card = (e: StartListEntry) =>
    e.isRental || !e.cardNumber ? 'レンタル' : e.cardNumber;

  if (role === '救護') {
    // どのキーからでも引けるよう、全項目を同じ大きさで載せる
    return [
      { header: 'ゼッケン', align: 'r', value: (e) => String(e.startNumber) },
      { header: '氏名', align: 'p', width: 0.18, value: (e) => e.name1 },
      { header: 'ふりがな', align: 'p', width: 0.18, value: (e) => e.name2 },
      { header: '所属', align: 'p', width: 0.2, value: (e) => e.affiliation || '-' },
      { header: 'クラス', align: 'l', value: (e) => e.className },
      { header: 'カード', align: 'l', value: card },
      { header: 'スタート', align: 'l', value: (e) => e.startTime },
    ];
  }

  if (role === 'スタート') {
    // 呼び出すのは「姓のふりがな」。そこだけ大きくする
    return [
      { header: '時刻', align: 'l', value: (e) => e.startTime },
      { header: 'ゼッケン', align: 'r', value: (e) => String(e.startNumber) },
      { header: '姓（かな）', align: 'p', width: 0.22, big: true, value: kanaSurname },
      { header: '氏名', align: 'p', width: 0.2, value: (e) => e.name1 },
      { header: 'クラス', align: 'l', value: (e) => e.className },
      { header: 'カード', align: 'l', value: card },
    ];
  }

  // フィニッシュ：見るのはゼッケン。消し込み欄を付ける
  return [
    { header: '帰還', align: 'l', value: () => '' },
    { header: 'ゼッケン', align: 'r', big: true, value: (e) => String(e.startNumber) },
    { header: '氏名', align: 'p', width: 0.22, value: (e) => e.name1 },
    { header: 'クラス', align: 'l', value: (e) => e.className },
    { header: 'カード', align: 'l', value: card },
    { header: 'スタート', align: 'l', value: (e) => e.startTime },
  ];
}

function sortForVariant(
  startList: StartListEntry[],
  variant: RoleListVariant
): StartListEntry[] {
  const list = [...startList];
  switch (variant.sortBy) {
    case 'startNumber':
      return list.sort((a, b) => a.startNumber - b.startNumber);
    case 'kana':
      return list.sort((a, b) =>
        (a.name2 || a.name1).localeCompare(b.name2 || b.name1, 'ja')
      );
    case 'cardNumber':
      return list.sort((a, b) => {
        const na = parseInt(a.cardNumber) || Number.MAX_SAFE_INTEGER;
        const nb = parseInt(b.cardNumber) || Number.MAX_SAFE_INTEGER;
        return na - nb || a.startNumber - b.startNumber;
      });
    case 'startTime':
    default:
      return list.sort(
        (a, b) => a.startTime.localeCompare(b.startTime) || a.startNumber - b.startNumber
      );
  }
}

/** 役職用リスト 1 種類分の LaTeX */
export function generateRoleVariantTex(
  startList: StartListEntry[],
  settings: GlobalSettings,
  variant: RoleListVariant
): string {
  const spec = TEMPLATE_SPECS[resolveTemplate(settings.texTemplate)];
  const columns = roleColumns(variant.role);

  const colSpec = columns
    .map((c) => {
      if (c.align === 'p') {
        return `>{\\raggedright\\arraybackslash}p{${(c.width || 0.2).toFixed(3)}\\textwidth}`;
      }
      return c.align;
    })
    .join('');

  const headerCells = columns.map((c) => `\\textbf{${escapeLatex(c.header)}}`).join(' & ');

  const cell = (c: RoleColumn, entry: StartListEntry): string => {
    if (c.header === '帰還') return '\\framebox[4mm]{\\rule{0pt}{3.5mm}}';
    const text = escapeLatex(c.value(entry));
    return c.big ? `{\\LARGE\\bfseries ${text}}` : text;
  };

  const table = (rows: StartListEntry[]): string => {
    let out = `\\begin{longtable}{${colSpec}}
\\specialrule{${spec.rules.top}}{0pt}{0pt}
${headerCells} \\\\
\\midrule
\\endfirsthead
\\multicolumn{${columns.length}}{@{}l}{\\small\\itshape 続き}\\\\
\\specialrule{${spec.rules.top}}{0pt}{0pt}
${headerCells} \\\\
\\midrule
\\endhead
\\specialrule{${spec.rules.bottom}}{0pt}{0pt}
\\endfoot
\\specialrule{${spec.rules.bottom}}{0pt}{0pt}
\\endlastfoot
`;
    for (const entry of rows) {
      out += columns.map((c) => cell(c, entry)).join(' & ') + ' \\\\\n';
    }
    out += '\\end{longtable}\n\n';
    return out;
  };

  // 二段組は役職用リストには向かない（当日に指でたどるため）
  const flatSpec = { ...spec, twoColumn: false };
  let tex = buildPreamble(flatSpec, settings, escapeLatex(variant.role), false);
  tex += `\n\\begin{document}\n${spec.bodyFont}\n\n`;
  tex += `\\begin{center}
{\\LARGE\\bfseries ${escapeLatex(settings.outputFolder || settings.competitionName)}}\\\\[4pt]
{\\large ${escapeLatex(variant.title)}}\\\\[2pt]
{\\small ${escapeLatex(variant.purpose)}}
\\end{center}
\\vspace{4mm}

`;

  const sorted = sortForVariant(startList, variant);

  if (variant.groupByLane && !settings.practiceMode) {
    const byLane = new Map<string, StartListEntry[]>();
    for (const entry of sorted) {
      const key = `${entry.startArea} - ${entry.lane}`;
      if (!byLane.has(key)) byLane.set(key, []);
      byLane.get(key)!.push(entry);
    }
    for (const key of sortLaneKeys(Array.from(byLane.keys()))) {
      const laneName = key.includes(' - ') ? key.split(' - ')[1] : key;
      tex += `\\laneheading{${escapeLatex(laneName)}}\n\n`;
      tex += table(byLane.get(key)!);
    }
  } else {
    tex += table(sorted);
  }

  tex += '\\end{document}\n';
  return tex;
}

/** 役職用リスト 1 種類分の CSV（Excel でそのまま開ける） */
export function generateRoleVariantCsv(
  startList: StartListEntry[],
  variant: RoleListVariant
): string {
  const columns = roleColumns(variant.role);
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const laneHeader = variant.groupByLane ? ['レーン'] : [];
  const header = [...laneHeader, ...columns.map((c) => c.header)].map(quote).join(',');

  const rows = sortForVariant(startList, variant).map((entry) => {
    const laneCell = variant.groupByLane ? [entry.lane || ''] : [];
    return [...laneCell, ...columns.map((c) => c.value(entry))].map(quote).join(',');
  });

  return '\uFEFF' + header + '\n' + rows.join('\n');
}

/** 役職用リストを全種類作る */
export function generateRoleVariantFiles(
  startList: StartListEntry[],
  settings: GlobalSettings
): RoleVariantFile[] {
  return ROLE_LIST_VARIANTS.map((variant) => ({
    id: variant.id,
    role: variant.role,
    title: variant.title,
    purpose: variant.purpose,
    fileBase: variant.fileBase,
    tex: generateRoleVariantTex(startList, settings, variant),
    csv: generateRoleVariantCsv(startList, variant),
  }));
}

/**
 * Generate all output files (both TeX and DOCX for public + role startlists)
 */
export async function generateOutputFiles(
  startList: StartListEntry[],
  settings: GlobalSettings
): Promise<OutputFiles> {
  const [publicDocx, roleDocx] = await Promise.all([
    generatePublicDocx(startList, settings),
    generateRoleDocx(startList, settings),
  ]);

  return {
    mulkaCsv: generateMulkaCsv(startList, settings),
    roleCsv: generateRoleCsv(startList, settings),
    publicTex: generatePublicTex(startList, settings),
    roleTex: generateRoleTex(startList, settings),
    publicDocx,
    roleDocx,
    classSummaryCsv: generateClassSummaryCsv(startList),
    roleVariants: generateRoleVariantFiles(startList, settings),
  };
}
