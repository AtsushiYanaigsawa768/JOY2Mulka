import { Entry, Course, StartArea, Lane, StartListEntry, Constraints, Conflict } from '../types';

/**
 * Create a seeded random number generator
 */
function createRng(seed: number) {
  // Simple mulberry32 PRNG
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle array with seeded RNG
 */
function shuffleArray<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Split entries by ranking (matches Python: split_class_by_ranking)
 *
 * Ranked entries are distributed using modulo:
 * - Rank 1 -> Group 1, Rank 2 -> Group 2, etc.
 *
 * Unranked entries are distributed randomly to balance group sizes.
 */
export function splitClassByRanking(
  entries: Entry[],
  splitCount: number,
  rankings: Map<string, number>,
  seed: number
): Entry[][] {
  const rng = createRng(seed);

  // Separate ranked and unranked entries
  const rankedEntries: { rank: number; entry: Entry }[] = [];
  const unrankedEntries: Entry[] = [];

  for (const entry of entries) {
    const rank = lookupEntryRank(entry, rankings);
    if (rank !== null) {
      rankedEntries.push({ rank, entry });
    } else {
      unrankedEntries.push(entry);
    }
  }

  // Sort ranked entries by rank
  rankedEntries.sort((a, b) => a.rank - b.rank);

  // Create groups
  const groups: Entry[][] = Array.from({ length: splitCount }, () => []);

  // Distribute ranked entries by modulo
  for (let i = 0; i < rankedEntries.length; i++) {
    const internalRank = i + 1;
    const groupIdx = (internalRank - 1) % splitCount;
    groups[groupIdx].push(rankedEntries[i].entry);
  }

  // Shuffle unranked entries
  const shuffledUnranked = shuffleArray(unrankedEntries, rng);

  // Distribute unranked entries to balance group sizes
  for (const entry of shuffledUnranked) {
    // Find smallest group
    let minIdx = 0;
    let minSize = groups[0].length;
    for (let i = 1; i < groups.length; i++) {
      if (groups[i].length < minSize) {
        minSize = groups[i].length;
        minIdx = i;
      }
    }
    groups[minIdx].push(entry);
  }

  return groups;
}

/**
 * Look up rank for an entry by name
 */
export function lookupEntryRank(
  entry: Entry,
  rankings: Map<string, number>
): number | null {
  // Try name1 first
  if (rankings.has(entry.name1)) {
    return rankings.get(entry.name1)!;
  }

  // Try normalized matching
  const name1Norm = normalizeName(entry.name1);
  for (const [name, rank] of rankings.entries()) {
    if (normalizeName(name) === name1Norm) {
      return rank;
    }
  }

  return null;
}

/**
 * Normalize name for matching
 */
function normalizeName(name: string): string {
  if (!name) return '';
  // Remove all whitespace and convert to lowercase
  return name.replace(/[\s\u3000]+/g, '').toLowerCase();
}

/**
 * Get affiliations for checking consecutive runners
 * Matches Python: split_affiliations_for_check
 */
function getAffiliationsForCheck(entry: Entry): string[] {
  let affiliations = entry.affiliations;
  if (!affiliations || affiliations.length === 0) {
    const aff = entry.affiliation;
    if (aff && aff !== '-') {
      affiliations = [aff];
    }
  }

  // Remove numeric suffixes and normalize
  return affiliations.map((aff) =>
    aff.replace(/\d+$/, '').trim().toLowerCase()
  ).filter(Boolean);
}

/**
 * Check if two entries have overlapping affiliations
 * Matches Python: has_affiliation_overlap
 */
function hasAffiliationOverlap(entry1: Entry, entry2: Entry): boolean {
  const affs1 = new Set(getAffiliationsForCheck(entry1));
  const affs2 = new Set(getAffiliationsForCheck(entry2));

  if (affs1.size === 0 || affs2.size === 0) {
    return false;
  }

  for (const aff of affs1) {
    if (affs2.has(aff)) {
      return true;
    }
  }
  return false;
}

/**
 * Count consecutive same-affiliation pairs
 * Matches Python: count_consecutive_conflicts
 */
function countConsecutiveConflicts(entries: Entry[]): number {
  let conflicts = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    if (hasAffiliationOverlap(entries[i], entries[i + 1])) {
      conflicts++;
    }
  }
  return conflicts;
}

