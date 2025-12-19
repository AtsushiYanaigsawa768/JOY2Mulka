import { useApp } from '../context/AppContext';

export default function Step3Constraints() {
  const { state, dispatch, goToStep } = useApp();

  const updateConstraints = (updates: Partial<typeof state.constraints>) => {
    dispatch({
      type: 'SET_CONSTRAINTS',
      payload: { ...state.constraints, ...updates },
    });
  };

  // Count how many classes have ranking events enabled
  const rankingEnabledCount = Object.values(state.constraints.useRankingForSplit).filter(Boolean).length;
  const splitClassCount = state.classes.filter((c) => c.shouldSplit).length;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Step 3: 制約設定</h2>

      <div className="mb-4 text-sm text-gray-600">
        スタートリスト生成時の制約条件を設定します。
      </div>

      <div className="space-y-6">
        {/* Global Constraints */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">全体設定</h3>
          <div className="space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={state.constraints.avoidSameClubConsecutive}
                onChange={(e) =>
                  updateConstraints({ avoidSameClubConsecutive: e.target.checked })
                }
                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-medium">同一クラブ連続回避</span>
                <p className="text-sm text-gray-500">
                  同じクラブ・所属のエントリーが連続しないようにシャッフルします。
                  完全に回避できない場合は最善を尽くします。
                </p>
              </div>
            </label>

            <div className="ml-6 pl-4 border-l-2 border-gray-200">
              <label className="block mb-2">
                <span className="text-sm text-gray-600">シャッフル最大試行回数:</span>
                <input
                  type="number"
                  value={state.constraints.maxShuffleAttempts}
                  onChange={(e) =>
                    updateConstraints({ maxShuffleAttempts: parseInt(e.target.value) || 100 })
                  }
                  min={10}
                  max={10000}
                  className="ml-2 w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </label>
              <p className="text-xs text-gray-400">
                大きい値ほど良い結果が得られますが、処理時間が増加します。
              </p>
            </div>
          </div>
        </div>

        {/* Ranking-based Split */}
        {splitClassCount > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">ランキング順分割</h3>
            <p className="text-sm text-gray-600 mb-4">
              分割するクラスでランキング順による振り分けを行うかどうかを設定します。
              ランキングを使用しない場合は、エントリー順で均等に振り分けます。
            </p>

            <div className="mb-3 flex gap-2">
              <button
                onClick={() => {
                  const allEnabled: Record<string, boolean> = {};
                  state.classes
                    .filter((c) => c.shouldSplit)
                    .forEach((c) => {
                      allEnabled[c.name] = true;
                    });
                  updateConstraints({ useRankingForSplit: allEnabled });
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                すべて有効
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => updateConstraints({ useRankingForSplit: {} })}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                すべて無効
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {state.classes
                .filter((c) => c.shouldSplit)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cls) => (
                  <label
                    key={cls.name}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={state.constraints.useRankingForSplit[cls.name] || false}
                      onChange={(e) =>
                        updateConstraints({
                          useRankingForSplit: {
                            ...state.constraints.useRankingForSplit,
                            [cls.name]: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">{cls.name}</span>
                    <span className="text-xs text-gray-400">({cls.count}名)</span>
                  </label>
                ))}
            </div>

            {splitClassCount > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                {rankingEnabledCount} / {splitClassCount} クラスでランキング順分割を使用
              </p>
            )}
          </div>
        )}

        {/* Affiliation Split Per Lane */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">レーン別所属分散設定</h3>
          <p className="text-sm text-gray-600 mb-4">
            各レーンでの所属分散（同一クラブ連続回避）を個別に設定できます。
            Step 2で設定した値が初期値として表示されています。
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {state.startAreas.map((area) => (
              <div key={area.id} className="border-l-2 border-blue-200 pl-3">
                <h4 className="font-medium text-sm mb-1">{area.name}</h4>
                <div className="space-y-1">
                  {area.lanes.map((lane) => {
                    const courseNames = lane.courseIds
                      .map((id) => state.courses.find((c) => c.id === id)?.name)
                      .filter(Boolean)
                      .join(', ');

                    return (
                      <label
                        key={lane.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={lane.affiliationSplit}
                          onChange={(e) => {
                            const updatedAreas = state.startAreas.map((a) =>
                              a.id === area.id
                                ? {
                                    ...a,
                                    lanes: a.lanes.map((l) =>
                                      l.id === lane.id
                                        ? { ...l, affiliationSplit: e.target.checked }
                                        : l
                                    ),
                                  }
                                : a
                            );
                            dispatch({ type: 'SET_START_AREAS', payload: updatedAreas });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium">{lane.name}</span>
                        {courseNames && (
                          <span className="text-gray-400 text-xs">({courseNames})</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">設定サマリー</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>
              • 同一クラブ連続回避:{' '}
              {state.constraints.avoidSameClubConsecutive ? (
                <span className="text-green-600">有効</span>
              ) : (
                <span className="text-gray-500">無効</span>
              )}
            </li>
            {splitClassCount > 0 && (
              <li>
                • ランキング順分割: {rankingEnabledCount}/{splitClassCount} クラス
              </li>
            )}
            <li>
              • 所属分散レーン:{' '}
              {state.startAreas.reduce(
                (sum, a) => sum + a.lanes.filter((l) => l.affiliationSplit).length,
                0
              )}
              /{state.startAreas.reduce((sum, a) => sum + a.lanes.length, 0)} レーン
            </li>
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => goToStep('step2')}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 戻る
        </button>
        <button
          onClick={() => goToStep('step4')}
          className="px-6 py-2 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          次へ →
        </button>
      </div>
    </div>
  );
}
