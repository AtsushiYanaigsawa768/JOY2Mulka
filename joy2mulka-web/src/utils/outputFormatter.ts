import { StartListEntry, GlobalSettings, OutputFiles, TexTemplate, TexTemplateInfo } from '../types';

/**
 * Available TeX templates
 */
export const TEX_TEMPLATES: TexTemplateInfo[] = [
  {
    id: 'default',
    name: 'スタンダード',
    description: '標準的なシンプルなレイアウト',
    preview: 'シンプルなテーブル形式、見やすさ重視',
  },
  {
    id: 'modern',
    name: 'モダン',
    description: 'カラフルでおしゃれなデザイン',
    preview: '色付きヘッダー、丸みを帯びたデザイン',
  },
  {
    id: 'elegant',
    name: 'エレガント',
    description: '落ち着いた高級感のあるデザイン',
    preview: 'セリフフォント、装飾的なヘッダー',
  },
  {
    id: 'compact',
    name: 'コンパクト',
    description: '省スペースで多くの情報を表示',
    preview: '小さいフォント、密なレイアウト',
  },
  {
    id: 'festival',
    name: 'フェスティバル',
    description: '明るく華やかなお祭り風デザイン',
    preview: '赤・黄・オレンジの賑やかな色使い',
  },
  {
    id: 'japanese',
    name: '和風',
    description: '日本の伝統色を使った上品なデザイン',
    preview: '藍色・抹茶色など落ち着いた和の雰囲気',
  },
  {
    id: 'sporty',
    name: 'スポーティ',
    description: 'アクティブで躍動感のあるデザイン',
    preview: 'ダイナミックな色使いとレイアウト',
  },
  {
    id: 'minimal',
    name: 'ミニマル',
    description: '余白を活かしたシンプルなデザイン',
    preview: '白黒基調で読みやすさ重視',
  },
];

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
 * Generate Mulka CSV (Startlist.csv)
 * Matches Python: write_startlist_csv function
 *
 * Requirements:
 * - Line endings: CRLF (\r\n)
 * - Trailing newline: Yes
 * - Quoting: No quotes on data rows (only quote if field contains comma, newline, or quote)
 */