/**
 * Greedy ordering to avoid consecutive affiliations
 * Matches Python: greedy_order_by_affiliation
 */
function greedyOrderByAffiliation(entries: Entry[]): Entry[] {
  if (entries.length <= 1) {
    return entries;
  }

  const remaining = [...entries];
  const result = [remaining.shift()!];

  while (remaining.length > 0) {
    // Find an entry that doesn't conflict with the last one
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      if (!hasAffiliationOverlap(result[result.length - 1], remaining[i])) {
        result.push(remaining.splice(i, 1)[0]);
        found = true;
        break;
      }
    }

    if (!found) {
      // No non-conflicting entry, just add the first one
      result.push(remaining.shift()!);
    }
  }

  return result;
}

/**
 * Shuffle entries avoiding consecutive affiliations
 * Matches Python: shuffle_avoiding_consecutive_affiliations
 */
export function shuffleAvoidingConsecutiveAffiliations(
  entries: Entry[],
  maxAttempts: number = 1000,
  seed: number
): Entry[] {
  if (entries.length <= 1) {
    return entries;
  }

  const rng = createRng(seed);
  let bestResult = entries;
  let bestConflicts = countConsecutiveConflicts(entries);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Shuffle entries
    const shuffled = shuffleArray(entries, rng);

    // Try greedy ordering
    const result = greedyOrderByAffiliation(shuffled);
    const conflicts = countConsecutiveConflicts(result);

    if (conflicts < bestConflicts) {
      bestResult = result;
      bestConflicts = conflicts;
    }

    if (conflicts === 0) {
      break;
    }
  }

  return bestResult;
}

/**
 * Parse time string to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(/[:;]/).map((p) => parseInt(p) || 0);
  return parts[0] * 60 + (parts[1] || 0);
}

/**
 * Format minutes since midnight to HH:MM:SS
 */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

/**
 * Generate start list for a single lane
 */
export function generateStartListForLane(
  courses: Course[],
  lane: Lane,
  startArea: StartArea,
  affiliationSplit: boolean,
  seed: number
): StartListEntry[] {
  const startList: StartListEntry[] = [];
  let currentTimeMinutes = parseTimeToMinutes(lane.startTime);
  let currentNumber = lane.startNumber;

  // Sort courses by order
  const sortedCourses = [...courses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const course of sortedCourses) {
    // Order entries
    let orderedEntries: Entry[];
    if (affiliationSplit) {
      orderedEntries = shuffleAvoidingConsecutiveAffiliations(course.entries, 1000, seed);
    } else {
      const rng = createRng(seed);
      orderedEntries = shuffleArray(course.entries, rng);
    }

    // Generate start list entries
    for (let i = 0; i < orderedEntries.length; i++) {
      const entry = orderedEntries[i];
      const startTime = currentTimeMinutes + i * lane.interval;
      const startNumber = currentNumber + i;

      // Determine card note
      let cardNote = entry.cardNumber ? 'my card' : 'レンタル';
      if (entry.isRental) {
        cardNote = 'レンタル';
      }

      startList.push({
        className: course.name,
        startNumber,
        name1: entry.name1,
        name2: entry.name2,
        affiliation: entry.affiliation || '-',
        startTime: formatTime(startTime),
        cardNumber: entry.cardNumber,
        cardNote,
        joaNumber: entry.joaNumber,
        isRental: entry.isRental || !entry.cardNumber,
        lane: lane.name,
        startArea: startArea.name,
      });
    }

    // Update current time and number for next course
    currentTimeMinutes += orderedEntries.length * lane.interval;
    currentNumber += orderedEntries.length;
  }

  return startList;
}

