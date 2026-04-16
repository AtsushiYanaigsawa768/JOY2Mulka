import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { StartListEntry } from '../types';
import { generateOutputFiles } from '../utils/outputFormatter';

interface ParsedZipData {
  startList: StartListEntry[];
  classes: string[];
  rawCsv: string;
  fileName: string;
}

export default function Step0Edit() {
  const { state, dispatch, goToStep } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedZipData | null>(null);
  const [editedStartList, setEditedStartList] = useState<StartListEntry[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const parseZipFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const zip = await JSZip.loadAsync(file);

      // Find the Startlist.csv or Role_Startlist.csv file
      let csvContent = '';
      let fileName = '';

      for (const [name, zipEntry] of Object.entries(zip.files)) {
        if (name.endsWith('Startlist.csv') && !name.includes('Role_') && !name.includes('Class_Summary')) {
          csvContent = await zipEntry.async('string');
          fileName = name;
          break;
        }
      }

      // Fallback to Role_Startlist.csv if Startlist.csv not found
      if (!csvContent) {
        for (const [name, zipEntry] of Object.entries(zip.files)) {
          if (name.includes('Role_Startlist.csv')) {
            csvContent = await zipEntry.async('string');
            fileName = name;
            break;
          }
        }
      }

      if (!csvContent) {
        dispatch({ type: 'SET_ERROR', payload: 'ZIPファイルにStartlist.csvが見つかりません' });
        setIsLoading(false);
        return;
      }

      // Remove BOM if present
      if (csvContent.charCodeAt(0) === 0xFEFF) {
        csvContent = csvContent.slice(1);
      }

      // Parse CSV
      const result = Papa.parse<string[]>(csvContent, {
        header: false,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0) {
        dispatch({ type: 'SET_ERROR', payload: `CSV解析エラー: ${result.errors[0].message}` });
        setIsLoading(false);
        return;
      }

      const rows = result.data;
      if (rows.length < 2) {
        dispatch({ type: 'SET_ERROR', payload: 'CSVにデータがありません' });
        setIsLoading(false);
        return;
      }

      // Skip header row
      const dataRows = rows.slice(1);
      const startList: StartListEntry[] = dataRows.map((row, idx) => ({
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
        lane: '',  // Will be determined later
        startArea: '',  // Will be determined later
      }));

      // Get unique classes
      const classes = [...new Set(startList.map(e => e.className))].sort();

      setParsedData({
        startList,
        classes,
        rawCsv: csvContent,
        fileName,
      });
      setEditedStartList(startList);
      setSelectedClass(classes[0] || null);
      setIsLoading(false);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: `ZIPファイル読み込みエラー: ${error}` });
      setIsLoading(false);
    }
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const zipFile = files.find(f => f.name.endsWith('.zip'));

    if (zipFile) {
      parseZipFile(zipFile);
    } else {
      dispatch({ type: 'SET_ERROR', payload: '.zipファイルをアップロードしてください' });
    }
  }, [parseZipFile, dispatch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      parseZipFile(file);
    } else if (file) {
      dispatch({ type: 'SET_ERROR', payload: '.zipファイルをアップロードしてください' });
    }
  };

  const handleEditEntry = (index: number, field: keyof StartListEntry, value: string | number) => {
    setEditedStartList(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleMoveEntry = (index: number, direction: 'up' | 'down') => {
    setEditedStartList(prev => {
      const updated = [...prev];
      const classEntries = updated.filter(e => e.className === selectedClass);

      const entryIndex = classEntries.findIndex(e => e === updated[index]);
      if (direction === 'up' && entryIndex > 0) {
        [classEntries[entryIndex - 1], classEntries[entryIndex]] = [classEntries[entryIndex], classEntries[entryIndex - 1]];
      } else if (direction === 'down' && entryIndex < classEntries.length - 1) {
        [classEntries[entryIndex], classEntries[entryIndex + 1]] = [classEntries[entryIndex + 1], classEntries[entryIndex]];
      }

      // Rebuild the array with updated class entries
      const classEntriesCopy = [...classEntries];
      const result: StartListEntry[] = [];
      for (const entry of updated) {
        if (entry.className === selectedClass) {
          if (classEntriesCopy.length > 0) {
            result.push(classEntriesCopy.shift()!);
          }
        } else {
          result.push(entry);
        }
      }

      return result;
    });
  };

  const handleProceedToDownload = async () => {
    setIsLoading(true);
    try {
      // Convert edited start list to the format expected by the app
      dispatch({ type: 'SET_START_LIST', payload: editedStartList });

      // Generate output files (TeX + DOCX)
      const outputFiles = await generateOutputFiles(editedStartList, state.globalSettings);
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

  const filteredEntries = editedStartList.filter(e => e.className === selectedClass);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">エントリーリストの修正</h2>

      {!parsedData ? (
        <>
          <div className="mb-4 text-sm text-gray-600">
            既存のスタートリスト（.zipファイル）をアップロードして、修正を行います。
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
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              ${isLoading ? 'opacity-50' : ''}
            `}
          >
            <div className="text-5xl mb-4">📦</div>
            <p className="text-lg text-gray-700 mb-2">
              ZIPファイルをドロップ
            </p>
            <p className="text-sm text-gray-500 mb-4">または</p>
            <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
              ファイルを選択
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </label>
            {isLoading && (
              <div className="mt-4 text-blue-600">読み込み中...</div>
            )}
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
          {/* Class selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              クラスを選択
            </label>
            <div className="flex flex-wrap gap-2">
              {parsedData.classes.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    selectedClass === cls
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cls} ({editedStartList.filter(e => e.className === cls).length})
                </button>
              ))}
            </div>
          </div>

          {/* Entry list editor */}
          {selectedClass && (
            <div className="mb-6">
              <h3 className="font-medium mb-3">{selectedClass} のエントリー一覧</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">順序</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">No.</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">時刻</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">所属</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">カード</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEntries.map((entry, idx) => {
                      const globalIndex = editedStartList.findIndex(e => e === entry);
                      return (
                        <tr key={globalIndex} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={entry.startNumber}
                              onChange={(e) => handleEditEntry(globalIndex, 'startNumber', parseInt(e.target.value))}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.startTime}
                              onChange={(e) => handleEditEntry(globalIndex, 'startTime', e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.name1}
                              onChange={(e) => handleEditEntry(globalIndex, 'name1', e.target.value)}
                              className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.affiliation}
                              onChange={(e) => handleEditEntry(globalIndex, 'affiliation', e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.cardNumber}
                              onChange={(e) => handleEditEntry(globalIndex, 'cardNumber', e.target.value)}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleMoveEntry(globalIndex, 'up')}
                                disabled={idx === 0}
                                className={`px-2 py-1 text-xs rounded ${
                                  idx === 0
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => handleMoveEntry(globalIndex, 'down')}
                                disabled={idx === filteredEntries.length - 1}
                                className={`px-2 py-1 text-xs rounded ${
                                  idx === filteredEntries.length - 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                ▼
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-800 mb-2">サマリー</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 総エントリー数: {editedStartList.length}名</li>
              <li>• クラス数: {parsedData.classes.length}クラス</li>
              <li>• 元ファイル: {parsedData.fileName}</li>
            </ul>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={() => {
                setParsedData(null);
                setEditedStartList([]);
                setSelectedClass(null);
              }}
              className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
            >
              ← 別のファイルを選択
            </button>
            <button
              onClick={handleProceedToDownload}
              className="px-6 py-2 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              ダウンロード画面へ →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
