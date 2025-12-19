import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { generateStartList, checkConflicts } from '../utils/startlistGenerator';
import { generateOutputFiles } from '../utils/outputFormatter';
import { Conflict, StartListEntry } from '../types';

export default function Step4Generate() {
  const { state, dispatch, goToStep } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [previewData, setPreviewData] = useState<StartListEntry[]>([]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setProgress(0);
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Simulate progress for better UX
      setProgress(10);
      await new Promise((r) => setTimeout(r, 100));

      // Generate start list
      setProgress(30);
      const startList = generateStartList(
        state.courses,
        state.startAreas,
        state.entries,
        state.constraints,
        state.globalSettings.seed
      );
      setProgress(60);
      await new Promise((r) => setTimeout(r, 100));

      // Check for conflicts
      setProgress(70);
      const detectedConflicts = checkConflicts(startList, state.constraints);
      setConflicts(detectedConflicts);
      setProgress(80);

      // Generate output files
      const outputFiles = generateOutputFiles(startList, state.globalSettings);
      setProgress(90);

      // Store results
      dispatch({ type: 'SET_START_LIST', payload: startList });
      dispatch({ type: 'SET_OUTPUT_FILES', payload: outputFiles });
      setPreviewData(startList);
      setProgress(100);
    } catch (error) {
      console.error('Generation error:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : '生成中にエラーが発生しました',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [state.courses, state.startAreas, state.entries, state.constraints, state.globalSettings, dispatch]);

  const canProceed = state.startList.length > 0;

  // Group preview by lane
  const previewByLane = previewData.reduce((acc, entry) => {
    const key = `${entry.startArea} - ${entry.lane}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, StartListEntry[]>);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Step 4: スタートリスト生成</h2>

      <div className="mb-4 text-sm text-gray-600">
        設定に基づいてスタートリストを生成します。生成後にプレビューで確認できます。
      </div>

      {/* Generation Summary */}
      <div className="mb-6 bg-gray-50 border rounded-lg p-4">
        <h3 className="font-medium mb-2">生成設定サマリー</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">エントリー数:</span>{' '}
            <span className="font-medium">{state.entries.length}名</span>
          </div>
          <div>
            <span className="text-gray-500">コース数:</span>{' '}
            <span className="font-medium">{state.courses.length}</span>
          </div>
          <div>
            <span className="text-gray-500">レーン数:</span>{' '}
            <span className="font-medium">
              {state.startAreas.reduce((sum, a) => sum + a.lanes.length, 0)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">乱数シード:</span>{' '}
            <span className="font-medium">{state.globalSettings.seed}</span>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="mb-6">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-3 rounded-lg font-medium text-lg transition-colors ${
            isGenerating
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isGenerating ? '生成中...' : 'スタートリストを生成'}
        </button>

        {/* Progress Bar */}
        {isGenerating && (
          <div className="mt-2">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1 text-center">{progress}%</p>
          </div>
        )}
      </div>

      {/* Conflicts Warning */}
      {conflicts.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-yellow-500 mr-2">⚠️</span>
            <div>
              <h4 className="font-medium text-yellow-800">
                {conflicts.length}件の競合が検出されました
              </h4>
              <div className="mt-2 max-h-32 overflow-y-auto">
                {conflicts.slice(0, 10).map((conflict, i) => (
                  <p key={i} className="text-sm text-yellow-700">
                    • {conflict.message}
                  </p>
                ))}
                {conflicts.length > 10 && (
                  <p className="text-sm text-yellow-600">
                    他 {conflicts.length - 10} 件...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {canProceed && conflicts.length === 0 && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            <span className="text-green-700">
              {state.startList.length}件のスタートリストを生成しました
            </span>
          </div>
        </div>
      )}

      {/* Preview */}
      {previewData.length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium mb-3">プレビュー</h3>

          {/* Preview Tabs by Lane */}
          <div className="border rounded-lg overflow-hidden">
            {Object.entries(previewByLane).map(([laneKey, entries]) => (
              <details key={laneKey} className="border-b last:border-b-0">
                <summary className="px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100">
                  <span className="font-medium">{laneKey}</span>
                  <span className="text-gray-500 ml-2">({entries.length}名)</span>
                </summary>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">No.</th>
                        <th className="px-3 py-2 text-left">時刻</th>
                        <th className="px-3 py-2 text-left">クラス</th>
                        <th className="px-3 py-2 text-left">氏名</th>
                        <th className="px-3 py-2 text-left">所属</th>
                        <th className="px-3 py-2 text-left">カード</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {entries.slice(0, 50).map((entry, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1">{entry.startNumber}</td>
                          <td className="px-3 py-1">{entry.startTime}</td>
                          <td className="px-3 py-1">{entry.className}</td>
                          <td className="px-3 py-1">{entry.name1}</td>
                          <td className="px-3 py-1">{entry.affiliation || '-'}</td>
                          <td className="px-3 py-1">
                            {entry.isRental ? (
                              <span className="text-orange-500">レンタル</span>
                            ) : (
                              entry.cardNumber || '-'
                            )}
                          </td>
                        </tr>
                      ))}
                      {entries.length > 50 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-2 text-center text-gray-500">
                            他 {entries.length - 50} 件...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Statistics */}
      {canProceed && (
        <div className="mb-6">
          <h3 className="font-medium mb-3">クラス別統計</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {Object.entries(
              state.startList.reduce((acc, e) => {
                acc[e.className] = (acc[e.className] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(0, 12)
              .map(([cls, count]) => (
                <div key={cls} className="bg-gray-50 rounded p-2 text-sm text-center">
                  <div className="font-medium">{cls}</div>
                  <div className="text-gray-500">{count}名</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => goToStep('step3')}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 戻る
        </button>
        <button
          onClick={() => goToStep('done')}
          disabled={!canProceed}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          ダウンロードへ →
        </button>
      </div>
    </div>
  );
}
