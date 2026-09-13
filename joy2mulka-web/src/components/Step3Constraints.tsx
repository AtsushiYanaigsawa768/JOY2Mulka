import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { TEX_TEMPLATES } from '../utils/outputFormatter';
import { Entry, TexTemplate, PersonPositionConstraint, ProximityGroupConstraint } from '../types';

export default function Step3Constraints() {
  const { state, dispatch, goToStep } = useApp();
  const [joaFetchStatus, setJoaFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [joaFetchStats, setJoaFetchStats] = useState<{ matched: number; total: number } | null>(null);

  // Person position constraint search state
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [showPersonSearchResults, setShowPersonSearchResults] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<'early' | 'late'>('early');
  const [selectedTargetType, setSelectedTargetType] = useState<'person' | 'affiliation'>('person');
  const personSearchRef = useRef<HTMLDivElement>(null);

  // 近め（proximity）グループの編集状態
  const [proximityMemberQuery, setProximityMemberQuery] = useState('');
  const [proximityDraftMembers, setProximityDraftMembers] = useState<string[]>([]);
  const [proximityGapMinutes, setProximityGapMinutes] = useState(3);

  const proximityGroups = state.globalSettings.proximityGroups || [];

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (personSearchRef.current && !personSearchRef.current.contains(event.target as Node)) {
        setShowPersonSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter entries based on search query
  const personSearchResults = useMemo(() => {
    if (!personSearchQuery.trim()) return [];
    const query = personSearchQuery.toLowerCase();
    return state.entries.filter((entry) => {
      const name1Match = entry.name1?.toLowerCase().includes(query);
      const name2Match = entry.name2?.toLowerCase().includes(query);
      const affiliationMatch = entry.affiliation?.toLowerCase().includes(query);
      return name1Match || name2Match || affiliationMatch;
    }).slice(0, 10); // Limit to 10 results
  }, [personSearchQuery, state.entries]);

  // 所属の一覧（所属ごとに早め・遅めを指定するため）
  const allAffiliations = useMemo(() => {
    const names = new Set<string>();
    for (const entry of state.entries) {
      const list = entry.affiliations && entry.affiliations.length > 0
        ? entry.affiliations
        : (entry.affiliation && entry.affiliation !== '-' ? [entry.affiliation] : []);
      for (const aff of list) {
        const name = aff.trim();
        if (name) names.add(name);
      }
    }
    return Array.from(names).sort();
  }, [state.entries]);

  // 所属の検索結果
  const affiliationSearchResults = useMemo(() => {
    if (!personSearchQuery.trim()) return [];
    const query = personSearchQuery.toLowerCase();
    return allAffiliations.filter((a) => a.toLowerCase().includes(query)).slice(0, 10);
  }, [personSearchQuery, allAffiliations]);

  // 所属に属する人数
  const countInAffiliation = useCallback((affiliation: string) => {
    const key = affiliation.replace(/\d+$/, '').trim().toLowerCase();
    return state.entries.filter((e) => {
      const list = e.affiliations && e.affiliations.length > 0
        ? e.affiliations
        : (e.affiliation ? [e.affiliation] : []);
      return list.some((a) => a.replace(/\d+$/, '').trim().toLowerCase() === key);
    }).length;
  }, [state.entries]);

  // Add person position constraint
  const addPersonConstraint = useCallback((entry: Entry) => {
    const newConstraint: PersonPositionConstraint = {
      id: `ppc-${Date.now()}`,
      targetType: 'person',
      personName: entry.name1,
      position: selectedPosition,
    };
    dispatch({
      type: 'SET_GLOBAL_SETTINGS',
      payload: {
        personPositionConstraints: [
          ...state.globalSettings.personPositionConstraints,
          newConstraint,
        ],
      },
    });
    setPersonSearchQuery('');
    setShowPersonSearchResults(false);
  }, [selectedPosition, state.globalSettings.personPositionConstraints, dispatch]);

  // 所属まるごとに早め／遅めを設定する
  const addAffiliationConstraint = useCallback((affiliation: string) => {
    const newConstraint: PersonPositionConstraint = {
      id: `ppc-${Date.now()}`,
      targetType: 'affiliation',
      personName: affiliation,
      position: selectedPosition,
    };
    dispatch({
      type: 'SET_GLOBAL_SETTINGS',
      payload: {
        personPositionConstraints: [
          ...state.globalSettings.personPositionConstraints,
          newConstraint,
        ],
      },
    });
    setPersonSearchQuery('');
    setShowPersonSearchResults(false);
  }, [selectedPosition, state.globalSettings.personPositionConstraints, dispatch]);

  // 近めグループを追加
  const addProximityGroup = useCallback(() => {
    if (proximityDraftMembers.length < 2) return;
    const newGroup: ProximityGroupConstraint = {
      id: `pg-${Date.now()}`,
      label: proximityDraftMembers.join('・'),
      members: proximityDraftMembers,
      minGapMinutes: proximityGapMinutes,
    };
    dispatch({
      type: 'SET_GLOBAL_SETTINGS',
      payload: { proximityGroups: [...proximityGroups, newGroup] },
    });
    setProximityDraftMembers([]);
    setProximityMemberQuery('');
  }, [proximityDraftMembers, proximityGapMinutes, proximityGroups, dispatch]);

  const removeProximityGroup = useCallback((groupId: string) => {
    dispatch({
      type: 'SET_GLOBAL_SETTINGS',
      payload: { proximityGroups: proximityGroups.filter((g) => g.id !== groupId) },
    });
  }, [proximityGroups, dispatch]);

  // 近めグループの候補（入力中の検索）
  const proximityCandidates = useMemo(() => {
    if (!proximityMemberQuery.trim()) return [];
    const query = proximityMemberQuery.toLowerCase();
    return state.entries.filter((entry) => {
      if (proximityDraftMembers.includes(entry.name1)) return false;
      return (
        entry.name1?.toLowerCase().includes(query) ||
        entry.name2?.toLowerCase().includes(query) ||
        entry.affiliation?.toLowerCase().includes(query)
      );
    }).slice(0, 8);
  }, [proximityMemberQuery, proximityDraftMembers, state.entries]);

  // Remove person position constraint
  const removePersonConstraint = useCallback((constraintId: string) => {
    dispatch({
      type: 'SET_GLOBAL_SETTINGS',
      payload: {
        personPositionConstraints: state.globalSettings.personPositionConstraints.filter(
          (c) => c.id !== constraintId
        ),
      },
    });
  }, [state.globalSettings.personPositionConstraints, dispatch]);

  // 練習会モードでは並び替え・レーンに関する制約は意味を持たないので隠す
  const practiceMode = state.globalSettings.practiceMode;

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
        {!practiceMode && (
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
        )}

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
        {!practiceMode && (
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
        )}

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

        {/* Person Position Constraints */}
        {!practiceMode && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">人物位置制約（早め・遅め）</h3>
          <p className="text-sm text-gray-600 mb-4">
            スタート順序を「前半」または「後半」に寄せます。
            前半は先頭20%、後半は最後20%の位置です。
            <strong>個人</strong>だけでなく<strong>所属ごと</strong>にも指定できます
            （所属を指定すると、その所属の全員が対象になり、互いに連続しないように配置されます）。
          </p>

          {/* Add new constraint */}
          <div className="mb-4">
            <div className="flex gap-2 items-start">
              {/* Target type selector */}
              <div className="flex-shrink-0">
                <select
                  value={selectedTargetType}
                  onChange={(e) => {
                    setSelectedTargetType(e.target.value as 'person' | 'affiliation');
                    setPersonSearchQuery('');
                  }}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="person">個人</option>
                  <option value="affiliation">所属ごと</option>
                </select>
              </div>

              {/* Position selector */}
              <div className="flex-shrink-0">
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value as 'early' | 'late')}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="early">前半（Early）</option>
                  <option value="late">後半（Late）</option>
                </select>
              </div>

              {/* Search input with dropdown */}
              <div className="flex-1 relative" ref={personSearchRef}>
                <input
                  type="text"
                  value={personSearchQuery}
                  onChange={(e) => {
                    setPersonSearchQuery(e.target.value);
                    setShowPersonSearchResults(true);
                  }}
                  onFocus={() => setShowPersonSearchResults(true)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    if (selectedTargetType === 'affiliation') {
                      if (affiliationSearchResults.length === 0) return;
                      e.preventDefault();
                      const first = affiliationSearchResults.find(
                        (aff) => !state.globalSettings.personPositionConstraints.some(
                          (c) => c.targetType === 'affiliation' && c.personName === aff
                        )
                      );
                      if (first) addAffiliationConstraint(first);
                      return;
                    }
                    if (personSearchResults.length > 0) {
                      e.preventDefault();
                      // Find first non-added entry
                      const firstAvailable = personSearchResults.find(
                        (entry) => !state.globalSettings.personPositionConstraints.some(
                          (c) => c.personName === entry.name1
                        )
                      );
                      if (firstAvailable) {
                        addPersonConstraint(firstAvailable);
                      }
                    }
                  }}
                  placeholder={selectedTargetType === 'affiliation' ? '所属名で検索...' : '名前または所属で検索...'}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* 所属の検索結果 */}
                {selectedTargetType === 'affiliation' && showPersonSearchResults && affiliationSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {affiliationSearchResults.map((aff) => {
                      const isAlreadyAdded = state.globalSettings.personPositionConstraints.some(
                        (c) => c.targetType === 'affiliation' && c.personName === aff
                      );
                      return (
                        <button
                          key={aff}
                          onClick={() => !isAlreadyAdded && addAffiliationConstraint(aff)}
                          disabled={isAlreadyAdded}
                          className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0
                            ${isAlreadyAdded
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'hover:bg-blue-50 cursor-pointer'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{aff}</span>
                            <span className="text-xs text-gray-400">{countInAffiliation(aff)}名</span>
                          </div>
                          {isAlreadyAdded && (
                            <span className="text-xs text-orange-500">追加済み</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Search results dropdown */}
                {selectedTargetType === 'person' && showPersonSearchResults && personSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {personSearchResults.map((entry) => {
                      // Check if already added
                      const isAlreadyAdded = state.globalSettings.personPositionConstraints.some(
                        (c) => c.personName === entry.name1
                      );
                      return (
                        <button
                          key={entry.id}
                          onClick={() => !isAlreadyAdded && addPersonConstraint(entry)}
                          disabled={isAlreadyAdded}
                          className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0
                            ${isAlreadyAdded
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'hover:bg-blue-50 cursor-pointer'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{entry.name1}</span>
                              {entry.name2 && (
                                <span className="text-gray-500 ml-2">({entry.name2})</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">
                              {entry.className} / {entry.affiliation || '-'}
                            </div>
                          </div>
                          {isAlreadyAdded && (
                            <span className="text-xs text-orange-500">追加済み</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* No results message */}
                {showPersonSearchResults && personSearchQuery.trim() &&
                  (selectedTargetType === 'affiliation'
                    ? affiliationSearchResults.length === 0
                    : personSearchResults.length === 0) && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
                    {selectedTargetType === 'affiliation' ? '該当する所属が見つかりません' : '該当する人物が見つかりません'}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {selectedTargetType === 'affiliation'
                ? '所属名で検索できます。Enterキーで最初の候補を追加します。'
                : '名前（漢字/かな）または所属で検索できます。Enterキーで最初の候補を追加します。'}
            </p>
          </div>

          {/* Current constraints list */}
          {state.globalSettings.personPositionConstraints.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">設定済みの制約:</h4>
              <div className="space-y-1">
                {state.globalSettings.personPositionConstraints.map((constraint) => {
                  // Find the entry for additional info
                  const entry = state.entries.find((e) => e.name1 === constraint.personName);
                  return (
                    <div
                      key={constraint.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        constraint.position === 'early'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-orange-50 border border-orange-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            constraint.position === 'early'
                              ? 'bg-green-200 text-green-800'
                              : 'bg-orange-200 text-orange-800'
                          }`}
                        >
                          {constraint.position === 'early' ? '前半' : '後半'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                          {constraint.targetType === 'affiliation' ? '所属' : '個人'}
                        </span>
                        <span className="font-medium">{constraint.personName}</span>
                        {constraint.targetType === 'affiliation' ? (
                          <span className="text-xs text-gray-500">
                            （{countInAffiliation(constraint.personName)}名）
                          </span>
                        ) : entry && (
                          <span className="text-xs text-gray-500">
                            ({entry.className} / {entry.affiliation || '-'})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removePersonConstraint(constraint.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="削除"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              人物位置制約は設定されていません
            </div>
          )}
        </div>
        )}

        {/* 近め（proximity）グループ */}
        {!practiceMode && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">近め（まとめて出走させる）</h3>
          <p className="text-sm text-gray-600 mb-4">
            指定した人たちを近い時間帯にまとめます（送迎・撮影・チーム単位の応援などに使います）。
            まとめても<strong>連続はしません</strong>。最低でも指定した分数だけ間隔を空けます。
            早め・遅めの制約と<strong>重複して設定できます</strong>
            （メンバーの誰かに早め／遅めが付いていれば、グループごと前半／後半に寄せます）。
          </p>

          {/* メンバーを選ぶ */}
          <div className="mb-3">
            <div className="flex gap-2 items-center mb-2">
              <label className="text-sm text-gray-700">最小間隔</label>
              <input
                type="number"
                min={1}
                max={60}
                value={proximityGapMinutes}
                onChange={(e) => setProximityGapMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-sm text-gray-700">分</span>
              <span className="text-xs text-gray-400">
                （この分数以内に 2 人が並ぶことはありません。スタート間隔より短い値を入れても、連続はしません）
              </span>
            </div>

            <input
              type="text"
              value={proximityMemberQuery}
              onChange={(e) => setProximityMemberQuery(e.target.value)}
              placeholder="メンバーを名前または所属で検索して追加..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {proximityCandidates.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                {proximityCandidates.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setProximityDraftMembers([...proximityDraftMembers, entry.name1]);
                      setProximityMemberQuery('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                  >
                    <span className="font-medium">{entry.name1}</span>
                    {entry.name2 && <span className="text-gray-500 ml-2">({entry.name2})</span>}
                    <span className="text-xs text-gray-400 ml-2">
                      {entry.className} / {entry.affiliation || '-'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 追加予定のメンバー */}
          {proximityDraftMembers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {proximityDraftMembers.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-sm"
                >
                  {name}
                  <button
                    onClick={() =>
                      setProximityDraftMembers(proximityDraftMembers.filter((m) => m !== name))
                    }
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                onClick={addProximityGroup}
                disabled={proximityDraftMembers.length < 2}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  proximityDraftMembers.length >= 2
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                このグループを追加
              </button>
            </div>
          )}

          {/* 設定済みグループ */}
          {proximityGroups.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-700">設定済みの近めグループ:</h4>
              {proximityGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-2 rounded bg-blue-50 border border-blue-200"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">
                      最低 {group.minGapMinutes} 分あける
                    </span>
                    <span className="text-sm font-medium">{group.members.join('・')}</span>
                    <span className="text-xs text-gray-500">（{group.members.length}名）</span>
                  </div>
                  <button
                    onClick={() => removeProximityGroup(group.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">近めグループは設定されていません</div>
          )}
        </div>
        )}

        {/* TeX Template Selection */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">LaTeXテンプレート選択</h3>
          <p className="text-sm text-gray-600 mb-4">
            生成されるスタートリスト（.tex）のデザインを選択してください。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEX_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() =>
                  dispatch({
                    type: 'SET_GLOBAL_SETTINGS',
                    payload: { texTemplate: template.id as TexTemplate },
                  })
                }
                className={`
                  p-4 rounded-lg border-2 text-left transition-all
                  ${
                    state.globalSettings.texTemplate === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                    <p className="text-xs text-gray-400 mt-2">{template.preview}</p>
                  </div>
                  {state.globalSettings.texTemplate === template.id && (
                    <span className="text-blue-500 text-lg">✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">設定サマリー</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            {practiceMode ? (
              <li>
                • 出力モード:{' '}
                <span className="text-green-600">練習会（スタート時刻なし・入力順）</span>
              </li>
            ) : (
              <li>
                • 同一クラブ連続回避:{' '}
                {state.constraints.avoidSameClubConsecutive ? (
                  <span className="text-green-600">有効</span>
                ) : (
                  <span className="text-gray-500">無効</span>
                )}
              </li>
            )}
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
            {practiceMode ? (
              <li>
                • ゼッケン番号:{' '}
                {state.globalSettings.generateStartNumbers ? '生成する' : '生成しない'}
              </li>
            ) : (
              <li>
                • 所属分散レーン:{' '}
                {state.startAreas.reduce(
                  (sum, a) => sum + a.lanes.filter((l) => l.affiliationSplit).length,
                  0
                )}
                /{state.startAreas.reduce((sum, a) => sum + a.lanes.length, 0)} レーン
              </li>
            )}
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
            <li>
              • TeXテンプレート:{' '}
              <span className="text-blue-600">
                {TEX_TEMPLATES.find(t => t.id === state.globalSettings.texTemplate)?.name || '標準'}
              </span>
            </li>
            {!practiceMode && (
            <li>
              • 人物位置制約:{' '}
              {state.globalSettings.personPositionConstraints.length > 0 ? (
                <span className="text-green-600">
                  {state.globalSettings.personPositionConstraints.length}件設定
                  （前半: {state.globalSettings.personPositionConstraints.filter(c => c.position === 'early').length}名,
                  後半: {state.globalSettings.personPositionConstraints.filter(c => c.position === 'late').length}名）
                </span>
              ) : (
                <span className="text-gray-500">なし</span>
              )}
            </li>
            )}
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => goToStep(state.globalSettings.practiceMode ? 'step1' : 'step2')}
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
