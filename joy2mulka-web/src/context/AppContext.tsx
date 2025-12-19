import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, AppAction, Step } from '../types';

const initialState: AppState = {
  step: 'step0',
  rawData: null,
  headerRow: [],
  columnNamesRow: [],
  columnMapping: null,
  entries: [],
  classes: [],
  courses: [],
  startAreas: [],
  constraints: {
    isRankingEvent: false,
    avoidSameClubConsecutive: true,
    maxShuffleAttempts: 1000,
    useRankingForSplit: {},
    raceType: 'forest',
    allowSameTimeClubDuplicates: true,
    sameTimeClubScope: 'all',
    sameTimeClubSelectedAreas: [],
    allowSameLaneClubDuplicates: 'allow',
    sameLaneClubSelectedCourses: [],
    sameLaneClubTimeWindow: 1,
  },
  globalSettings: {
    competitionName: 'Orienteering Competition',
    outputFolder: 'Competition',
    language: 'ja',
    defaultStartTime: '11:00',
    defaultInterval: 1,
    interCourseGap: 0,
    seed: 42,
  },
  generationResult: null,
  startList: [],
  outputFiles: null,
  error: null,
  rankings: new Map(),
  rankingFetchStatus: 'idle',
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SET_RAW_DATA':
      return {
        ...state,
        rawData: action.payload.data,
        headerRow: action.payload.header,
        columnNamesRow: action.payload.columnNames,
      };

    case 'SET_COLUMN_MAPPING':
      return { ...state, columnMapping: action.payload };

    case 'SET_ENTRIES':
      return { ...state, entries: action.payload };

    case 'SET_CLASSES':
      return { ...state, classes: action.payload };

    case 'UPDATE_CLASS': {
      const classes = state.classes.map((c) =>
        c.name === action.payload.name ? { ...c, ...action.payload.updates } : c
      );
      return { ...state, classes };
    }

    case 'SET_COURSES':
      return { ...state, courses: action.payload };

    case 'UPDATE_COURSE': {
      const courses = state.courses.map((c) =>
        c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
      );
      return { ...state, courses };
    }

    case 'ADD_START_AREA':
      return { ...state, startAreas: [...state.startAreas, action.payload] };

    case 'UPDATE_START_AREA': {
      const startAreas = state.startAreas.map((a) =>
        a.id === action.payload.id ? { ...a, ...action.payload.updates } : a
      );
      return { ...state, startAreas };
    }

    case 'REMOVE_START_AREA': {
      // Unassign all courses from this area
      const areaToRemove = state.startAreas.find((a) => a.id === action.payload);
      let courses = state.courses;
      if (areaToRemove) {
        const courseIdsToUnassign = areaToRemove.lanes.flatMap((l) => l.courseIds);
        courses = state.courses.map((c) =>
          courseIdsToUnassign.includes(c.id)
            ? { ...c, assigned: false, startAreaId: undefined, laneId: undefined, order: undefined }
            : c
        );
      }
      return {
        ...state,
        startAreas: state.startAreas.filter((a) => a.id !== action.payload),
        courses,
      };
    }

    case 'ADD_LANE': {
      const startAreas = state.startAreas.map((a) =>
        a.id === action.payload.areaId ? { ...a, lanes: [...a.lanes, action.payload.lane] } : a
      );
      return { ...state, startAreas };
    }

    case 'UPDATE_LANE': {
      const startAreas = state.startAreas.map((a) =>
        a.id === action.payload.areaId
          ? {
              ...a,
              lanes: a.lanes.map((l) =>
                l.id === action.payload.laneId ? { ...l, ...action.payload.updates } : l
              ),
            }
          : a
      );
      return { ...state, startAreas };
    }

    case 'REMOVE_LANE': {
      // Unassign all courses from this lane
      const areaWithLane = state.startAreas.find((a) => a.id === action.payload.areaId);
      const laneToRemove = areaWithLane?.lanes.find((l) => l.id === action.payload.laneId);
      let courses = state.courses;
      if (laneToRemove) {
        courses = state.courses.map((c) =>
          laneToRemove.courseIds.includes(c.id)
            ? { ...c, assigned: false, startAreaId: undefined, laneId: undefined, order: undefined }
            : c
        );
      }

      const startAreas = state.startAreas.map((a) =>
        a.id === action.payload.areaId
          ? { ...a, lanes: a.lanes.filter((l) => l.id !== action.payload.laneId) }
          : a
      );
      return { ...state, startAreas, courses };
    }

    case 'ASSIGN_COURSE': {
      const { courseId, areaId, laneId, order } = action.payload;

      // Update course assignment
      const courses = state.courses.map((c) =>
        c.id === courseId
          ? { ...c, assigned: true, startAreaId: areaId, laneId: laneId, order }
          : c
      );

      // Add course to lane's courseIds
      const startAreas = state.startAreas.map((a) =>
        a.id === areaId
          ? {
              ...a,
              lanes: a.lanes.map((l) =>
                l.id === laneId
                  ? { ...l, courseIds: [...l.courseIds.filter((id) => id !== courseId), courseId] }
                  : l
              ),
            }
          : a
      );

      return { ...state, courses, startAreas };
    }

    case 'UNASSIGN_COURSE': {
      const courseId = action.payload;
      const courseToUnassign = state.courses.find((c) => c.id === courseId);

      // Update course assignment
      const courses = state.courses.map((c) =>
        c.id === courseId
          ? { ...c, assigned: false, startAreaId: undefined, laneId: undefined, order: undefined }
          : c
      );

      // Remove course from lane's courseIds
      let startAreas = state.startAreas;
      if (courseToUnassign?.startAreaId && courseToUnassign?.laneId) {
        startAreas = state.startAreas.map((a) =>
          a.id === courseToUnassign.startAreaId
            ? {
                ...a,
                lanes: a.lanes.map((l) =>
                  l.id === courseToUnassign.laneId
                    ? { ...l, courseIds: l.courseIds.filter((id) => id !== courseId) }
                    : l
                ),
              }
            : a
        );
      }

      return { ...state, courses, startAreas };
    }

    case 'REORDER_COURSE': {
      const { laneId, areaId, courseId, direction } = action.payload;

      const startAreas = state.startAreas.map((a) => {
        if (a.id !== areaId) return a;

        return {
          ...a,
          lanes: a.lanes.map((l) => {
            if (l.id !== laneId) return l;

            const courseIds = [...l.courseIds];
            const idx = courseIds.indexOf(courseId);
            if (idx === -1) return l;

            if (direction === 'up' && idx > 0) {
              [courseIds[idx - 1], courseIds[idx]] = [courseIds[idx], courseIds[idx - 1]];
            } else if (direction === 'down' && idx < courseIds.length - 1) {
              [courseIds[idx], courseIds[idx + 1]] = [courseIds[idx + 1], courseIds[idx]];
            }

            return { ...l, courseIds };
          }),
        };
      });

      // Update course orders
      const courses = state.courses.map((c) => {
        if (c.laneId !== laneId || c.startAreaId !== areaId) return c;
        const lane = startAreas.find((a) => a.id === areaId)?.lanes.find((l) => l.id === laneId);
        if (!lane) return c;
        const order = lane.courseIds.indexOf(c.id);
        return { ...c, order };
      });

      return { ...state, startAreas, courses };
    }

    case 'SET_CONSTRAINTS':
      return { ...state, constraints: { ...state.constraints, ...action.payload } };

    case 'SET_GLOBAL_SETTINGS':
      return { ...state, globalSettings: { ...state.globalSettings, ...action.payload } };

    case 'SET_GENERATION_RESULT':
      return { ...state, generationResult: action.payload };

    case 'SET_START_LIST':
      return { ...state, startList: action.payload };

    case 'SET_START_AREAS':
      return { ...state, startAreas: action.payload };

    case 'SET_OUTPUT_FILES':
      return { ...state, outputFiles: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_RANKINGS':
      return { ...state, rankings: action.payload };

    case 'SET_RANKING_FETCH_STATUS':
      return { ...state, rankingFetchStatus: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  goToStep: (step: Step) => void;
  canProceedToStep: (step: Step) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const goToStep = (step: Step) => {
    if (canProceedToStep(step)) {
      dispatch({ type: 'SET_STEP', payload: step });
    }
  };

  const canProceedToStep = (step: Step): boolean => {
    // Check if all courses are assigned to lanes
    const allCoursesAssigned = () => {
      if (state.courses.length === 0) return false;
      const assignedCourseIds = new Set(
        state.startAreas.flatMap((a) => a.lanes.flatMap((l) => l.courseIds))
      );
      return state.courses.every((c) => assignedCourseIds.has(c.id));
    };

    switch (step) {
      case 'step0':
        return true;
      case 'step1':
        return state.entries.length > 0;
      case 'step2':
        return state.courses.length > 0;
      case 'step3':
        // All courses must be assigned to lanes
        return allCoursesAssigned();
      case 'step4':
        return allCoursesAssigned();
      case 'done':
        return state.startList.length > 0;
      default:
        return false;
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch, goToStep, canProceedToStep }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
