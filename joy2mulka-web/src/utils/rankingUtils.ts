/**
 * Ranking Utilities
 *
 * Functions for fetching and matching JOA rankings.
 * Follows specifications from ranking_fetcher.py
 */

import { Entry, RaceType } from '../types';
import '../types/electron.d.ts';

/**
 * Normalize name for matching
 * Removes whitespace and converts to lowercase
 * Matches: ranking_fetcher.py -> normalize_name()
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  // Remove all types of whitespace (including Japanese full-width space)
  return name.replace(/[\s\u3000]+/g, '').toLowerCase();
}

/**
 * Extract base class from class name
 * e.g., "M21A" -> "M21", "M21E" -> "M21", "M21S" -> "M21"
 * Matches: ranking_fetcher.py -> re.sub(r'[AES].*$', '', target_class)
 */
export function extractBaseClass(className: string): string {
  // Remove A, E, S and any following characters
  return className.replace(/[AES].*$/i, '');
}

/**
 * Check if running in Electron environment with API available
 */
export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron?.();
}

/**
 * Fetch rankings for a specific base class from JOA
 * Returns a Map of normalized names to ranks
 * @param baseClass - Base class name (e.g., "M21", "W21")
 * @param maxRank - Maximum rank to fetch (default 1000)
 * @param raceType - Race type: "forest" or "sprint" (default "forest")
 */
export async function fetchRankingsForClass(
  baseClass: string,
  maxRank: number = 1000,
  raceType: RaceType = 'forest'
): Promise<Map<string, number>> {
  const rankings = new Map<string, number>();

  if (!isElectronAvailable()) {
    console.warn('Ranking fetch requires Electron environment');
    return rankings;
  }

  try {
    const result = await window.electronAPI!.fetchRankings(baseClass, maxRank, raceType);

    if (result.error) {
      console.error(`Error fetching rankings for ${baseClass}:`, result.error);
      return rankings;
    }

    for (const { name, rank } of result.rankings) {
      const normalizedName = normalizeName(name);
      if (normalizedName) {
        rankings.set(normalizedName, rank);
      }
    }
  } catch (err) {
    console.error(`Error fetching rankings for ${baseClass}:`, err);
  }

  return rankings;
}

/**
 * Fetch rankings for multiple classes
 * Returns a Map of baseClass -> (normalizedName -> rank)
 * @param baseClasses - Array of base class names
 * @param maxRank - Maximum rank to fetch (default 1000)
 * @param raceType - Race type: "forest" or "sprint" (default "forest")
 */
export async function fetchRankingsForClasses(
  baseClasses: string[],
  maxRank: number = 1000,
  raceType: RaceType = 'forest'
): Promise<Map<string, Map<string, number>>> {
  const allRankings = new Map<string, Map<string, number>>();

  if (!isElectronAvailable()) {
    console.warn('Ranking fetch requires Electron environment');
    return allRankings;
  }

  // Remove duplicates
  const uniqueClasses = [...new Set(baseClasses)];

  try {
    const results = await window.electronAPI!.fetchMultipleRankings(uniqueClasses, maxRank, raceType);

    for (const [baseClass, rankingList] of Object.entries(results)) {
      const classRankings = new Map<string, number>();
      for (const { name, rank } of rankingList) {
        const normalizedName = normalizeName(name);
        if (normalizedName) {
          classRankings.set(normalizedName, rank);
        }
      }
      allRankings.set(baseClass, classRankings);
    }
  } catch (err) {
    console.error('Error fetching multiple rankings:', err);
  }

  return allRankings;
}

/**
 * Look up ranking for an entry
 * Matches: ranking_fetcher.py -> lookup_entry_rank()
 */
export function lookupEntryRank(
  entry: Entry,
  rankings: Map<string, number>
): number | null {
  // Try name1 (kanji name) first
  const name1Norm = normalizeName(entry.name1);
  if (name1Norm && rankings.has(name1Norm)) {
    return rankings.get(name1Norm)!;
  }

  // Try name2 (hiragana/katakana name)
  const name2Norm = normalizeName(entry.name2);
  if (name2Norm && rankings.has(name2Norm)) {
    return rankings.get(name2Norm)!;
  }

  return null;
}

/**
 * Match entries to rankings and return a map of entry ID to rank
 */
export function matchEntriesToRankings(
  entries: Entry[],
  rankings: Map<string, number>
): Map<string, number> {
  const entryRanks = new Map<string, number>();

  for (const entry of entries) {
    const rank = lookupEntryRank(entry, rankings);
    if (rank !== null) {
      entryRanks.set(entry.id, rank);
    }
  }

  return entryRanks;
}

/**
 * Get unique base classes from a list of class names
 */
export function getUniqueBaseClasses(classNames: string[]): string[] {
  const baseClasses = new Set<string>();
  for (const className of classNames) {
    const baseClass = extractBaseClass(className);
    if (baseClass) {
      baseClasses.add(baseClass);
    }
  }
  return [...baseClasses];
}

/**
 * Check if a base class has rankings available
 * Rankings are available for any class starting with M or W
 */
export function hasRankingsAvailable(baseClass: string): boolean {
  const gender = baseClass.charAt(0).toUpperCase();
  return gender === 'M' || gender === 'W';
}

/**
 * Get available genders for ranking fetch
 */
export const AVAILABLE_RANKING_GENDERS = ['M', 'W'];

/**
 * Fetch JOA numbers from openlist
 * Returns a map: normalizedName -> joaNumber
 */
export async function fetchJoaNumbersFromOpenlist(): Promise<Map<string, string>> {
  const joaNumbers = new Map<string, string>();

  if (!isElectronAvailable()) {
    console.warn('JOA number fetch requires Electron environment');
    return joaNumbers;
  }

  try {
    const result = await window.electronAPI!.fetchJoaNumbers();

    if (result.error) {
      console.error('Error fetching JOA numbers:', result.error);
      return joaNumbers;
    }

    for (const [normalizedName, joaNumber] of Object.entries(result.joaNumbers)) {
      if (normalizedName && joaNumber) {
        joaNumbers.set(normalizedName, joaNumber);
      }
    }
  } catch (err) {
    console.error('Error fetching JOA numbers:', err);
  }

  return joaNumbers;
}

/**
 * Look up JOA number for an entry
 */
export function lookupEntryJoaNumber(
  entry: Entry,
  joaNumbers: Map<string, string>
): string | null {
  // Try name1 (kanji name) first
  const name1Norm = normalizeName(entry.name1);
  if (name1Norm && joaNumbers.has(name1Norm)) {
    return joaNumbers.get(name1Norm)!;
  }

  // Try name2 (hiragana/katakana name)
  const name2Norm = normalizeName(entry.name2);
  if (name2Norm && joaNumbers.has(name2Norm)) {
    return joaNumbers.get(name2Norm)!;
  }

  return null;
}