export function generateMulkaCsv(startList: StartListEntry[]): string {
  const CRLF = '\r\n';

  const header = [
    'クラス',
    'スタートナンバー',
    '氏名１',
    '氏名2',
    '所属',
    'スタート時刻',
    'カード番号',
    'カード備考',
    '競技者登録番号',
  ].join(',');

  const rows = startList.map((entry) => {
    const cardNote = entry.isRental || !entry.cardNumber ? 'レンタル' : 'my card';
    return [
      entry.className,
      entry.startNumber,
      entry.name1,
      entry.name2,
      entry.affiliation || '-',
      entry.startTime,
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
export function generateRoleCsv(startList: StartListEntry[]): string {
  const header = [
    'クラス',
    'スタートナンバー',
    '氏名',
    '所属',
    'スタート時刻',
    'カード番号',
    'チェックイン',
    '備考',
  ].join(',');

  const rows = startList.map((entry) => {
    const note = entry.isRental ? 'レンタル' : '';
    return [
      entry.className,
      entry.startNumber,
      entry.name1,
      entry.affiliation || '-',
      entry.startTime,
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
    entries: 'entries',
    no: 'No.',
    time: 'Time',
    name: 'Name',
    affiliation: 'Affiliation',
    card: 'Card',
    rental: '(rental)',
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
  },
};

/**
 * Get template-specific preamble
 */
function getTemplatePreamble(template: TexTemplate, settings: GlobalSettings): string {
  const labels = LABELS[settings.language] || LABELS.en;

  switch (template) {
    case 'modern':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{headerblue}{RGB}{41,128,185}
\\definecolor{lightgray}{RGB}{245,245,245}
\\definecolor{accentgreen}{RGB}{46,204,113}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{headerblue}{\\textbf{${escapeLatex(settings.competitionName)}}} - ${labels.startlist}}
\\fancyfoot[C]{\\thepage}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{headerblue}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'elegant':
      return `\\documentclass[a4paper,11pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}
\\usepackage{graphicx}

\\definecolor{darkgold}{RGB}{139,119,42}
\\definecolor{elegantgray}{RGB}{70,70,70}

\\geometry{margin=2.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\rule{\\textwidth}{0.4pt}\\\\[2pt]\\textsc{${escapeLatex(settings.competitionName)}}\\\\[-8pt]\\rule{\\textwidth}{0.4pt}}
\\fancyfoot[C]{\\textcolor{elegantgray}{--- \\thepage\\ ---}}
\\setlength{\\headheight}{30pt}
`;

    case 'compact':
      return `\\documentclass[a4paper,8pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{multicol}

\\geometry{margin=1cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\small ${escapeLatex(settings.competitionName)} - ${labels.startlist}}
\\fancyfoot[C]{\\small \\thepage}
\\setlength{\\headheight}{12pt}
\\setlength{\\columnsep}{0.5cm}
`;

    case 'festival':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{festivalred}{RGB}{220,50,50}
\\definecolor{festivalyellow}{RGB}{255,200,0}
\\definecolor{festivalorange}{RGB}{255,120,0}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{festivalred}{\\textbf{${escapeLatex(settings.competitionName)}}} - ${labels.startlist}}
\\fancyfoot[C]{\\textcolor{festivalorange}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{3pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{festivalyellow}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'japanese':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}

\\definecolor{aiiro}{RGB}{38,65,107}
\\definecolor{matcha}{RGB}{104,142,105}
\\definecolor{kiniro}{RGB}{196,175,112}

\\geometry{margin=2.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{aiiro}{\\rule{1cm}{0.5pt}\\hspace{0.5cm}${escapeLatex(settings.competitionName)}\\hspace{0.5cm}\\rule{1cm}{0.5pt}}}
\\fancyfoot[C]{\\textcolor{matcha}{--- \\thepage\\ ---}}
\\setlength{\\headheight}{20pt}
`;

    case 'sporty':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{sportyorange}{RGB}{255,102,0}
\\definecolor{sportygreen}{RGB}{0,180,120}
\\definecolor{sportyblue}{RGB}{0,120,210}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{sportyblue}{\\textbf{${escapeLatex(settings.competitionName)}}} \\textcolor{sportyorange}{//} ${labels.startlist}}
\\fancyfoot[C]{\\textcolor{sportygreen}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{sportyorange}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'minimal':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{xcolor}

\\definecolor{minimalaccent}{RGB}{80,80,80}
\\definecolor{minimalgray}{RGB}{150,150,150}

\\geometry{margin=3cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{minimalgray}{${escapeLatex(settings.competitionName)}}}
\\fancyfoot[C]{\\textcolor{minimalgray}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{minimalgray}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    default: // 'default'
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}

\\geometry{margin=2cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{${escapeLatex(settings.competitionName)} - ${labels.startlist}}
\\fancyfoot[C]{\\thepage}
\\setlength{\\headheight}{15pt}
`;
  }
}

/**
 * Get template-specific table styling
 */
function getTemplateTableStart(template: TexTemplate, labels: typeof LABELS.ja): string {
  switch (template) {
    case 'modern':
      return `\\begin{longtable}{rllll}
\\rowcolor{headerblue}
\\textcolor{white}{\\textbf{${labels.no}}} & \\textcolor{white}{\\textbf{${labels.time}}} & \\textcolor{white}{\\textbf{${labels.name}}} & \\textcolor{white}{\\textbf{${labels.affiliation}}} & \\textcolor{white}{\\textbf{${labels.card}}} \\\\
\\endhead
`;

    case 'elegant':
      return `\\begin{longtable}{rllll}
\\toprule
\\textsc{${labels.no}} & \\textsc{${labels.time}} & \\textsc{${labels.name}} & \\textsc{${labels.affiliation}} & \\textsc{${labels.card}} \\\\
\\midrule
\\endhead
`;

    case 'compact':
      return `\\begin{longtable}{rllll}
\\hline
${labels.no} & ${labels.time} & ${labels.name} & ${labels.affiliation} & ${labels.card} \\\\
\\hline
\\endhead
`;

    case 'festival':
      return `\\begin{longtable}{rllll}
\\rowcolor{festivalyellow}
\\textcolor{festivalred}{\\textbf{${labels.no}}} & \\textcolor{festivalred}{\\textbf{${labels.time}}} & \\textcolor{festivalred}{\\textbf{${labels.name}}} & \\textcolor{festivalred}{\\textbf{${labels.affiliation}}} & \\textcolor{festivalred}{\\textbf{${labels.card}}} \\\\
\\endhead
`;

    case 'japanese':
      return `\\begin{longtable}{rllll}
\\toprule[1.5pt]
\\textcolor{aiiro}{${labels.no}} & \\textcolor{aiiro}{${labels.time}} & \\textcolor{aiiro}{${labels.name}} & \\textcolor{aiiro}{${labels.affiliation}} & \\textcolor{aiiro}{${labels.card}} \\\\
\\midrule
\\endhead
`;

    case 'sporty':
      return `\\begin{longtable}{rllll}
\\rowcolor{sportyblue}
\\textcolor{white}{\\textbf{${labels.no}}} & \\textcolor{white}{\\textbf{${labels.time}}} & \\textcolor{white}{\\textbf{${labels.name}}} & \\textcolor{white}{\\textbf{${labels.affiliation}}} & \\textcolor{white}{\\textbf{${labels.card}}} \\\\
\\endhead
`;

    case 'minimal':
      return `\\begin{longtable}{rllll}
\\hline
\\textcolor{minimalaccent}{${labels.no}} & \\textcolor{minimalaccent}{${labels.time}} & \\textcolor{minimalaccent}{${labels.name}} & \\textcolor{minimalaccent}{${labels.affiliation}} & \\textcolor{minimalaccent}{${labels.card}} \\\\
\\hline
\\endhead
`;

    default:
      return `\\begin{longtable}{rllll}
\\toprule
${labels.no} & ${labels.time} & ${labels.name} & ${labels.affiliation} & ${labels.card} \\\\
\\midrule
\\endhead
`;
  }
}

/**
 * Get template-specific table ending
 */
function getTemplateTableEnd(template: TexTemplate): string {
  switch (template) {
    case 'modern':
      return `\\hline
\\end{longtable}

`;
    case 'compact':
      return `\\hline
\\end{longtable}

`;
    case 'festival':
      return `\\hline
\\end{longtable}

`;
    case 'japanese':
      return `\\bottomrule[1.5pt]
\\end{longtable}

`;
    case 'sporty':
      return `\\hline
\\end{longtable}

`;
    case 'minimal':
      return `\\hline
\\end{longtable}

`;
    default:
      return `\\bottomrule
\\end{longtable}

`;
  }
}

/**
 * Get template-specific section styling
 */
function getTemplateSectionStyle(template: TexTemplate, title: string): string {
  switch (template) {
    case 'modern':
      return `\\begin{tcolorbox}[colback=lightgray,colframe=headerblue,arc=3mm,boxrule=1pt]
{\\Large\\textbf{${title}}}
\\end{tcolorbox}

`;
    case 'elegant':
      return `\\vspace{0.5cm}
{\\Large\\textcolor{darkgold}{\\textsc{${title}}}}
\\vspace{0.3cm}
\\hrule
\\vspace{0.3cm}

`;
    case 'compact':
      return `{\\normalsize\\textbf{${title}}}\\\\

`;
    case 'festival':
      return `\\begin{tcolorbox}[colback=festivalyellow!20,colframe=festivalred,arc=5mm,boxrule=2pt]
{\\Large\\textcolor{festivalred}{\\textbf{${title}}}}
\\end{tcolorbox}

`;
    case 'japanese':
      return `\\vspace{0.5cm}
{\\Large\\textcolor{aiiro}{\\rule{0.5cm}{0.5pt}\\hspace{0.3cm}${title}\\hspace{0.3cm}\\rule{0.5cm}{0.5pt}}}
\\vspace{0.3cm}

`;
    case 'sporty':
      return `\\begin{tcolorbox}[colback=sportyorange!10,colframe=sportyblue,arc=0mm,boxrule=2pt]
{\\Large\\textcolor{sportyblue}{\\textbf{${title}}}}
\\end{tcolorbox}

`;
    case 'minimal':
      return `\\vspace{0.8cm}
{\\Large\\textcolor{minimalaccent}{${title}}}\\\\[3pt]
\\textcolor{minimalgray}{\\rule{\\textwidth}{0.5pt}}
\\vspace{0.3cm}

`;
    default:
      return `\\section*{${title}}\n\n`;
  }
}

/**
 * Get template-specific subsection styling
 */
function getTemplateSubsectionStyle(template: TexTemplate, title: string, count: string): string {
  switch (template) {
    case 'modern':
      return `{\\large\\textcolor{headerblue}{\\textbf{${title}}} \\textcolor{accentgreen}{(${count})}}\n\n`;
    case 'elegant':
      return `{\\large\\textsc{${title}} \\textcolor{elegantgray}{(${count})}}\n\n`;
    case 'compact':
      return `{\\small\\textbf{${title}} (${count})}\n\n`;
    case 'festival':
      return `{\\large\\textcolor{festivalorange}{\\textbf{${title}}} \\textcolor{festivalred}{(${count})}}\n\n`;
    case 'japanese':
      return `{\\large\\textcolor{matcha}{${title}} \\textcolor{kiniro}{(${count})}}\n\n`;
    case 'sporty':
      return `{\\large\\textcolor{sportygreen}{\\textbf{${title}}} \\textcolor{sportyorange}{(${count})}}\n\n`;
    case 'minimal':
      return `{\\large\\textcolor{minimalaccent}{${title}} \\textcolor{minimalgray}{(${count})}}\n\n`;
    default:
      return `\\subsection*{${title} (${count})}\n\n`;
  }
}

/**
 * Generate Public TeX (Public_Startlist.tex)
 * Matches Python: write_public_startlist_tex function
 */
export function generatePublicTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  const labels = LABELS[settings.language] || LABELS.en;
  const template = settings.texTemplate || 'default';

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

  // Build LaTeX document
  let tex = getTemplatePreamble(template, settings);
  tex += `\\begin{document}

`;

  // Title
  if (template === 'modern') {
    tex += `\\begin{center}
{\\Huge\\textcolor{headerblue}{\\textbf{${escapeLatex(settings.outputFolder)}}}}\\\\[5pt]
{\\Large ${labels.startlist}}
\\end{center}
\\vspace{1cm}

`;
  } else if (template === 'elegant') {
    tex += `\\begin{center}
{\\LARGE\\textsc{${escapeLatex(settings.outputFolder)}}}\\\\[10pt]
\\rule{5cm}{0.4pt}\\\\[5pt]
{\\large ${labels.startlist}}
\\end{center}
\\vspace{1cm}

`;
  } else if (template === 'compact') {
    tex += `\\begin{multicols}{2}
{\\large\\textbf{${escapeLatex(settings.outputFolder)} ${labels.startlist}}}\\\\[5pt]

`;
  } else {
    tex += `\\section*{${escapeLatex(settings.outputFolder)} ${labels.startlist}}

`;
  }

  // Sort lanes
  const sortedLanes = Array.from(byLane.keys()).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '999');
    const numB = parseInt(b.match(/\d+/)?.[0] || '999');
    return numA - numB || a.localeCompare(b);
  });

  for (const laneKey of sortedLanes) {
    const classesInLane = byLane.get(laneKey)!;

    // Extract just the lane name (remove area prefix)
    const laneName = laneKey.includes(' - ') ? laneKey.split(' - ')[1] : laneKey;
    tex += getTemplateSectionStyle(template, escapeLatex(laneName));

    // Sort classes
    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      entries.sort((a, b) => a.startNumber - b.startNumber);

      const countLabel = `${entries.length} ${labels.entries}`;
      tex += getTemplateSubsectionStyle(template, escapeLatex(className), countLabel);
      tex += getTemplateTableStart(template, labels);

      for (const entry of entries) {
        const cardDisplay = entry.isRental || !entry.cardNumber ? labels.rental : entry.cardNumber;
        tex += `${entry.startNumber} & ${entry.startTime} & ${escapeLatex(entry.name1)} & ${escapeLatex(entry.affiliation)} & ${cardDisplay} \\\\\n`;
      }

      tex += getTemplateTableEnd(template);
    }
  }

  if (template === 'compact') {
    tex += '\\end{multicols}\n';
  }

  tex += '\\end{document}\n';
  return tex;
}

