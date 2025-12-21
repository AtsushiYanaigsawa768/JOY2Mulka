// Core data types matching the existing Python implementation

export interface Entry {
  id: string;
  className: string;
  name1: string;          // Kanji name
  name2: string;          // Hiragana/Katakana
  affiliation: string;
  affiliations: string[]; // Parsed from "/" separator
  cardNumber: string;
  joaNumber: string;
  isRental: boolean;
  gender: string;
  rowNumber: number;
  participantNumber: number;
  ranking?: number;       // JOA ranking (fetched from JOA site)
}

export interface ClassInfo {
  name: string;
  count: number;
  shouldSplit: boolean;
  splitCount: number;
}

export interface Course {
  id: string;
  name: string;
  originalClass: string;
  splitNumber?: number;
  entries: Entry[];
  assigned: boolean;
  startAreaId?: string;
  laneId?: string;
  order?: number;
}

export interface StartArea {
  id: string;
  name: string;
  lanes: Lane[];
}

export interface Lane {
  id: string;
  name: string;
  startTime: string;
  startNumber: number;
  interval: number;  // minutes between entries
  interCourseGap: number;  // minutes gap between courses
  affiliationSplit: boolean;
  courseIds: string[];
}

export type RaceType = 'forest' | 'sprint';

export interface Constraints {
  isRankingEvent: boolean;
  avoidSameClubConsecutive: boolean;
  maxShuffleAttempts: number;
  useRankingForSplit: Record<string, boolean>;
  raceType: RaceType;  // forest or sprint (affects ranking URL)
  allowSameTimeClubDuplicates: boolean;
  sameTimeClubScope: 'all' | 'selected';
  sameTimeClubSelectedAreas: string[];
  allowSameLaneClubDuplicates: 'allow' | 'disallow-all' | 'disallow-selected';
  sameLaneClubSelectedCourses: string[];
  sameLaneClubTimeWindow: number;  // minutes
}

export interface StartListEntry {
  className: string;
  startNumber: number;
  name1: string;
  name2: string;
  affiliation: string;
  startTime: string;
  cardNumber: string;
  cardNote: string;
  joaNumber: string;
  isRental: boolean;
  lane: string;
  startArea: string;
}

export interface Conflict {
  type: 'same-time-club' | 'same-lane-club';
  entries: StartListEntry[];
  startTime: string;
  lane?: string;
  startArea?: string;
  message: string;
}

export interface RepairSuggestion {
  conflictId: string;
  action: 'swap' | 'shift';
  description: string;
  entries: StartListEntry[];
}

export interface GenerationResult {
  startList: StartListEntry[];
  conflicts: Conflict[];
  suggestions: RepairSuggestion[];
  seed: number;
}

export interface OutputFiles {
  mulkaCsv: string;
  roleCsv: string;
  publicTex: string;
  roleTex: string;
  classSummaryCsv: string;
}

export type Step = 'step0' | 'step1' | 'step2' | 'step3' | 'step4' | 'done';

export interface ColumnMapping {
  class: number | null;
  affiliation: number | null;
  teamName: number | null;
  rentalCount: number | null;
  participants: {
    [key: number]: {
      name1: number | null;
      name2: number | null;
      gender: number | null;
      cardNumber: number | null;
      joaNumber: number | null;
    };
  };
}

export interface GlobalSettings {
  competitionName: string;
  outputFolder: string;
  language: 'ja' | 'en';
  defaultStartTime: string;
  defaultInterval: number;
  interCourseGap: number;
  seed: number;
}

export interface AppState {
  step: Step;
  rawData: string[][] | null;
  headerRow: string[];
  columnNamesRow: string[];
  columnMapping: ColumnMapping | null;
  entries: Entry[];
  classes: ClassInfo[];
  courses: Course[];
  startAreas: StartArea[];
  constraints: Constraints;
  globalSettings: GlobalSettings;
  generationResult: GenerationResult | null;
  startList: StartListEntry[];
  outputFiles: OutputFiles | null;
  error: string | null;
  rankings: Map<string, Map<string, number>>; // className -> (normalizedName -> rank)
  rankingFetchStatus: 'idle' | 'loading' | 'success' | 'error';
}

export type AppAction =
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'SET_RAW_DATA'; payload: { data: string[][]; header: string[]; columnNames: string[] } }
  | { type: 'SET_COLUMN_MAPPING'; payload: ColumnMapping }
  | { type: 'SET_ENTRIES'; payload: Entry[] }
  | { type: 'MERGE_ENTRIES'; payload: Entry[] }
  | { type: 'SET_CLASSES'; payload: ClassInfo[] }
  | { type: 'UPDATE_CLASS'; payload: { name: string; updates: Partial<ClassInfo> } }
  | { type: 'SET_COURSES'; payload: Course[] }
  | { type: 'UPDATE_COURSE'; payload: { id: string; updates: Partial<Course> } }
  | { type: 'ADD_START_AREA'; payload: StartArea }
  | { type: 'UPDATE_START_AREA'; payload: { id: string; updates: Partial<StartArea> } }
  | { type: 'REMOVE_START_AREA'; payload: string }
  | { type: 'ADD_LANE'; payload: { areaId: string; lane: Lane } }
  | { type: 'UPDATE_LANE'; payload: { areaId: string; laneId: string; updates: Partial<Lane> } }
  | { type: 'REMOVE_LANE'; payload: { areaId: string; laneId: string } }
  | { type: 'ASSIGN_COURSE'; payload: { courseId: string; areaId: string; laneId: string; order: number } }
  | { type: 'UNASSIGN_COURSE'; payload: string }
  | { type: 'REORDER_COURSE'; payload: { laneId: string; areaId: string; courseId: string; direction: 'up' | 'down' } }
  | { type: 'SET_CONSTRAINTS'; payload: Partial<Constraints> }
  | { type: 'SET_GLOBAL_SETTINGS'; payload: Partial<GlobalSettings> }
  | { type: 'SET_GENERATION_RESULT'; payload: GenerationResult }
  | { type: 'SET_START_LIST'; payload: StartListEntry[] }
  | { type: 'SET_START_AREAS'; payload: StartArea[] }
  | { type: 'SET_OUTPUT_FILES'; payload: OutputFiles }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RANKINGS'; payload: Map<string, Map<string, number>> }
  | { type: 'SET_RANKING_FETCH_STATUS'; payload: 'idle' | 'loading' | 'success' | 'error' }
  | { type: 'RESET' };