/**
 * Generate complete start list
 */
export function generateStartList(
  courses: Course[],
  startAreas: StartArea[],
  entries: Entry[],
  constraints: Constraints,
  seed: number
): StartListEntry[] {
  const startList: StartListEntry[] = [];

  // Build courses with entries populated based on lane assignments
  const populatedCourses: Course[] = [];

  for (const area of startAreas) {
    for (const lane of area.lanes) {
      // Get course IDs assigned to this lane
      const assignedCourseIds = lane.courseIds;

      for (const courseId of assignedCourseIds) {
        const course = courses.find((c) => c.id === courseId);
        if (!course) continue;

        // Get entries for this course
        let courseEntries: Entry[];
        if (course.splitNumber) {
          // For split courses, we need to split the class entries
          const classEntries = entries.filter((e) => e.className === course.originalClass);
          const splitCount = courses.filter((c) => c.originalClass === course.originalClass).length;

          // Use empty rankings for now (ranking fetch not implemented in web version)
          const emptyRankings = new Map<string, number>();
          const groups = splitClassByRanking(classEntries, splitCount, emptyRankings, seed);

          courseEntries = groups[course.splitNumber - 1] || [];
        } else {
          courseEntries = entries.filter((e) => e.className === course.originalClass);
        }

        populatedCourses.push({
          ...course,
          entries: courseEntries,
          startAreaId: area.id,
          laneId: lane.id,
        });
      }
    }
  }

  for (const area of startAreas) {
    for (const lane of area.lanes) {
      // Get courses assigned to this lane
      const laneCourses = populatedCourses.filter(
        (c) => c.laneId === lane.id && c.startAreaId === area.id
      );

      if (laneCourses.length === 0) continue;

      const laneStartList = generateStartListForLane(
        laneCourses,
        lane,
        area,
        lane.affiliationSplit && constraints.avoidSameClubConsecutive,
        seed
      );

      startList.push(...laneStartList);
    }
  }

  // Sort by start time
  startList.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return startList;
}

/**
 * Check for conflicts in start list
 */