/**
 * Get template-specific preamble for Role TeX
 */
function getRoleTemplatePreamble(template: TexTemplate, settings: GlobalSettings): string {
  switch (template) {
    case 'modern':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{headerblue}{RGB}{41,128,185}
\\definecolor{lightgray}{RGB}{245,245,245}
\\definecolor{accentgreen}{RGB}{46,204,113}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{headerblue}{\\textbf{${escapeLatex(settings.competitionName)}}} - 役員用スタートリスト}
\\fancyfoot[C]{\\thepage}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{headerblue}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'elegant':
      return `\\documentclass[a4paper,11pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}

\\definecolor{darkgold}{RGB}{139,119,42}
\\definecolor{elegantgray}{RGB}{70,70,70}

\\geometry{margin=2.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\rule{\\textwidth}{0.4pt}\\\\[2pt]\\textsc{${escapeLatex(settings.competitionName)}}\\\\[-8pt]\\rule{\\textwidth}{0.4pt}}
\\fancyfoot[C]{\\textcolor{elegantgray}{--- \\thepage\\ ---}}
\\setlength{\\headheight}{30pt}
`;

    case 'compact':
      return `\\documentclass[a4paper,8pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{multicol}

\\geometry{margin=1cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\small ${escapeLatex(settings.competitionName)} - 役員用スタートリスト}
\\fancyfoot[C]{\\small \\thepage}
\\setlength{\\headheight}{12pt}
\\setlength{\\columnsep}{0.5cm}
`;

    case 'festival':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{festivalred}{RGB}{220,50,50}
\\definecolor{festivalyellow}{RGB}{255,200,0}
\\definecolor{festivalorange}{RGB}{255,120,0}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{festivalred}{\\textbf{${escapeLatex(settings.competitionName)}}} - 役員用スタートリスト}
\\fancyfoot[C]{\\textcolor{festivalorange}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{3pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{festivalyellow}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'japanese':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}

\\definecolor{aiiro}{RGB}{38,65,107}
\\definecolor{matcha}{RGB}{104,142,105}
\\definecolor{kiniro}{RGB}{196,175,112}

\\geometry{margin=2.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{aiiro}{\\rule{1cm}{0.5pt}\\hspace{0.5cm}${escapeLatex(settings.competitionName)}\\hspace{0.5cm}\\rule{1cm}{0.5pt}}}
\\fancyfoot[C]{\\textcolor{matcha}{--- \\thepage\\ ---}}
\\setlength{\\headheight}{20pt}
`;

    case 'sporty':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}
\\usepackage{colortbl}
\\usepackage{tcolorbox}

\\definecolor{sportyorange}{RGB}{255,102,0}
\\definecolor{sportygreen}{RGB}{0,180,120}
\\definecolor{sportyblue}{RGB}{0,120,210}

\\geometry{margin=1.5cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{sportyblue}{\\textbf{${escapeLatex(settings.competitionName)}}} \\textcolor{sportyorange}{//} 役員用スタートリスト}
\\fancyfoot[C]{\\textcolor{sportygreen}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{sportyorange}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    case 'minimal':
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}
\\usepackage{xcolor}

\\definecolor{minimalaccent}{RGB}{80,80,80}
\\definecolor{minimalgray}{RGB}{150,150,150}

\\geometry{margin=3cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\textcolor{minimalgray}{${escapeLatex(settings.competitionName)}}}
\\fancyfoot[C]{\\textcolor{minimalgray}{\\thepage}}
\\setlength{\\headheight}{15pt}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{minimalgray}\\leaders\\hrule height \\headrulewidth\\hfill}}
`;

    default:
      return `\\documentclass[a4paper,10pt]{ltjsarticle}
\\usepackage{geometry}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{fancyhdr}
\\usepackage{luatexja-ruby}

\\geometry{margin=2cm}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{${escapeLatex(settings.competitionName)} - 役員用スタートリスト}
\\fancyfoot[C]{\\thepage}
\\setlength{\\headheight}{15pt}
`;
  }
}

