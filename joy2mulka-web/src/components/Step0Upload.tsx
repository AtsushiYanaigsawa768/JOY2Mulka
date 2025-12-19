import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  parseCSVFile,
  parseXLSXFile,
  detectColumnMapping,
  parseEntries,
  detectClasses,
} from '../utils/csvParser';
import { ClassInfo } from '../types';

export default function Step0Upload() {
  const { state, dispatch, goToStep } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<string[][] | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      let result;
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        result = await parseXLSXFile(file);
      } else {
        result = await parseCSVFile(file);
      }

      dispatch({
        type: 'SET_RAW_DATA',
        payload: {
          data: result.data,
          header: result.header,
          columnNames: result.columnNames,
        },
      });

      // Auto-detect column mapping
      const mapping = detectColumnMapping(result.header, result.columnNames);
      dispatch({ type: 'SET_COLUMN_MAPPING', payload: mapping });

      // Parse entries
      const entries = parseEntries(result.data, mapping);
      dispatch({ type: 'SET_ENTRIES', payload: entries });

      // Detect classes
      const classInfos = detectClasses(entries);
      const classes: ClassInfo[] = classInfos.map((c) => ({
        ...c,
        shouldSplit: false,
        splitCount: 2,
      }));
      dispatch({ type: 'SET_CLASSES', payload: classes });

      // Set preview
      setPreview(result.data.slice(0, 50));
    } catch (error) {
      console.error('Error parsing file:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました',
      });
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const canProceed = state.entries.length > 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Step 0: エントリーリストのアップロード</h2>

      {/* File Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
        `}
      >
        <input
          type="file"
          id="file-input"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileInput}
          className="hidden"
          disabled={isLoading}
        />
        <label htmlFor="file-input" className="cursor-pointer">
          <div className="flex flex-col items-center">
            <span className="text-4xl mb-4">📁</span>
            {isLoading ? (
              <p className="text-gray-600">読み込み中...</p>
            ) : (
              <>
                <p className="text-gray-600 mb-2">
                  ファイルをドラッグ＆ドロップするか、クリックして選択
                </p>
                <p className="text-sm text-gray-400">対応形式: CSV, XLSX</p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Parsing Results */}
      {state.entries.length > 0 && (
        <div className="mt-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-green-700">
                {state.entries.length} 件のエントリーを読み込みました
                （{state.classes.length} クラス）
              </span>
            </div>
          </div>

          {/* Column Mapping Summary */}
          <div className="mb-4">
            <h3 className="font-medium mb-2">検出されたカラム:</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="bg-gray-50 p-2 rounded">
                <span className="text-gray-500">クラス:</span>{' '}
                {state.columnMapping?.class != null ? `列 ${state.columnMapping.class + 1}` : '未検出'}
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <span className="text-gray-500">所属:</span>{' '}
                {state.columnMapping?.affiliation != null ? `列 ${state.columnMapping.affiliation + 1}` : '未検出'}
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <span className="text-gray-500">参加者数:</span>{' '}
                {Object.keys(state.columnMapping?.participants || {}).length}
              </div>
            </div>
          </div>

          {/* Preview Table */}
          {preview && preview.length > 0 && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">プレビュー (最初の50行):</h3>
              <div className="overflow-x-auto border rounded-lg max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">#</th>
                      {state.columnNamesRow.slice(0, 10).map((col, i) => (
                        <th key={i} className="px-2 py-1 text-left text-xs font-medium text-gray-500 truncate max-w-32">
                          {col || `列${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        {row.slice(0, 10).map((cell, j) => (
                          <td key={j} className="px-2 py-1 truncate max-w-32" title={cell}>
                            {cell || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Class Summary */}
          <div className="mb-4">
            <h3 className="font-medium mb-2">クラス別人数:</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {state.classes.slice(0, 12).map((cls) => (
                <div key={cls.name} className="bg-gray-50 p-2 rounded text-sm">
                  <span className="font-medium">{cls.name}</span>
                  <span className="text-gray-500 ml-2">{cls.count}名</span>
                </div>
              ))}
              {state.classes.length > 12 && (
                <div className="bg-gray-50 p-2 rounded text-sm text-gray-500">
                  他 {state.classes.length - 12} クラス...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Settings */}
      <div className="mt-6 border-t pt-4">
        <h3 className="font-medium mb-3">大会設定:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              大会名
            </label>
            <input
              type="text"
              value={state.globalSettings.competitionName}
              onChange={(e) =>
                dispatch({
                  type: 'SET_GLOBAL_SETTINGS',
                  payload: { competitionName: e.target.value },
                })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="例: 第30回大会"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              出力フォルダ名
            </label>
            <input
              type="text"
              value={state.globalSettings.outputFolder}
              onChange={(e) =>
                dispatch({
                  type: 'SET_GLOBAL_SETTINGS',
                  payload: { outputFolder: e.target.value },
                })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="例: Competition2024"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              言語
            </label>
            <select
              value={state.globalSettings.language}
              onChange={(e) =>
                dispatch({
                  type: 'SET_GLOBAL_SETTINGS',
                  payload: { language: e.target.value as 'ja' | 'en' },
                })
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => goToStep('step1')}
          disabled={!canProceed}
          className={`
            px-6 py-2 rounded-md font-medium transition-colors
            ${canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          次へ →
        </button>
      </div>
    </div>
  );
}
