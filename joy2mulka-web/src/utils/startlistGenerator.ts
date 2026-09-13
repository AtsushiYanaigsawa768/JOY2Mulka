import { Entry, Course, StartArea, Lane, StartListEntry, Constraints, Conflict, PersonPositionConstraint, ProximityGroupConstraint } from '../types';

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
 * Does this entry match the target of a position constraint?
 * - targetType 'person'      : 氏名（name1 / name2）で照合
 * - targetType 'affiliation' : 所属で照合（所属の全員が対象になる）
 */
function matchesPositionTarget(entry: Entry, constraint: PersonPositionConstraint): boolean {
  const target = constraint.personName;
  if (!target) return false;

  if (constraint.targetType === 'affiliation') {
    const key = target.replace(/\d+$/, '').trim().toLowerCase();
    if (!key) return false;
    return getAffiliationsForCheck(entry).includes(key);
  }

  const norm = normalizeName(target);
  return normalizeName(entry.name1) === norm || normalizeName(entry.name2) === norm;
}

/**
 * Does this entry belong to a proximity group?
 */
function matchesProximityMember(entry: Entry, memberName: string): boolean {
  const norm = normalizeName(memberName);
  if (!norm) return false;
  return normalizeName(entry.name1) === norm || normalizeName(entry.name2) === norm;
}

/**
 * Apply position ("早め" / "遅め") and proximity ("近め") constraints to an
 * already-ordered list of entries.
 *
 * The ordering produced by the shuffle is treated as the baseline: only the
 * entries named by a constraint are moved, everyone else keeps their relative
 * order and simply slides into the remaining slots.
 *
 * - 'early'  : 先頭 20% の範囲に寄せる
 * - 'late'   : 末尾 20% の範囲に寄せる
 * - 所属指定 : その所属の全員が対象。互いに連続しないよう間隔を空けて配置する
 * - 近めグループ : メンバーを等間隔でまとめる。間隔は
 *   max(2 枠, minGapMinutes ぶんの枠数) なので、連続することはなく、
 *   指定した分数以内に 2 人が並ぶこともない
 *
 * 近めと早め／遅めは重複して指定できる。近めグループのメンバーに早め（遅め）が
 * 付いていれば、グループごと前半（後半）に寄せる。
 *
 * @param entries          - 並び替え済みのエントリー
 * @param constraints      - 早め／遅めの制約
 * @param proximityGroups  - 近めグループ
 * @param intervalMinutes  - スタート間隔（分）。近めの最小間隔を枠数に換算するのに使う
 */