export function checkConflicts(
  startList: StartListEntry[],
  constraints: Constraints
): Conflict[] {
  const conflicts: Conflict[] = [];

  // Group entries by start time
  const byTime: Map<string, StartListEntry[]> = new Map();
  for (const entry of startList) {
    if (!byTime.has(entry.startTime)) {
      byTime.set(entry.startTime, []);
    }
    byTime.get(entry.startTime)!.push(entry);
  }

  // Check same-time club duplicates
  if (!constraints.allowSameTimeClubDuplicates) {
    for (const [time, entries] of byTime.entries()) {
      // Filter by scope if needed
      let filteredEntries = entries;
      if (constraints.sameTimeClubScope === 'selected') {
        filteredEntries = entries.filter(
          (e) => constraints.sameTimeClubSelectedAreas.includes(e.startArea)
        );
      }

      // Check for same-affiliation entries
      const affiliationGroups: Map<string, StartListEntry[]> = new Map();
      for (const entry of filteredEntries) {
        const affiliations = parseAffiliationsFromEntry(entry);
        for (const aff of affiliations) {
          if (!affiliationGroups.has(aff)) {
            affiliationGroups.set(aff, []);
          }
          affiliationGroups.get(aff)!.push(entry);
        }
      }

      for (const [aff, affEntries] of affiliationGroups.entries()) {
        if (affEntries.length > 1) {
          conflicts.push({
            type: 'same-time-club',
            entries: affEntries,
            startTime: time,
            message: `同じ時刻 (${time}) に同じ所属 (${aff}) の選手が複数います`,
          });
        }
      }
    }
  }

  // Check same-lane club duplicates
  if (constraints.allowSameLaneClubDuplicates !== 'allow') {
    const timeWindow = constraints.sameLaneClubTimeWindow;

    // Group entries by lane
    const byLane: Map<string, StartListEntry[]> = new Map();
    for (const entry of startList) {
      const key = `${entry.startArea}-${entry.lane}`;
      if (!byLane.has(key)) {
        byLane.set(key, []);
      }
      byLane.get(key)!.push(entry);
    }

    for (const [, laneEntries] of byLane.entries()) {
      // Filter by selected courses if needed
      let filteredEntries = laneEntries;
      if (constraints.allowSameLaneClubDuplicates === 'disallow-selected') {
        filteredEntries = laneEntries.filter(
          (e) => constraints.sameLaneClubSelectedCourses.includes(e.className)
        );
      }

      // Sort by start time
      filteredEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Check for same-affiliation entries within time window
      for (let i = 0; i < filteredEntries.length; i++) {
        const entry1 = filteredEntries[i];
        const time1 = parseTimeToMinutes(entry1.startTime.substring(0, 5));
        const affs1 = parseAffiliationsFromEntry(entry1);

        for (let j = i + 1; j < filteredEntries.length; j++) {
          const entry2 = filteredEntries[j];
          const time2 = parseTimeToMinutes(entry2.startTime.substring(0, 5));

          if (time2 - time1 > timeWindow) break;

          const affs2 = parseAffiliationsFromEntry(entry2);
          const commonAffs = affs1.filter((a) => affs2.includes(a));

          if (commonAffs.length > 0) {
            const existingConflict = conflicts.find(
              (c) =>
                c.type === 'same-lane-club' &&
                c.lane === entry1.lane &&
                c.entries.includes(entry1) &&
                c.entries.includes(entry2)
            );

            if (!existingConflict) {
              conflicts.push({
                type: 'same-lane-club',
                entries: [entry1, entry2],
                startTime: entry1.startTime,
                lane: entry1.lane,
                startArea: entry1.startArea,
                message: `同じレーン (${entry1.lane}) で ${timeWindow}分以内に同じ所属 (${commonAffs.join(', ')}) の選手がいます`,
              });
            }
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Parse affiliations from a start list entry
 */
function parseAffiliationsFromEntry(entry: StartListEntry): string[] {
  const aff = entry.affiliation;
  if (!aff || aff === '-') return [];

  return aff
    .split(/[/,、]/)
    .map((a) => a.replace(/\d+$/, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Calculate estimated end time for a lane
 */
export function calculateEndTime(
  lane: Lane,
  courses: Course[]
): string {
  const startMinutes = parseTimeToMinutes(lane.startTime);
  let totalEntries = 0;

  for (const courseId of lane.courseIds) {
    const course = courses.find((c) => c.id === courseId);
    if (course) {
      totalEntries += course.entries.length;
    }
  }

  const endMinutes = startMinutes + (totalEntries - 1) * lane.interval;
  return formatTime(endMinutes);
}

/**
 * Create courses from classes (with optional splitting)
 */
export function createCourses(
  entries: Entry[],
  classes: { name: string; shouldSplit: boolean; splitCount: number }[],
  seed: number
): Course[] {
  const courses: Course[] = [];
  let courseId = 0;

  // For now, use empty rankings (ranking fetch not implemented in web version)
  const emptyRankings = new Map<string, number>();

  for (const classInfo of classes) {
    const classEntries = entries.filter((e) => e.className === classInfo.name);

    if (classInfo.shouldSplit && classInfo.splitCount > 1) {
      // Split the class
      const groups = splitClassByRanking(
        classEntries,
        classInfo.splitCount,
        emptyRankings,
        seed
      );

      for (let i = 0; i < groups.length; i++) {
        const splitNumber = i + 1;
        courses.push({
          id: `course-${courseId++}`,
          name: `${classInfo.name}${splitNumber}`,
          originalClass: classInfo.name,
          splitNumber,
          entries: groups[i],
          assigned: false,
        });
      }
    } else {
      // No splitting
      courses.push({
        id: `course-${courseId++}`,
        name: classInfo.name,
        originalClass: classInfo.name,
        entries: classEntries,
        assigned: false,
      });
    }
  }

  return courses;
}
