const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose protected methods that allow the renderer process to
 * communicate with the main process via IPC.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Fetch rankings from JOA for a specific class
   * @param {string} baseClass - Base class name (e.g., "M21", "W21")
   * @param {number} maxRank - Maximum rank to fetch (default 1000)
   * @param {string} raceType - Race type: "forest" or "sprint" (default "forest")
   * @returns {Promise<{rankings: Array<{name: string, rank: number}>, error?: string}>}
   */
  fetchRankings: (baseClass, maxRank = 1000, raceType = 'forest') => {
    return ipcRenderer.invoke('fetch-rankings', baseClass, maxRank, raceType);
  },

  /**
   * Fetch rankings for multiple classes in parallel
   * @param {string[]} baseClasses - Array of base class names
   * @param {number} maxRank - Maximum rank to fetch
   * @param {string} raceType - Race type: "forest" or "sprint" (default "forest")
   * @returns {Promise<{[className: string]: Array<{name: string, rank: number}>}>}
   */
  fetchMultipleRankings: (baseClasses, maxRank = 1000, raceType = 'forest') => {
    return ipcRenderer.invoke('fetch-multiple-rankings', baseClasses, maxRank, raceType);
  },

  /**
   * Fetch JOA competitor numbers from openlist
   * @returns {Promise<{joaNumbers: {[normalizedName: string]: string}, error?: string}>}
   */
  fetchJoaNumbers: () => {
    return ipcRenderer.invoke('fetch-joa-numbers');
  },

  /**
   * Check if running in Electron environment
   * @returns {boolean}
   */
  isElectron: () => true,
});
