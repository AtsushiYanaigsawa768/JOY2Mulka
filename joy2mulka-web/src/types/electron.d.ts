/**
 * TypeScript declarations for Electron API exposed via preload.js
 */

export type RaceType = 'forest' | 'sprint';

export interface RankingData {
  name: string;
  rank: number;
}

export interface FetchRankingsResult {
  rankings: RankingData[];
  error?: string;
}

export interface FetchJoaNumbersResult {
  joaNumbers: Record<string, string>;  // normalizedName -> joaNumber
  error?: string;
}

export interface ElectronAPI {
  /**
   * Fetch rankings from JOA for a specific class
   * @param baseClass - Base class name (e.g., "M21", "W21")
   * @param maxRank - Maximum rank to fetch (default 1000)
   * @param raceType - Race type: "forest" or "sprint" (default "forest")
   */
  fetchRankings: (
    baseClass: string,
    maxRank?: number,
    raceType?: RaceType
  ) => Promise<FetchRankingsResult>;

  /**
   * Fetch rankings for multiple classes in parallel
   * @param baseClasses - Array of base class names
   * @param maxRank - Maximum rank to fetch (default 1000)
   * @param raceType - Race type: "forest" or "sprint" (default "forest")
   */
  fetchMultipleRankings: (
    baseClasses: string[],
    maxRank?: number,
    raceType?: RaceType
  ) => Promise<Record<string, RankingData[]>>;

  /**
   * Fetch JOA competitor numbers from openlist
   */
  fetchJoaNumbers: () => Promise<FetchJoaNumbersResult>;

  /**
   * Check if running in Electron environment
   */
  isElectron: () => boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
