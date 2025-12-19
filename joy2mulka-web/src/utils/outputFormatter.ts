import { StartListEntry, GlobalSettings, OutputFiles } from '../types';

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
 */
export function generateMulkaCsv(startList: StartListEntry[]): string {
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
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  // Add BOM for UTF-8
  return '\uFEFF' + header + '\n' + rows.join('\n');
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
 * Generate Public TeX (Public_Startlist.tex)
 * Matches Python: write_public_startlist_tex function
 */
export function generatePublicTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
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

  // Build LaTeX document
  let tex = `\\documentclass[a4paper,10pt]{ltjsarticle}
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
\\begin{document}

\\section*{${escapeLatex(settings.outputFolder)} ${labels.startlist}}

`;

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
    tex += `\\section*{${escapeLatex(laneName)}}\n\n`;

    // Sort classes
    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      entries.sort((a, b) => a.startNumber - b.startNumber);

      const countLabel = `${entries.length} ${labels.entries}`;
      tex += `\\subsection*{${escapeLatex(className)} (${countLabel})}\n\n`;

      tex += `\\begin{longtable}{rllll}
\\toprule
${labels.no} & ${labels.time} & ${labels.name} & ${labels.affiliation} & ${labels.card} \\\\
\\midrule
\\endhead
`;

      for (const entry of entries) {
        const cardDisplay = entry.isRental || !entry.cardNumber ? labels.rental : entry.cardNumber;
        tex += `${entry.startNumber} & ${entry.startTime} & ${escapeLatex(entry.name1)} & ${escapeLatex(entry.affiliation)} & ${cardDisplay} \\\\\n`;
      }

      tex += `\\bottomrule
\\end{longtable}

`;
    }
  }

  tex += '\\end{document}\n';
  return tex;
}

/**
 * Generate Role TeX (Role_Startlist.tex)
 * Matches Python: write_role_startlist_tex function
 */
export function generateRoleTex(
  startList: StartListEntry[],
  settings: GlobalSettings
): string {
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
  let tex = `\\documentclass[a4paper,10pt]{ltjsarticle}
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
\\begin{document}

\\section*{${escapeLatex(settings.outputFolder)} 役員用スタートリスト}

`;

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
    tex += `\\section*{${escapeLatex(laneName)}}\n\n`;

    // Sort classes
    const sortedClasses = Array.from(classesInLane.keys()).sort();

    for (const className of sortedClasses) {
      const entries = classesInLane.get(className)!;
      entries.sort((a, b) => a.startNumber - b.startNumber);

      tex += `\\subsection*{${escapeLatex(className)} (${entries.length}名)}\n\n`;

      tex += `\\begin{longtable}{rlp{6cm}ll}
\\toprule
No. & 時刻 & 氏名 & 所属 & カード \\\\
\\midrule
\\endhead
`;

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

      tex += `\\bottomrule
\\end{longtable}

`;
    }
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
