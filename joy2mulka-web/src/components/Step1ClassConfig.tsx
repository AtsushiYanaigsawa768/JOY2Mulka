import { useApp } from '../context/AppContext';
import { ClassInfo } from '../types';

export default function Step1ClassConfig() {
  const { state, dispatch, goToStep } = useApp();

  const handleToggleSplit = (className: string) => {
    const updatedClasses = state.classes.map((cls) =>
      cls.name === className ? { ...cls, shouldSplit: !cls.shouldSplit } : cls
    );
    dispatch({ type: 'SET_CLASSES', payload: updatedClasses });
  };

  const handleSplitCountChange = (className: string, count: number) => {
    const updatedClasses = state.classes.map((cls) =>
      cls.name === className ? { ...cls, splitCount: count } : cls
    );
    dispatch({ type: 'SET_CLASSES', payload: updatedClasses });
  };

  // Generate courses from classes (including splits)
  const generateCourses = () => {
    const courses: { id: string; name: string; originalClass: string; splitNumber?: number; entries: typeof state.entries; assigned: boolean }[] = [];

    for (const cls of state.classes) {
      const classEntries = state.entries.filter((e) => e.className === cls.name);

      if (cls.shouldSplit && cls.splitCount > 1) {
        // Split the class
        for (let i = 1; i <= cls.splitCount; i++) {
          courses.push({
            id: `${cls.name}-${i}`,
            name: `${cls.name}${i}`,
            originalClass: cls.name,
            splitNumber: i,
            entries: [], // Will be populated during generation
            assigned: false,
          });
        }
      } else {
        // No split
        courses.push({
          id: cls.name,
          name: cls.name,
          originalClass: cls.name,
          entries: classEntries,
          assigned: false,
        });
      }
    }

    dispatch({ type: 'SET_COURSES', payload: courses });
  };

  const handleNext = () => {
    generateCourses();
    goToStep('step2');
  };

  // Sort classes by name
  const sortedClasses = [...state.classes].sort((a, b) => a.name.localeCompare(b.name));

  // Calculate total participants after splits
  const totalParticipants = state.entries.length;
  const totalCourses = state.classes.reduce((sum, cls) => {
    return sum + (cls.shouldSplit ? cls.splitCount : 1);
  }, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Step 1: クラス設定</h2>

      <div className="mb-4 text-sm text-gray-600">
        検出されたクラスの分割設定を行います。
        分割する場合は、ランキング順で均等に振り分けられます。
      </div>

      {/* Summary */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-blue-700">
            合計: {totalParticipants}名 / {state.classes.length}クラス
          </span>
          <span className="text-blue-600 text-sm">
            → 分割後: {totalCourses}コース
          </span>
        </div>
      </div>

      {/* Class Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">クラス名</th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">人数</th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">分割</th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">分割数</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">結果</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedClasses.map((cls) => (
              <ClassRow
                key={cls.name}
                classInfo={cls}
                onToggleSplit={() => handleToggleSplit(cls.name)}
                onSplitCountChange={(count) => handleSplitCountChange(cls.name, count)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            const updated = state.classes.map((cls) => ({
              ...cls,
              shouldSplit: cls.count >= 120,
              splitCount: cls.count >= 240 ? 3 : 2,
            }));
            dispatch({ type: 'SET_CLASSES', payload: updated });
          }}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          自動設定（120名以上を分割）
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => {
            const updated = state.classes.map((cls) => ({
              ...cls,
              shouldSplit: false,
              splitCount: 2,
            }));
            dispatch({ type: 'SET_CLASSES', payload: updated });
          }}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          すべてリセット
        </button>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => goToStep('step0')}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 戻る
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          次へ →
        </button>
      </div>
    </div>
  );
}

interface ClassRowProps {
  classInfo: ClassInfo;
  onToggleSplit: () => void;
  onSplitCountChange: (count: number) => void;
}

function ClassRow({ classInfo, onToggleSplit, onSplitCountChange }: ClassRowProps) {
  const { name, count, shouldSplit, splitCount } = classInfo;

  // Generate preview of split names
  const splitPreview = shouldSplit
    ? Array.from({ length: splitCount }, (_, i) => `${name}${i + 1}`).join(', ')
    : name;

  // Calculate per-split counts
  const perSplitCount = shouldSplit
    ? Math.ceil(count / splitCount)
    : count;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 font-medium">{name}</td>
      <td className="px-4 py-2 text-center">{count}名</td>
      <td className="px-4 py-2 text-center">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={shouldSplit}
            onChange={onToggleSplit}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      </td>
      <td className="px-4 py-2 text-center">
        {shouldSplit ? (
          <select
            value={splitCount}
            onChange={(e) => onSplitCountChange(parseInt(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={shouldSplit ? 'text-blue-600' : 'text-gray-500'}>
          {splitPreview}
        </span>
        {shouldSplit && (
          <span className="text-gray-400 text-xs ml-2">
            (各約{perSplitCount}名)
          </span>
        )}
      </td>
    </tr>
  );
}