export function applyOrderConstraints(
  entries: Entry[],
  constraints: PersonPositionConstraint[],
  proximityGroups: ProximityGroupConstraint[] = [],
  intervalMinutes: number = 1
): Entry[] {
  const total = entries.length;
  if (total === 0) return entries;
  if (constraints.length === 0 && proximityGroups.length === 0) return entries;

  const interval = intervalMinutes > 0 ? intervalMinutes : 1;

  // entry id -> 現在位置（近めグループの中心を決めるのに使う）
  const currentIndex = new Map<string, number>();
  entries.forEach((e, i) => currentIndex.set(e.id, i));

  const slotOf = new Map<string, number>();   // entry id -> 確定した枠
  const taken = new Set<number>();

  const reserve = (entry: Entry, slot: number) => {
    slotOf.set(entry.id, slot);
    taken.add(slot);
  };

  /** desired にいちばん近い空き枠を返す */
  const nearestFreeSlot = (desired: number): number => {
    const base = Math.min(Math.max(desired, 0), total - 1);
    for (let d = 0; d < total; d++) {
      if (base - d >= 0 && !taken.has(base - d)) return base - d;
      if (base + d < total && !taken.has(base + d)) return base + d;
    }
    return base;
  };

  /** n 人を gap 間隔で置ける先頭位置を、desired に近いところから探す */
  const findAnchor = (n: number, gap: number, desired: number): number | null => {
    const maxAnchor = total - 1 - (n - 1) * gap;
    if (maxAnchor < 0) return null;
    const base = Math.min(Math.max(desired, 0), maxAnchor);
    for (let d = 0; d <= total; d++) {
      for (const anchor of d === 0 ? [base] : [base - d, base + d]) {
        if (anchor < 0 || anchor > maxAnchor) continue;
        let ok = true;
        for (let i = 0; i < n; i++) {
          if (taken.has(anchor + i * gap)) { ok = false; break; }
        }
        if (ok) return anchor;
      }
    }
    return null;
  };

  const positionOf = (entry: Entry): 'early' | 'late' | null => {
    for (const c of constraints) {
      if (matchesPositionTarget(entry, c)) return c.position;
    }
    return null;
  };

  // --- 1. 近めグループを先に確定させる（いちばん制約が強いため） ---
  for (const group of proximityGroups) {
    const members = entries.filter(
      (e) => !slotOf.has(e.id) && group.members.some((m) => matchesProximityMember(e, m))
    );
    if (members.length < 2) continue;

    // 出走順を安定させるため、もとの並び順のまま配置する
    members.sort((a, b) => (currentIndex.get(a.id)! - currentIndex.get(b.id)!));

    // 連続禁止（2 枠以上）かつ、指定分数ぶんは必ず空ける
    const minGapSlots = Math.ceil((group.minGapMinutes || 0) / interval);
    let gap = Math.max(2, minGapSlots);
    // 人数が多すぎて収まらない場合は間隔を詰める（ただし連続はさせない）
    while (gap > 2 && (members.length - 1) * gap > total - 1) gap--;

    // グループの中心をどこに置くか
    const memberPositions = members.map((m) => positionOf(m));
    const span = (members.length - 1) * gap;
    let desired: number;
    if (memberPositions.includes('early')) {
      desired = 0;
    } else if (memberPositions.includes('late')) {
      desired = total - 1 - span;
    } else {
      const median = members[Math.floor(members.length / 2)];
      desired = currentIndex.get(median.id)! - Math.floor(span / 2);
    }

    const anchor = findAnchor(members.length, gap, desired);
    if (anchor === null) {
      // 収まらないときは 1 人ずつ近い空き枠に置く（連続だけは避ける）
      let cursor = Math.max(desired, 0);
      for (const m of members) {
        const slot = nearestFreeSlot(cursor);
        reserve(m, slot);
        cursor = slot + gap;
      }
    } else {
      members.forEach((m, i) => reserve(m, anchor + i * gap));
    }
  }

  // --- 2. 早め／遅めを確定させる ---
  const early: Entry[] = [];
  const late: Entry[] = [];
  for (const entry of entries) {
    if (slotOf.has(entry.id)) continue;   // 近めグループで確定済み
    const pos = positionOf(entry);
    if (pos === 'early') early.push(entry);
    else if (pos === 'late') late.push(entry);
  }

  // 基本は前後 20% に寄せる。ただし所属ごとの指定で人数が多いときは、
  // 連続させないために必要なだけ範囲を広げる（2 枠おきに置ける幅を確保する）
  const earlyBoundary = Math.min(
    Math.max(Math.floor(total * 0.2), early.length * 2) - 1,
    total - 1
  );
  const lateBoundary = Math.max(
    total - Math.max(Math.floor(total * 0.2), late.length * 2),
    0
  );

  early.forEach((entry, i) => {
    reserve(entry, nearestFreeSlot(Math.min(i * 2, Math.max(earlyBoundary, 0))));
  });
  late.forEach((entry, i) => {
    reserve(entry, nearestFreeSlot(Math.max(total - 1 - i * 2, lateBoundary)));
  });

  if (slotOf.size === 0) return entries;

  // --- 3. 残りの人を、もとの順番のまま空き枠に流し込む ---
  const placed: (Entry | null)[] = new Array(total).fill(null);
  for (const entry of entries) {
    const slot = slotOf.get(entry.id);
    if (slot !== undefined) placed[slot] = entry;
  }
  const rest = entries.filter((e) => !slotOf.has(e.id));
  let restIdx = 0;
  for (let i = 0; i < total; i++) {
    if (placed[i] === null) placed[i] = rest[restIdx++];
  }

  return placed.filter((e): e is Entry => e !== null);
}

/**
 * 旧 API 互換のラッパー（早め／遅めのみ）
 */