/**
 * Get template-specific table start for Role TeX
 */
function getRoleTemplateTableStart(template: TexTemplate): string {
  switch (template) {
    case 'modern':
      return `\\begin{longtable}{rlp{6cm}ll}
\\rowcolor{headerblue}
\\textcolor{white}{\\textbf{No.}} & \\textcolor{white}{\\textbf{時刻}} & \\textcolor{white}{\\textbf{氏名}} & \\textcolor{white}{\\textbf{所属}} & \\textcolor{white}{\\textbf{カード}} \\\\
\\endhead
`;

    case 'elegant':
      return `\\begin{longtable}{rlp{6cm}ll}
\\toprule
\\textsc{No.} & \\textsc{時刻} & \\textsc{氏名} & \\textsc{所属} & \\textsc{カード} \\\\
\\midrule
\\endhead
`;

    case 'compact':
      return `\\begin{longtable}{rlp{5cm}ll}
\\hline
No. & 時刻 & 氏名 & 所属 & カード \\\\
\\hline
\\endhead
`;

    case 'festival':
      return `\\begin{longtable}{rlp{6cm}ll}
\\rowcolor{festivalyellow}
\\textcolor{festivalred}{\\textbf{No.}} & \\textcolor{festivalred}{\\textbf{時刻}} & \\textcolor{festivalred}{\\textbf{氏名}} & \\textcolor{festivalred}{\\textbf{所属}} & \\textcolor{festivalred}{\\textbf{カード}} \\\\
\\endhead
`;

    case 'japanese':
      return `\\begin{longtable}{rlp{6cm}ll}
\\toprule[1.5pt]
\\textcolor{aiiro}{No.} & \\textcolor{aiiro}{時刻} & \\textcolor{aiiro}{氏名} & \\textcolor{aiiro}{所属} & \\textcolor{aiiro}{カード} \\\\
\\midrule
\\endhead
`;

    case 'sporty':
      return `\\begin{longtable}{rlp{6cm}ll}
\\rowcolor{sportyblue}
\\textcolor{white}{\\textbf{No.}} & \\textcolor{white}{\\textbf{時刻}} & \\textcolor{white}{\\textbf{氏名}} & \\textcolor{white}{\\textbf{所属}} & \\textcolor{white}{\\textbf{カード}} \\\\
\\endhead
`;

    case 'minimal':
      return `\\begin{longtable}{rlp{6cm}ll}
\\hline
\\textcolor{minimalaccent}{No.} & \\textcolor{minimalaccent}{時刻} & \\textcolor{minimalaccent}{氏名} & \\textcolor{minimalaccent}{所属} & \\textcolor{minimalaccent}{カード} \\\\
\\hline
\\endhead
`;

    default:
      return `\\begin{longtable}{rlp{6cm}ll}
\\toprule
No. & 時刻 & 氏名 & 所属 & カード \\\\
\\midrule
\\endhead
`;
  }
}

