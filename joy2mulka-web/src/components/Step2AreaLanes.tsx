import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StartArea, Lane, Course, Entry } from '../types';

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Calculate entry count for a course
function getCourseEntryCount(course: Course, entries: Entry[], allCourses: Course[]): number {
  const classEntries = entries.filter((e) => e.className === course.originalClass);
  if (course.splitNumber) {
    // For split courses, divide by split count
    const splitCount = allCourses.filter((c) => c.originalClass === course.originalClass).length;
    return Math.ceil(classEntries.length / splitCount);
  }
  return classEntries.length;
}

export default function Step2AreaLanes() {
  const { state, dispatch, goToStep } = useApp();
  const [draggedCourse, setDraggedCourse] = useState<string | null>(null);

  // Calculate entry counts for all courses
  const courseEntryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of state.courses) {
      counts.set(course.id, getCourseEntryCount(course, state.entries, state.courses));
    }
    return counts;
  }, [state.courses, state.entries]);

  // Calculate entry count per lane
  const laneEntryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const area of state.startAreas) {
      for (const lane of area.lanes) {
        let total = 0;
        for (const courseId of lane.courseIds) {
          total += courseEntryCounts.get(courseId) || 0;
        }
        counts.set(lane.id, total);
      }
    }
    return counts;
  }, [state.startAreas, courseEntryCounts]);

  // Extract settings values to use as stable dependencies
  const { defaultStartTime, defaultInterval, interCourseGap } = state.globalSettings;

  // Initialize default start area if none exist
  useEffect(() => {
    if (state.startAreas.length === 0) {
      const defaultArea: StartArea = {
        id: generateId(),
        name: 'スタート1',
        lanes: [
          {
            id: generateId(),
            name: 'Lane 1',
            startTime: defaultStartTime,
            startNumber: 1,
            interval: defaultInterval,
            interCourseGap: interCourseGap,
            affiliationSplit: true,
            courseIds: [],
          },
        ],
      };
      dispatch({ type: 'SET_START_AREAS', payload: [defaultArea] });
    }
  }, [state.startAreas.length, defaultStartTime, defaultInterval, interCourseGap, dispatch]);

  // Auto-assign courses to lanes
  const autoAssignCourses = () => {
    // Get all lanes with their current entry counts
    const lanes: { areaId: string; laneId: string; entryCount: number; courseIds: string[] }[] = [];
    for (const area of state.startAreas) {
      for (const lane of area.lanes) {
        let entryCount = 0;
        for (const courseId of lane.courseIds) {
          entryCount += courseEntryCounts.get(courseId) || 0;
        }
        lanes.push({
          areaId: area.id,
          laneId: lane.id,
          entryCount,
          courseIds: [...lane.courseIds],
        });
      }
    }

    if (lanes.length === 0) return;

    // Get unassigned courses sorted by entry count (descending - larger first)
    const assignedCourseIds = new Set(lanes.flatMap((l) => l.courseIds));
    const unassigned = state.courses
      .filter((c) => !assignedCourseIds.has(c.id))
      .map((c) => ({ id: c.id, count: courseEntryCounts.get(c.id) || 0 }))
      .sort((a, b) => b.count - a.count);

    // Assign each course to the lane with the fewest entries
    for (const course of unassigned) {
      // Find lane with minimum entries
      let minLane = lanes[0];
      for (const lane of lanes) {
        if (lane.entryCount < minLane.entryCount) {
          minLane = lane;
        }
      }
      // Add course to the beginning (larger courses get earlier start)
      minLane.courseIds.unshift(course.id);
      minLane.entryCount += course.count;
    }

    // Update start areas with new assignments
    const updatedAreas = state.startAreas.map((area) => ({
      ...area,
      lanes: area.lanes.map((lane) => {
        const laneData = lanes.find((l) => l.laneId === lane.id);
        return laneData ? { ...lane, courseIds: laneData.courseIds } : lane;
      }),
    }));

    dispatch({ type: 'SET_START_AREAS', payload: updatedAreas });
  };

  const addStartArea = () => {
    const newArea: StartArea = {
      id: generateId(),
      name: `スタート${state.startAreas.length + 1}`,
      lanes: [
        {
          id: generateId(),
          name: 'Lane 1',
          startTime: defaultStartTime,
          startNumber: 1,
          interval: defaultInterval,
          interCourseGap: interCourseGap,
          affiliationSplit: true,
          courseIds: [],
        },
      ],
    };
    dispatch({ type: 'SET_START_AREAS', payload: [...state.startAreas, newArea] });
  };

  const removeStartArea = (areaId: string) => {
    dispatch({
      type: 'SET_START_AREAS',
      payload: state.startAreas.filter((a) => a.id !== areaId),
    });
  };

  const updateStartArea = (areaId: string, updates: Partial<StartArea>) => {
    dispatch({
      type: 'SET_START_AREAS',
      payload: state.startAreas.map((a) =>
        a.id === areaId ? { ...a, ...updates } : a
      ),
    });
  };

  const addLane = (areaId: string) => {
    const area = state.startAreas.find((a) => a.id === areaId);
    if (!area) return;

    const newLane: Lane = {
      id: generateId(),
      name: `Lane ${area.lanes.length + 1}`,
      startTime: defaultStartTime,
      startNumber: 1,
      interval: defaultInterval,
      interCourseGap: interCourseGap,
      affiliationSplit: true,
      courseIds: [],
    };

    updateStartArea(areaId, { lanes: [...area.lanes, newLane] });
  };

  const removeLane = (areaId: string, laneId: string) => {
    const area = state.startAreas.find((a) => a.id === areaId);
    if (!area) return;

    updateStartArea(areaId, {
      lanes: area.lanes.filter((l) => l.id !== laneId),
    });
  };

  const updateLane = (areaId: string, laneId: string, updates: Partial<Lane>) => {
    const area = state.startAreas.find((a) => a.id === areaId);
    if (!area) return;

    updateStartArea(areaId, {
      lanes: area.lanes.map((l) => (l.id === laneId ? { ...l, ...updates } : l)),
    });
  };

  const handleDragStart = (courseId: string) => {
    setDraggedCourse(courseId);
  };

  const handleDragEnd = () => {
    setDraggedCourse(null);
  };

  const handleDropOnLane = (areaId: string, laneId: string) => {
    if (!draggedCourse) return;

    // Remove course from any existing lane
    const updatedAreas = state.startAreas.map((area) => ({
      ...area,
      lanes: area.lanes.map((lane) => ({
        ...lane,
        courseIds: lane.courseIds.filter((id) => id !== draggedCourse),
      })),
    }));

    // Add to target lane
    const finalAreas = updatedAreas.map((area) =>
      area.id === areaId
        ? {
            ...area,
            lanes: area.lanes.map((lane) =>
              lane.id === laneId
                ? { ...lane, courseIds: [...lane.courseIds, draggedCourse] }
                : lane
            ),
          }
        : area
    );

    dispatch({ type: 'SET_START_AREAS', payload: finalAreas });
    setDraggedCourse(null);
  };

  const removeCourseFromLane = (areaId: string, laneId: string, courseId: string) => {
    const updatedAreas = state.startAreas.map((area) =>
      area.id === areaId
        ? {
            ...area,
            lanes: area.lanes.map((lane) =>
              lane.id === laneId
                ? { ...lane, courseIds: lane.courseIds.filter((id) => id !== courseId) }
                : lane
            ),
          }
        : area
    );
    dispatch({ type: 'SET_START_AREAS', payload: updatedAreas });
  };

  const reorderCourseInLane = (areaId: string, laneId: string, courseId: string, direction: 'left' | 'right') => {
    const updatedAreas = state.startAreas.map((area) => {
      if (area.id !== areaId) return area;

      return {
        ...area,
        lanes: area.lanes.map((lane) => {
          if (lane.id !== laneId) return lane;

          const courseIds = [...lane.courseIds];
          const currentIndex = courseIds.indexOf(courseId);
          if (currentIndex === -1) return lane;

          const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
          if (newIndex < 0 || newIndex >= courseIds.length) return lane;

          // Swap
          [courseIds[currentIndex], courseIds[newIndex]] = [courseIds[newIndex], courseIds[currentIndex]];
          return { ...lane, courseIds };
        }),
      };
    });

    dispatch({ type: 'SET_START_AREAS', payload: updatedAreas });
  };

  // Get unassigned courses
  const assignedCourseIds = new Set(
    state.startAreas.flatMap((a) => a.lanes.flatMap((l) => l.courseIds))
  );
  const unassignedCourses = state.courses.filter((c) => !assignedCourseIds.has(c.id));

  // Check if all courses are assigned
  const allAssigned = unassignedCourses.length === 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Step 2: スタート設定</h2>

      <div className="mb-4 text-sm text-gray-600">
        スタートエリアとレーンを設定し、コースをドラッグ＆ドロップで配置してください。
      </div>

      {/* 70/30 Layout */}
      <div className="flex gap-6">
        {/* Left: Start Areas (70%) */}
        <div className="w-[70%]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">スタートエリア・レーン</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={autoAssignCourses}
                disabled={unassignedCourses.length === 0}
                className={`text-sm px-3 py-1 rounded ${
                  unassignedCourses.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                自動配置
              </button>
              <button
                onClick={addStartArea}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + エリア追加
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {state.startAreas.map((area) => (
              <StartAreaCard
                key={area.id}
                area={area}
                courses={state.courses}
                courseEntryCounts={courseEntryCounts}
                laneEntryCounts={laneEntryCounts}
                onUpdate={(updates) => updateStartArea(area.id, updates)}
                onRemove={() => removeStartArea(area.id)}
                onAddLane={() => addLane(area.id)}
                onRemoveLane={(laneId) => removeLane(area.id, laneId)}
                onUpdateLane={(laneId, updates) => updateLane(area.id, laneId, updates)}
                onDropCourse={(laneId) => handleDropOnLane(area.id, laneId)}
                onRemoveCourse={(laneId, courseId) =>
                  removeCourseFromLane(area.id, laneId, courseId)
                }
                onReorderCourse={(laneId, courseId, direction) =>
                  reorderCourseInLane(area.id, laneId, courseId, direction)
                }
                isDragging={draggedCourse !== null}
              />
            ))}
          </div>
        </div>

        {/* Right: Unassigned Courses + Global Settings (30%) */}
        <div className="w-[30%] space-y-4">
          {/* Unassigned Courses */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">未配置コース</h3>
            {unassignedCourses.length === 0 ? (
              <p className="text-sm text-gray-500">すべてのコースが配置されました</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {unassignedCourses.map((course) => (
                  <CourseChip
                    key={course.id}
                    course={course}
                    entries={state.entries}
                    onDragStart={() => handleDragStart(course.id)}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedCourse === course.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Global Settings */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">生成設定</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">乱数シード</label>
                <input
                  type="number"
                  value={state.globalSettings.seed}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_GLOBAL_SETTINGS',
                      payload: { seed: parseInt(e.target.value) || 42 },
                    })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  同じシードで同じ結果を再現
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium mb-2">配置状況</h3>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">総コース数:</span>
                <span>{state.courses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">配置済み:</span>
                <span className="text-green-600">
                  {state.courses.length - unassignedCourses.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">未配置:</span>
                <span className={unassignedCourses.length > 0 ? 'text-orange-600' : ''}>
                  {unassignedCourses.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => goToStep('step1')}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 戻る
        </button>
        <button
          onClick={() => goToStep('step3')}
          disabled={!allAssigned}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            allAssigned
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          次へ →
        </button>
      </div>
    </div>
  );
}

interface StartAreaCardProps {
  area: StartArea;
  courses: Course[];
  courseEntryCounts: Map<string, number>;
  laneEntryCounts: Map<string, number>;
  onUpdate: (updates: Partial<StartArea>) => void;
  onRemove: () => void;
  onAddLane: () => void;
  onRemoveLane: (laneId: string) => void;
  onUpdateLane: (laneId: string, updates: Partial<Lane>) => void;
  onDropCourse: (laneId: string) => void;
  onRemoveCourse: (laneId: string, courseId: string) => void;
  onReorderCourse: (laneId: string, courseId: string, direction: 'left' | 'right') => void;
  isDragging: boolean;
}

function StartAreaCard({
  area,
  courses,
  courseEntryCounts,
  laneEntryCounts,
  onUpdate,
  onRemove,
  onAddLane,
  onRemoveLane,
  onUpdateLane,
  onDropCourse,
  onRemoveCourse,
  onReorderCourse,
  isDragging,
}: StartAreaCardProps) {
  // Calculate total entries for this area
  const areaTotal = area.lanes.reduce((sum, lane) => sum + (laneEntryCounts.get(lane.id) || 0), 0);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={area.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="font-medium border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
          />
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            計 {areaTotal}名
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddLane}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + レーン
          </button>
          <button
            onClick={onRemove}
            className="text-sm text-red-500 hover:text-red-700"
          >
            削除
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {area.lanes.map((lane) => (
          <LaneRow
            key={lane.id}
            lane={lane}
            courses={courses}
            courseEntryCounts={courseEntryCounts}
            entryCount={laneEntryCounts.get(lane.id) || 0}
            onUpdate={(updates) => onUpdateLane(lane.id, updates)}
            onRemove={() => onRemoveLane(lane.id)}
            onDropCourse={() => onDropCourse(lane.id)}
            onRemoveCourse={(courseId) => onRemoveCourse(lane.id, courseId)}
            onReorderCourse={(courseId, direction) => onReorderCourse(lane.id, courseId, direction)}
            isDragging={isDragging}
          />
        ))}
      </div>
    </div>
  );
}

interface LaneRowProps {
  lane: Lane;
  courses: Course[];
  courseEntryCounts: Map<string, number>;
  entryCount: number;
  onUpdate: (updates: Partial<Lane>) => void;
  onRemove: () => void;
  onDropCourse: () => void;
  onRemoveCourse: (courseId: string) => void;
  onReorderCourse: (courseId: string, direction: 'left' | 'right') => void;
  isDragging: boolean;
}

function LaneRow({
  lane,
  courses,
  courseEntryCounts,
  entryCount,
  onUpdate,
  onRemove,
  onDropCourse,
  onRemoveCourse,
  onReorderCourse,
  isDragging,
}: LaneRowProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(false);
    onDropCourse();
  };

  // Map from courseIds to maintain the correct order
  const assignedCourses = lane.courseIds
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => c !== undefined);

  return (
    <div className="bg-gray-50 rounded p-3">
      <div className="flex items-center gap-3 mb-2">
        <input
          type="text"
          value={lane.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-24 text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="レーン名"
        />
        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded min-w-[60px] text-center">
          {entryCount}名
        </span>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">開始:</label>
          <input
            type="text"
            value={lane.startTime}
            onChange={(e) => onUpdate({ startTime: e.target.value })}
            className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
            placeholder="10:00"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">番号:</label>
          <input
            type="number"
            value={lane.startNumber}
            onChange={(e) => onUpdate({ startNumber: parseInt(e.target.value) || 1 })}
            className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">間隔:</label>
          <input
            type="number"
            value={lane.interval}
            onChange={(e) => onUpdate({ interval: parseInt(e.target.value) || 2 })}
            className="w-12 text-sm border border-gray-300 rounded px-2 py-1"
          />
          <span className="text-xs text-gray-500">分</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">コース間:</label>
          <input
            type="number"
            value={lane.interCourseGap ?? 0}
            onChange={(e) => onUpdate({ interCourseGap: parseInt(e.target.value) || 0 })}
            className="w-12 text-sm border border-gray-300 rounded px-2 py-1"
            min={0}
          />
          <span className="text-xs text-gray-500">分</span>
        </div>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={lane.affiliationSplit}
            onChange={(e) => onUpdate({ affiliationSplit: e.target.checked })}
            className="rounded border-gray-300"
          />
          所属分散
        </label>
        <button
          onClick={onRemove}
          className="ml-auto text-xs text-red-500 hover:text-red-700"
        >
          ×
        </button>
      </div>

      {/* Course Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`min-h-[40px] border-2 border-dashed rounded p-2 transition-colors ${
          isDropTarget
            ? 'border-blue-500 bg-blue-50'
            : isDragging
            ? 'border-gray-400'
            : 'border-gray-200'
        }`}
      >
        {assignedCourses.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-1">
            コースをここにドロップ
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {assignedCourses.map((course, index) => (
              <span
                key={course.id}
                className="inline-flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
              >
                {/* Left arrow - move earlier */}
                <button
                  onClick={() => onReorderCourse(course.id, 'left')}
                  disabled={index === 0}
                  className={`mr-1 ${
                    index === 0
                      ? 'text-blue-300 cursor-not-allowed'
                      : 'text-blue-600 hover:text-blue-800'
                  }`}
                  title="前に移動"
                >
                  ◀
                </button>
                {course.name}
                <span className="text-blue-500 ml-1">
                  ({courseEntryCounts.get(course.id) || 0})
                </span>
                {/* Right arrow - move later */}
                <button
                  onClick={() => onReorderCourse(course.id, 'right')}
                  disabled={index === assignedCourses.length - 1}
                  className={`ml-1 ${
                    index === assignedCourses.length - 1
                      ? 'text-blue-300 cursor-not-allowed'
                      : 'text-blue-600 hover:text-blue-800'
                  }`}
                  title="後に移動"
                >
                  ▶
                </button>
                <button
                  onClick={() => onRemoveCourse(course.id)}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="削除"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CourseChipProps {
  course: Course;
  entries: any[];
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function CourseChip({ course, entries, onDragStart, onDragEnd, isDragging }: CourseChipProps) {
  // Count entries for this course
  const count = entries.filter((e) => e.className === course.originalClass).length;
  const perSplit = course.splitNumber
    ? Math.ceil(count / (course.name.match(/\d+$/)?.[0] ? parseInt(course.name.slice(-1)) : 1))
    : count;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center justify-between bg-white border rounded px-3 py-2 cursor-move transition-opacity ${
        isDragging ? 'opacity-50' : 'hover:bg-gray-50'
      }`}
    >
      <span className="font-medium text-sm">{course.name}</span>
      <span className="text-xs text-gray-500">
        {course.splitNumber ? `~${perSplit}名` : `${count}名`}
      </span>
    </div>
  );
}
