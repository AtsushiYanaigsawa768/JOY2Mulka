import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import Papa from 'papaparse';
import { StartListEntry } from '../types';
import {
  generateOutputFiles,
} from '../utils/outputFormatter';

interface ParsedFileData {
  startList: StartListEntry[];
  classes: string[];
  fileName: string;
  fileType: 'csv' | 'tex';
}

export default function Step0Update() {
  const { state, dispatch, goToStep } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedFileData | null>(null);

  const parseCSVContent = (content: string): StartListEntry[] => {
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const result = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV解析エラー: ${result.errors[0].message}`);
    }

    const rows = result.data;
    if (rows.length < 2) {
      throw new Error('CSVにデータがありません');
    }

    // Skip header row
    const dataRows = rows.slice(1);
    return dataRows.map((row, idx) => ({
      className: row[0] || '',
      startNumber: parseInt(row[1]) || idx + 1,
      name1: row[2] || '',
      name2: row[3] || '',
      affiliation: row[4] || '-',
      startTime: row[5] || '',
      cardNumber: row[6] || '',
      cardNote: row[7] || '',
      joaNumber: row[8] || '',
      isRental: (row[7] || '').includes('レンタル'),
      lane: '',
      startArea: '',
    }));
  };

  const parseTeXContent = (content: string): StartListEntry[] => {
    const entries: StartListEntry[] = [];
    let currentClass = '';

    // Parse LaTeX table rows
    // Match lines like: 1 & 10:00:00 & 山田太郎 & 東京OLC & 12345 \\
    const tableRowRegex = /(\d+)\s*&\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*&\s*(.+?)\s*&\s*(.+?)\s*&\s*(\S+)\s*\\\\/g;

    // Also match subsection for class names
    const subsectionRegex = /\\subsection\*\{([^}]+)\}/g;

    let match;

    // Find class names
    const classMatches: { index: number; name: string }[] = [];
    while ((match = subsectionRegex.exec(content)) !== null) {
      // Extract class name (remove count like "(10名)")
      const className = match[1].replace(/\s*\(\d+[名件]\)/, '').trim();
      classMatches.push({ index: match.index, name: className });
    }

    // Parse table rows and assign to classes
    while ((match = tableRowRegex.exec(content)) !== null) {
      const rowIndex = match.index;

      // Find the current class based on position
      for (const classMatch of classMatches) {
        if (classMatch.index < rowIndex) {
          currentClass = classMatch.name;
        }
      }

      const startTime = match[2].includes(':') && match[2].split(':').length === 2
        ? `${match[2]}:00`
        : match[2];

      // Parse name - handle ruby macro
      let name1 = match[3].trim();
      let name2 = '';
      const rubyMatch = name1.match(/\\ruby\{([^}]+)\}\{([^}]+)\}/);
      if (rubyMatch) {
        name1 = rubyMatch[1];
        name2 = rubyMatch[2];
      }

      const cardNumber = match[5].trim();
      const isRental = cardNumber === 'レンタル' || cardNumber === '(rental)';

      entries.push({
        className: currentClass,
        startNumber: parseInt(match[1]),
        name1,
        name2,
        affiliation: match[4].trim().replace(/\\_/g, '_'),
        startTime,
        cardNumber: isRental ? '' : cardNumber,
        cardNote: isRental ? 'レンタル' : 'my card',
        joaNumber: '',
        isRental,
        lane: '',
        startArea: '',
      });
    }

    if (entries.length === 0) {
      throw new Error('TeXファイルからエントリーを抽出できませんでした');
    }

    return entries;
  };

  const parseFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      let startList: StartListEntry[];
      let fileType: 'csv' | 'tex';

      if (file.name.endsWith('.csv')) {
        startList = parseCSVContent(content);
        fileType = 'csv';
      } else if (file.name.endsWith('.tex')) {
        startList = parseTeXContent(content);
        fileType = 'tex';
      } else {
        dispatch({ type: 'SET_ERROR', payload: '.csv または .tex ファイルをアップロードしてください' });
        setIsLoading(false);
        return;
      }

      const classes = [...new Set(startList.map(e => e.className))].sort();

      setParsedData({
        startList,
        classes,
        fileName: file.name,
        fileType,
      });
      setIsLoading(false);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: `ファイル読み込みエラー: ${error}` });
      setIsLoading(false);
    }
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f => f.name.endsWith('.csv') || f.name.endsWith('.tex'));

    if (validFile) {
      parseFile(validFile);
    } else {
      dispatch({ type: 'SET_ERROR', payload: '.csv または .tex ファイルをアップロードしてください' });
    }
  }, [parseFile, dispatch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tex'))) {
      parseFile(file);
    } else if (file) {
      dispatch({ type: 'SET_ERROR', payload: '.csv または .tex ファイルをアップロードしてください' });
    }
  };

  const handleProceedToDownload = async () => {
    if (!parsedData) return;

    setIsLoading(true);
    try {
      // Set start list
      dispatch({ type: 'SET_START_LIST', payload: parsedData.startList });

      // Generate output files (TeX + DOCX)
      const outputFiles = await generateOutputFiles(parsedData.startList, state.globalSettings);
      dispatch({ type: 'SET_OUTPUT_FILES', payload: outputFiles });

      // Directly dispatch step change (bypass canProceedToStep check since state update is async)
      dispatch({ type: 'SET_STEP', payload: 'done' });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : '出力ファイル生成に失敗しました',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">エントリーリストの更新</h2>

      {!parsedData ? (
        <>
          <div className="mb-4 text-sm text-gray-600">
            CSVファイルまたはTeXファイルをアップロードして、各形式のスタートリストに変換します。
          </div>

          {/* Upload Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400'}
              ${isLoading ? 'opacity-50' : ''}
            `}
          >
            <div className="text-5xl mb-4">🔄</div>
            <p className="text-lg text-gray-700 mb-2">
              CSV/TeXファイルをドロップ
            </p>
            <p className="text-sm text-gray-500 mb-4">または</p>
            <label className="inline-block px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 cursor-pointer">
              ファイルを選択
              <input
                type="file"
                accept=".csv,.tex"
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </label>
            {isLoading && (
              <div className="mt-4 text-purple-600">読み込み中...</div>
            )}
          </div>

          {/* Supported formats */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">対応形式</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>CSV</strong>: Startlist.csv, Role_Startlist.csv 形式</li>
              <li>• <strong>TeX</strong>: Public_Startlist.tex, Role_Startlist.tex 形式</li>
            </ul>
          </div>

          {/* Back button */}
          <div className="mt-6">
            <button
              onClick={() => goToStep('menu')}
              className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
            >
              ← メニューに戻る
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Preview */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">読み込み結果</h3>
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <span className="font-medium">{parsedData.fileName}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ({parsedData.fileType.toUpperCase()})
                </span>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">クラス</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">No.</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">時刻</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">所属</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedData.startList.slice(0, 20).map((entry, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-sm text-gray-900">{entry.className}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{entry.startNumber}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{entry.startTime}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{entry.name1}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{entry.affiliation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.startList.length > 20 && (
                  <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                    ... 他 {parsedData.startList.length - 20} 件
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-purple-800 mb-2">変換サマリー</h3>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>• 総エントリー数: {parsedData.startList.length}名</li>
              <li>• クラス数: {parsedData.classes.length}クラス</li>
              <li>• クラス一覧: {parsedData.classes.slice(0, 10).join(', ')}{parsedData.classes.length > 10 ? '...' : ''}</li>
            </ul>
          </div>

          {/* Output formats info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-800 mb-2">出力形式</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Startlist.csv (Mulka用)</li>
              <li>• Role_Startlist.csv (役職用)</li>
              <li>• Public_Startlist.tex (公開用LaTeX)</li>
              <li>• Role_Startlist.tex (役職用LaTeX)</li>
              <li>• Class_Summary.csv (クラス集計)</li>
            </ul>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={() => setParsedData(null)}
              className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
            >
              ← 別のファイルを選択
            </button>
            <button
              onClick={handleProceedToDownload}
              className="px-6 py-2 rounded-md font-medium bg-purple-600 text-white hover:bg-purple-700"
            >
              変換してダウンロード →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