export function applyPersonPositionConstraints(
  entries: Entry[],
  constraints: PersonPositionConstraint[]
): Entry[] {
  return applyOrderConstraints(entries, constraints, [], 1);
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
 * ゼッケン番号（スタートナンバー）の番号帯を求める。
 *
 * テキストブックの桁設計に合わせる:
 *
 *   [コース／クラス群 1 桁][レーン 1 桁][レーン内の連番 2 桁]  = 4 桁
 *
 * 番号帯はレーンごとに与える。レーン設定に「開始ナンバー」があればそれを使い、
 * 無ければ 1100, 1200, 1300 … と 100 番刻みで自動採番する。
 *
 * 同じレーン（＝同じコース）の出走者が 100 人以上いると連番が 2 桁に収まらないので、
 * そのときは番号帯を 10 倍して連番を 3 桁にし、ゼッケンを 5 桁にする。
 *
 * @param lane - レーン設定
 * @param globalLaneNumber - 全スタートエリアを通したレーン番号（1 始まり）
 * @param wide - 連番を 3 桁にする（レーンの人数が 100 人以上）
 */
function laneNumberBase(lane: Lane, globalLaneNumber: number, wide: boolean): number {
  const base =
    lane.startNumber && lane.startNumber > 0
      ? lane.startNumber
      : 1000 + globalLaneNumber * 100;
  return wide ? base * 10 : base;
}

/**
 * Generate start list for a single lane
 *
 * @param courses - Courses assigned to this lane
 * @param lane - Lane configuration
 * @param startArea - Start area this lane belongs to
 * @param affiliationSplit - Whether to avoid consecutive same-affiliation entries
 * @param seed - Random seed for reproducibility
 * @param personPositionConstraints - Person position constraints (early/late)
 * @param globalLaneNumber - Global lane number (1-indexed, across all start areas)
 * @param proximityGroups - Proximity ("近め") group constraints
 */
export function generateStartListForLane(
  courses: Course[],
  lane: Lane,
  startArea: StartArea,
  affiliationSplit: boolean,
  seed: number,
  personPositionConstraints: PersonPositionConstraint[] = [],
  globalLaneNumber: number = 1,
  proximityGroups: ProximityGroupConstraint[] = []
): StartListEntry[] {
  const startList: StartListEntry[] = [];
  let currentTimeMinutes = parseTimeToMinutes(lane.startTime);

  // Get inter-course gap (default to 0 if not set)
  const interCourseGap = lane.interCourseGap ?? 0;

  // Sort courses by order
  const sortedCourses = [...courses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // ゼッケンの番号帯。レーンの出走者が 100 人以上なら連番を 3 桁（＝5 桁のゼッケン）にする
  const laneTotal = sortedCourses.reduce((sum, c) => sum + c.entries.length, 0);
  const numberBase = laneNumberBase(lane, globalLaneNumber, laneTotal >= 100);
  let seqInLane = 0;

  for (let courseIdx = 0; courseIdx < sortedCourses.length; courseIdx++) {
    const course = sortedCourses[courseIdx];

    // Order entries
    let orderedEntries: Entry[];
    if (affiliationSplit) {
      orderedEntries = shuffleAvoidingConsecutiveAffiliations(course.entries, 1000, seed);
    } else {
      const rng = createRng(seed);
      orderedEntries = shuffleArray(course.entries, rng);
    }

    // Apply position ("早め"/"遅め") and proximity ("近め") constraints
    orderedEntries = applyOrderConstraints(
      orderedEntries,
      personPositionConstraints,
      proximityGroups,
      lane.interval
    );

    // Generate start list entries
    for (let i = 0; i < orderedEntries.length; i++) {
      const entry = orderedEntries[i];
      const startTimeMinutes = currentTimeMinutes + i * lane.interval;

      // ゼッケン番号 = レーンの番号帯 + レーン内の連番
      seqInLane++;
      const startNumber = numberBase + seqInLane;

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
        startTime: formatTime(startTimeMinutes),
        cardNumber: entry.cardNumber,
        cardNote,
        joaNumber: entry.joaNumber,
        isRental: entry.isRental || !entry.cardNumber,
        lane: lane.name,
        startArea: startArea.name,
      });
    }

    // Update current time for next course
    currentTimeMinutes += orderedEntries.length * lane.interval;

    // Add inter-course gap (except for the last course)
    if (courseIdx < sortedCourses.length - 1 && interCourseGap > 0) {
      currentTimeMinutes += interCourseGap;
    }
  }

  return startList;
}

/**
 * Generate complete start list
 *
 * @param courses - Course definitions
 * @param startAreas - Start area configurations
 * @param entries - All entries
 * @param constraints - Constraints including useRankingForSplit
 * @param seed - Random seed for reproducibility
 * @param rankings - Rankings map (baseClass -> normalizedName -> rank)
 * @param personPositionConstraints - Person position constraints (early/late)
 * @param proximityGroups - Proximity ("近め") group constraints
 */