/**
 * Generate Role TeX (Role_Startlist.tex)
 * Matches Python: write_role_startlist_tex function
 */
export function generateRoleTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
  const template = settings.texTemplate || 'default';

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

  // Build LaTeX document
  let tex = getRoleTemplatePreamble(template, settings);
  tex += `\\begin{document}

`;

  // Title
  if (template === 'modern') {
    tex += `\\begin{center}
{\\Huge\\textcolor{headerblue}{\\textbf{${escapeLatex(settings.outputFolder)}}}}\\\\[5pt]
{\\Large 役員用スタートリスト}
\\end{center}
\\vspace{1cm}

`;
  } else if (template === 'elegant') {
    tex += `\\begin{center}
{\\LARGE\\textsc{${escapeLatex(settings.outputFolder)}}}\\\\[10pt]
\\rule{5cm}{0.4pt}\\\\[5pt]
{\\large 役員用スタートリスト}
\\end{center}
\\vspace{1cm}

`;
  } else if (template === 'compact') {
    tex += `\\begin{multicols}{2}
{\\large\\textbf{${escapeLatex(settings.outputFolder)} 役員用スタートリスト}}\\\\[5pt]

`;
  } else {
    tex += `\\section*{${escapeLatex(settings.outputFolder)} 役員用スタートリスト}

`;
  }

  // Sort lanes
  const sortedLanes = Array.from(byLane.keys()).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '999');
    const numB = parseInt(b.match(/\d+/)?.[0] || '999');
    return numA - numB || a.localeCompare(b);
  });

  for (const laneKey of sortedLanes) {
    const classesInLane = byLane.get(laneKey)!;

    // Extract just the lane name
    const laneName = laneKey.includes(' - ') ? laneKey.split(' - ')[1] : laneKey;
    tex += getTemplateSectionStyle(template, escapeLatex(laneName));

    // Sort classes
    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      entries.sort((a, b) => a.startNumber - b.startNumber);

      tex += getTemplateSubsectionStyle(template, escapeLatex(className), `${entries.length}名`);
      tex += getRoleTemplateTableStart(template);

      for (const entry of entries) {
        const cardDisplay = entry.isRental || !entry.cardNumber ? 'レンタル' : entry.cardNumber;

        // Create name with furigana if name2 exists
        let nameDisplay: string;
        if (entry.name2 && entry.name1) {
          nameDisplay = `\\ruby{${escapeLatex(entry.name1)}}{${escapeLatex(entry.name2)}}`;
        } else {
          nameDisplay = escapeLatex(entry.name1);
        }

        tex += `${entry.startNumber} & ${entry.startTime} & ${nameDisplay} & ${escapeLatex(entry.affiliation)} & ${cardDisplay} \\\\\n`;
      }

      tex += getTemplateTableEnd(template);
    }
  }

  if (template === 'compact') {
    tex += '\\end{multicols}\n';
  }

  tex += '\\end{document}\n';
  return tex;
}

/**
 * Generate all output files
 */
export function generateOutputFiles(
  startList: StartListEntry[],
  settings: GlobalSettings
): OutputFiles {
  return {
    mulkaCsv: generateMulkaCsv(startList),
    roleCsv: generateRoleCsv(startList),
    publicTex: generatePublicTex(startList, settings),
    roleTex: generateRoleTex(startList, settings),
    classSummaryCsv: generateClassSummaryCsv(startList),
  };
}
