import { useState, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  isElectronAvailable,
  fetchRankingsForClasses,
  fetchJoaNumbersFromOpenlist,
  extractBaseClass,
  hasRankingsAvailable,
  AVAILABLE_RANKING_GENDERS,
  normalizeName,
  lookupEntryJoaNumber,
} from '../utils/rankingUtils';
import { Entry } from '../types';

export default function Step3Constraints() {
  const { state, dispatch, goToStep } = useApp();
  const [joaFetchStatus, setJoaFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [joaFetchStats, setJoaFetchStats] = useState<{ matched: number; total: number } | null>(null);

  const updateConstraints = (updates: Partial<typeof state.constraints>) => {
    dispatch({
      type: 'SET_CONSTRAINTS',
      payload: { ...state.constraints, ...updates },
    });
  };

  // Count how many classes have ranking events enabled
  const rankingEnabledCount = Object.values(state.constraints.useRankingForSplit).filter(Boolean).length;
  const splitClassCount = state.classes.filter((c) => c.shouldSplit).length;

  // Get classes that need rankings and their base classes
  const classesNeedingRankings = useMemo(() => {
    const classes = state.classes.filter(
      (c) => c.shouldSplit && state.constraints.useRankingForSplit[c.name]
    );
    return classes;
  }, [state.classes, state.constraints.useRankingForSplit]);

  const baseClassesForFetch = useMemo(() => {
    const baseClasses = new Set<string>();
    for (const cls of classesNeedingRankings) {
      const baseClass = extractBaseClass(cls.name);
      if (hasRankingsAvailable(baseClass)) {
        baseClasses.add(baseClass);
      }
    }
    return [...baseClasses];
  }, [classesNeedingRankings]);

  // Count matched rankings
  const rankingStats = useMemo(() => {
    let totalMatched = 0;
    let totalEntries = 0;

    for (const cls of classesNeedingRankings) {
      const baseClass = extractBaseClass(cls.name);
      const rankings = state.rankings.get(baseClass);
      if (!rankings) continue;

      const classEntries = state.entries.filter((e) => e.className === cls.name);
      totalEntries += classEntries.length;

      for (const entry of classEntries) {
        const name1Norm = normalizeName(entry.name1);
        const name2Norm = normalizeName(entry.name2);
        if ((name1Norm && rankings.has(name1Norm)) || (name2Norm && rankings.has(name2Norm))) {
          totalMatched++;
        }
      }
    }

    return { totalMatched, totalEntries };
  }, [classesNeedingRankings, state.rankings, state.entries]);

  // Fetch rankings from JOA
  const handleFetchRankings = useCallback(async () => {
    if (!isElectronAvailable()) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'ランキング取得にはElectronアプリが必要です',
      });
      return;
    }

    if (baseClassesForFetch.length === 0) {
      dispatch({
        type: 'SET_ERROR',
        payload: '取得するランキングクラスがありません',
      });
      return;
    }

    dispatch({ type: 'SET_RANKING_FETCH_STATUS', payload: 'loading' });

    try {
      // Pass race type to fetch the correct rankings (forest or sprint)
      const rankings = await fetchRankingsForClasses(
        baseClassesForFetch,
        1000,
        state.constraints.raceType
      );
      dispatch({ type: 'SET_RANKINGS', payload: rankings });
      dispatch({ type: 'SET_RANKING_FETCH_STATUS', payload: 'success' });
    } catch (err) {
      console.error('Error fetching rankings:', err);
      dispatch({ type: 'SET_RANKING_FETCH_STATUS', payload: 'error' });
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'ランキング取得に失敗しました',
      });
    }
  }, [baseClassesForFetch, state.constraints.raceType, dispatch]);

  // JOA Number fetch section
  const entriesMissingJoaNumber = useMemo(() => {
    return state.entries.filter((e) => !e.joaNumber || e.joaNumber.trim() === '');
  }, [state.entries]);

  // Fetch JOA numbers for entries missing them
  const handleFetchJoaNumbers = useCallback(async () => {
    if (!isElectronAvailable()) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'JOA番号取得にはElectronアプリが必要です',
      });
      return;
    }

    if (entriesMissingJoaNumber.length === 0) {
      return;
    }

    setJoaFetchStatus('loading');

    try {
      // Fetch all JOA numbers from openlist
      const joaNumbers = await fetchJoaNumbersFromOpenlist();

      // Update entries with fetched JOA numbers
      let matchedCount = 0;
      const updatedEntries: Entry[] = state.entries.map((entry) => {
        // Skip if already has JOA number
        if (entry.joaNumber && entry.joaNumber.trim() !== '') {
          return entry;
        }

        const joaNumber = lookupEntryJoaNumber(entry, joaNumbers);
        if (joaNumber) {
          matchedCount++;
          return { ...entry, joaNumber };
        }

        return entry;
      });

      dispatch({ type: 'SET_ENTRIES', payload: updatedEntries });
      setJoaFetchStats({ matched: matchedCount, total: entriesMissingJoaNumber.length });
      setJoaFetchStatus('success');
    } catch (err) {
      console.error('Error fetching JOA numbers:', err);
      setJoaFetchStatus('error');
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'JOA番号取得に失敗しました',
      });
    }
  }, [state.entries, entriesMissingJoaNumber.length, dispatch]);

  const isElectron = isElectronAvailable();

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
                .map((cls) => {
                  const baseClass = extractBaseClass(cls.name);
                  const hasRanking = hasRankingsAvailable(baseClass);
                  return (
                    <label
                      key={cls.name}
                      className={`flex items-center gap-2 p-2 rounded ${
                        hasRanking ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-100 opacity-60'
                      }`}
                      title={hasRanking ? '' : `${baseClass}のランキングは利用不可`}
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
                        disabled={!hasRanking}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{cls.name}</span>
                      <span className="text-xs text-gray-400">({cls.count}名)</span>
                    </label>
                  );
                })}
            </div>

            {splitClassCount > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                {rankingEnabledCount} / {splitClassCount} クラスでランキング順分割を使用
              </p>
            )}

            {/* Ranking Fetch Section */}
            {rankingEnabledCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                {/* Race Type Selection */}
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">大会種別</h4>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="raceType"
                        value="forest"
                        checked={state.constraints.raceType === 'forest'}
                        onChange={() => updateConstraints({ raceType: 'forest' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">フォレスト（ロング/ミドル）</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="raceType"
                        value="sprint"
                        checked={state.constraints.raceType === 'sprint'}
                        onChange={() => updateConstraints({ raceType: 'sprint' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">スプリント</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    大会種別によって使用するランキングが異なります
                  </p>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-sm">JOAランキング取得</h4>
                    <p className="text-xs text-gray-500">
                      対象: {baseClassesForFetch.join(', ') || 'なし'}{' '}
                      ({state.constraints.raceType === 'forest' ? 'フォレスト' : 'スプリント'}ランキング)
                    </p>
                  </div>
                  <button
                    onClick={handleFetchRankings}
                    disabled={
                      !isElectron ||
                      state.rankingFetchStatus === 'loading' ||
                      baseClassesForFetch.length === 0
                    }
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      !isElectron || baseClassesForFetch.length === 0
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : state.rankingFetchStatus === 'loading'
                        ? 'bg-blue-300 text-white cursor-wait'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {state.rankingFetchStatus === 'loading'
                      ? '取得中...'
                      : 'ランキングを取得'}
                  </button>
                </div>

                {/* Ranking Status */}
                {!isElectron && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-700">
                    ランキング取得にはElectronアプリ版が必要です。
                    ブラウザからはCORS制限により直接取得できません。
                  </div>
                )}

                {state.rankingFetchStatus === 'success' && state.rankings.size > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">
                    <span className="font-medium">ランキング取得完了:</span>{' '}
                    {rankingStats.totalMatched} / {rankingStats.totalEntries} 名がマッチ
                    {rankingStats.totalMatched < rankingStats.totalEntries && (
                      <span className="text-yellow-600 ml-2">
                        ({rankingStats.totalEntries - rankingStats.totalMatched}名は未登録)
                      </span>
                    )}
                  </div>
                )}

                {state.rankingFetchStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
                    ランキング取得に失敗しました
                  </div>
                )}

                {/* Available Genders Info */}
                <p className="mt-2 text-xs text-gray-400">
                  対応: {AVAILABLE_RANKING_GENDERS.join(', ')}クラス（M/Wで始まるクラス）
                </p>
              </div>
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

        {/* JOA Number Fetch Section */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">JOA競技者番号取得</h3>
          <p className="text-sm text-gray-600 mb-4">
            エントリーリストにJOA競技者番号が含まれていない場合、JOA登録者リストから取得できます。
          </p>

          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm">
                <span className="text-gray-600">JOA番号未設定: </span>
                <span className={entriesMissingJoaNumber.length > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                  {entriesMissingJoaNumber.length} / {state.entries.length} 名
                </span>
              </div>
              {entriesMissingJoaNumber.length > 0 && (
                <p className="text-xs text-gray-500">
                  取得元: japan-o-entry.com/joaregist/openlist
                </p>
              )}
            </div>
            <button
              onClick={handleFetchJoaNumbers}
              disabled={
                !isElectron ||
                joaFetchStatus === 'loading' ||
                entriesMissingJoaNumber.length === 0
              }
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                !isElectron || entriesMissingJoaNumber.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : joaFetchStatus === 'loading'
                  ? 'bg-blue-300 text-white cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {joaFetchStatus === 'loading' ? '取得中...' : 'JOA番号を取得'}
            </button>
          </div>

          {/* Status Messages */}
          {!isElectron && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-700">
              JOA番号取得にはElectronアプリ版が必要です。
            </div>
          )}

          {joaFetchStatus === 'success' && joaFetchStats && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">
              <span className="font-medium">取得完了:</span>{' '}
              {joaFetchStats.matched} / {joaFetchStats.total} 名のJOA番号を取得
              {joaFetchStats.matched < joaFetchStats.total && (
                <span className="text-yellow-600 ml-2">
                  ({joaFetchStats.total - joaFetchStats.matched}名は未登録)
                </span>
              )}
            </div>
          )}

          {joaFetchStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
              JOA番号取得に失敗しました
            </div>
          )}

          {entriesMissingJoaNumber.length === 0 && state.entries.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">
              すべてのエントリーにJOA番号が設定されています
            </div>
          )}
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
              <>
                <li>
                  • ランキング順分割: {rankingEnabledCount}/{splitClassCount} クラス
                </li>
                {state.rankings.size > 0 && (
                  <li>
                    • ランキングデータ:{' '}
                    <span className="text-green-600">
                      {rankingStats.totalMatched}/{rankingStats.totalEntries}名マッチ
                    </span>
                  </li>
                )}
              </>
            )}
            <li>
              • 所属分散レーン:{' '}
              {state.startAreas.reduce(
                (sum, a) => sum + a.lanes.filter((l) => l.affiliationSplit).length,
                0
              )}
              /{state.startAreas.reduce((sum, a) => sum + a.lanes.length, 0)} レーン
            </li>
            <li>
              • JOA番号:{' '}
              {entriesMissingJoaNumber.length === 0 ? (
                <span className="text-green-600">全員設定済</span>
              ) : (
                <span className="text-orange-600">
                  {state.entries.length - entriesMissingJoaNumber.length}/{state.entries.length}名設定
                </span>
              )}
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