export function generateStartList(
  courses: Course[],
  startAreas: StartArea[],
  entries: Entry[],
  constraints: Constraints,
  seed: number,
  rankings: Map<string, Map<string, number>> = new Map(),
  personPositionConstraints: PersonPositionConstraint[] = [],
  proximityGroups: ProximityGroupConstraint[] = []
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

          // Use rankings if enabled for this class (from ranking_fetcher.py spec)
          // Extract base class: "M21A" -> "M21"
          const baseClass = course.originalClass.replace(/[AES].*$/i, '');
          const useRanking = constraints.useRankingForSplit[course.originalClass] ?? false;
          const classRankings = useRanking ? (rankings.get(baseClass) || new Map()) : new Map();

          const groups = splitClassByRanking(classEntries, splitCount, classRankings, seed);
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

  // Calculate global lane numbers (1-indexed, across all start areas)
  // Global lane number = (sum of lanes in previous areas) + (lane index within current area + 1)
  let globalLaneCounter = 0;
  const laneToGlobalNumber: Map<string, number> = new Map();

  for (const area of startAreas) {
    for (let laneIdx = 0; laneIdx < area.lanes.length; laneIdx++) {
      globalLaneCounter++;
      laneToGlobalNumber.set(area.lanes[laneIdx].id, globalLaneCounter);
    }
  }

  for (const area of startAreas) {
    for (const lane of area.lanes) {
      // Get courses assigned to this lane
      const laneCourses = populatedCourses.filter(
        (c) => c.laneId === lane.id && c.startAreaId === area.id
      );

      if (laneCourses.length === 0) continue;

      // Get global lane number for this lane
      const globalLaneNumber = laneToGlobalNumber.get(lane.id) || 1;

      const laneStartList = generateStartListForLane(
        laneCourses,
        lane,
        area,
        lane.affiliationSplit && constraints.avoidSameClubConsecutive,
        seed,
        personPositionConstraints,
        globalLaneNumber,
        proximityGroups
      );

      startList.push(...laneStartList);
    }
  }

  // Sort by start time
  startList.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return startList;
}

/**
 * Generate a start list for 練習会 (practice) mode.
 *
 * No start times are assigned: entries keep the order they appeared in the
 * uploaded entry list, and are simply grouped class by class.
 *
 * @param courses - Course definitions (from Step 1; splits are honoured)
 * @param entries - All entries, in input order
 * @param generateStartNumbers - When false, no bib numbers are assigned
 */
export function generatePracticeStartList(
  courses: Course[],
  entries: Entry[],
  generateStartNumbers: boolean
): StartListEntry[] {
  const startList: StartListEntry[] = [];

  // Keep class order stable and predictable
  const sortedCourses = [...courses].sort((a, b) => a.name.localeCompare(b.name));

  let bib = 1;
  for (const course of sortedCourses) {
    // Entries in the order they were read from the entry list
    const courseEntries =
      course.entries.length > 0
        ? entries.filter((e) => course.entries.some((ce) => ce.id === e.id))
        : entries.filter((e) => e.className === course.originalClass);

    for (const entry of courseEntries) {
      startList.push({
        className: course.name,
        startNumber: generateStartNumbers ? bib++ : 0,
        name1: entry.name1,
        name2: entry.name2,
        affiliation: entry.affiliation || '-',
        startTime: '',
        cardNumber: entry.cardNumber,
        cardNote: entry.isRental || !entry.cardNumber ? 'レンタル' : 'my card',
        joaNumber: entry.joaNumber,
        isRental: entry.isRental || !entry.cardNumber,
        lane: '',
        startArea: '',
      });
    }
  }

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
 *
 * @param entries - All entries
 * @param classes - Class definitions with split settings
 * @param seed - Random seed for reproducibility
 * @param rankings - Rankings map (baseClass -> normalizedName -> rank)
 * @param useRankingForSplit - Map of className -> whether to use ranking
 */
export function createCourses(
  entries: Entry[],
  classes: { name: string; shouldSplit: boolean; splitCount: number }[],
  seed: number,
  rankings: Map<string, Map<string, number>> = new Map(),
  useRankingForSplit: Record<string, boolean> = {}
): Course[] {
  const courses: Course[] = [];
  let courseId = 0;

  for (const classInfo of classes) {
    const classEntries = entries.filter((e) => e.className === classInfo.name);

    if (classInfo.shouldSplit && classInfo.splitCount > 1) {
      // Use rankings if enabled for this class (from ranking_fetcher.py spec)
      // Extract base class: "M21A" -> "M21"
      const baseClass = classInfo.name.replace(/[AES].*$/i, '');
      const useRanking = useRankingForSplit[classInfo.name] ?? false;
      const classRankings = useRanking ? (rankings.get(baseClass) || new Map()) : new Map();

      // Split the class
      const groups = splitClassByRanking(
        classEntries,
        classInfo.splitCount,
        classRankings,
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
