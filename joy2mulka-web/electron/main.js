const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

// =============================================================================
// JOA Ranking URLs (from ranking_fetcher.py)
// =============================================================================
// Forest race rankings (Long/Middle distance)
const RANKING_URLS_FOREST = {
  'M': 'https://japan-o-entry.com/ranking/ranking/ranking_index/5/39',
  'W': 'https://japan-o-entry.com/ranking/ranking/ranking_index/5/46',
};

// Sprint race rankings
const RANKING_URLS_SPRINT = {
  'M': 'https://japan-o-entry.com/ranking/ranking/ranking_index/17/85',
  'W': 'https://japan-o-entry.com/ranking/ranking/ranking_index/17/86',
};

/**
 * Get ranking URL for a class based on race type
 * @param {string} baseClass - Base class name (e.g., "M21", "W21", "ME", "WE")
 * @param {string} raceType - Race type: "forest" or "sprint"
 * @returns {string|null} - Ranking URL or null if not available
 */
function getRankingUrl(baseClass, raceType = 'forest') {
  // Extract gender from class name (first character: M or W)
  const gender = baseClass.charAt(0).toUpperCase();
  if (gender !== 'M' && gender !== 'W') {
    return null;
  }

  const urls = raceType === 'sprint' ? RANKING_URLS_SPRINT : RANKING_URLS_FOREST;
  return urls[gender] || null;
}

// =============================================================================
// Utility Functions (matching ranking_fetcher.py)
// =============================================================================

/**
 * Normalize name for matching
 * Removes whitespace and converts to lowercase
 */
function normalizeName(name) {
  if (!name) return '';
  // Remove all types of whitespace (including Japanese full-width space)
  return name.replace(/[\s\u3000]+/g, '').toLowerCase();
}

/**
 * Extract base class from class name
 * e.g., "M21A" -> "M21", "M21E" -> "M21", "M21S" -> "M21"
 */
function extractBaseClass(className) {
  // Remove A, E, S and any following characters
  return className.replace(/[AES].*$/, '');
}

/**
 * Fetch HTML content from URL
 */
function fetchUrl(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptFetch = (attempt) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        rejectUnauthorized: false, // Handle certificate issues
        timeout: 30000,
      };

      https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Handle redirects
          attemptFetch(attempt);
          return;
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', (err) => {
          if (attempt < retries) {
            setTimeout(() => attemptFetch(attempt + 1), 2000);
          } else {
            reject(err);
          }
        });
      }).on('error', (err) => {
        if (attempt < retries) {
          setTimeout(() => attemptFetch(attempt + 1), 2000);
        } else {
          reject(err);
        }
      });
    };

    attemptFetch(1);
  });
}

/**
 * Parse ranking table from HTML
 * Looks for tables with ranking data (順位 and 氏名 columns)
 * Also extracts JOA numbers (登録番号) if available
 */
function parseRankingTable(html, includeJoaNumber = false) {
  const rankings = [];

  // Find all tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];

    // Check if this table has the ranking headers
    if (!tableContent.includes('順位') || !tableContent.includes('氏名')) {
      continue;
    }

    // Parse rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let headerIndices = null;

    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];

      // Parse cells
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const cells = [];
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Strip HTML tags and trim
        const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim();
        cells.push(cellText);
      }

      if (cells.length === 0) continue;

      // Check if this is a header row
      if (headerIndices === null) {
        const rankIdx = cells.findIndex(c => c === '順位');
        const nameIdx = cells.findIndex(c => c === '氏名');
        // JOA number column may be called 登録番号 or 競技者番号
        const joaIdx = cells.findIndex(c => c === '登録番号' || c === '競技者番号' || c === 'JOA番号');

        if (rankIdx !== -1 && nameIdx !== -1) {
          headerIndices = { rank: rankIdx, name: nameIdx, joa: joaIdx };
          continue;
        }
      }

      // Parse data row
      if (headerIndices && cells.length > Math.max(headerIndices.rank, headerIndices.name)) {
        const rankStr = cells[headerIndices.rank];
        const nameStr = cells[headerIndices.name];

        const rank = parseInt(rankStr, 10);
        if (!isNaN(rank) && nameStr) {
          const entry = { name: nameStr, rank };

          // Include JOA number if requested and available
          if (includeJoaNumber && headerIndices.joa !== -1 && cells[headerIndices.joa]) {
            entry.joaNumber = cells[headerIndices.joa];
          }

          rankings.push(entry);
        }
      }
    }

    // If we found rankings in this table, return them
    if (rankings.length > 0) {
      return rankings;
    }
  }

  return rankings;
}

/**
 * Fetch rankings for a specific class
 * @param {string} baseClass - Base class name (e.g., "M21", "W21")
 * @param {number} maxRank - Maximum rank to fetch (default 1000)
 * @param {string} raceType - Race type: "forest" or "sprint"
 * @param {boolean} includeJoaNumber - Whether to include JOA numbers
 */
async function fetchClassRankings(baseClass, maxRank = 1000, raceType = 'forest', includeJoaNumber = false) {
  const baseUrl = getRankingUrl(baseClass, raceType);
  if (!baseUrl) {
    console.log(`No ranking URL for class ${baseClass} (race type: ${raceType})`);
    return [];
  }

  const allRankings = [];

  // Calculate number of pages (50 entries per page)
  const pagesNeeded = Math.ceil(maxRank / 50);

  console.log(`Fetching rankings for ${baseClass} (${pagesNeeded} pages)...`);

  for (let page = 0; page < pagesNeeded; page++) {
    const url = page === 0 ? baseUrl : `${baseUrl}/${page}`;

    try {
      const html = await fetchUrl(url);
      const pageRankings = parseRankingTable(html, includeJoaNumber);

      for (const entry of pageRankings) {
        if (entry.rank <= maxRank) {
          allRankings.push(entry);
        }
      }

      // Be nice to the server
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`Warning: Failed to fetch page ${page}: ${err.message}`);
    }
  }

  console.log(`Retrieved ${allRankings.length} rankings for ${baseClass}`);
  return allRankings;
}

// JOA Registration lookup URL
const JOA_REGISTRY_URL = "https://japan-o-entry.com/joaregist/openlist";

/**
 * Parse JOA registration table from HTML
 * The openlist page has fixed columns:
 * Column 0: 競技者番号 (JOA number, e.g., "100-01-814")
 * Column 1: 氏名 (name)
 * Column 2: ふりがな
 * Column 3: 登録都道府県
 * etc.
 */
function parseJoaRegistryTable(html) {
  const registrations = [];

  // Find all tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];

    // Parse rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];

      // Parse cells (both th and td)
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const cells = [];
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Strip HTML tags and trim
        const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim();
        cells.push(cellText);
      }

      // Need at least 2 columns (JOA number and name)
      if (cells.length < 2) continue;

      const joaNumber = cells[0];
      const name = cells[1];

      // Skip header rows or invalid data
      // JOA numbers typically have format like "100-01-814" or similar numeric pattern
      if (!joaNumber || !name) continue;
      if (joaNumber === '競技者番号' || joaNumber === '登録番号' || joaNumber === '番号') continue;

      // Check if joaNumber looks like a valid JOA number (contains digits)
      if (!/\d/.test(joaNumber)) continue;

      registrations.push({ name, joaNumber });
    }

    // If we found registrations in this table, return them
    if (registrations.length > 0) {
      console.log(`Found ${registrations.length} registrations in table`);
      return registrations;
    }
  }

  return registrations;
}

/**
 * Fetch JOA registration data from openlist
 * Returns a map of normalized names to JOA numbers
 */
async function fetchJoaRegistry() {
  console.log('Fetching JOA registration data from openlist...');

  try {
    const html = await fetchUrl(JOA_REGISTRY_URL);
    const registrations = parseJoaRegistryTable(html);

    const joaMap = {};
    for (const { name, joaNumber } of registrations) {
      const normalizedName = normalizeName(name);
      if (normalizedName && joaNumber) {
        joaMap[normalizedName] = joaNumber;
      }
    }

    console.log(`Retrieved ${Object.keys(joaMap).length} JOA registrations`);
    return joaMap;
  } catch (err) {
    console.error('Error fetching JOA registry:', err);
    return {};
  }
}

/**
 * Fetch JOA numbers from openlist
 * Returns a single map of normalized names to JOA numbers (not per-class)
 */
async function fetchJoaNumbers() {
  return await fetchJoaRegistry();
}

// =============================================================================
// IPC Handlers
// =============================================================================

ipcMain.handle('fetch-rankings', async (event, baseClass, maxRank = 1000, raceType = 'forest') => {
  try {
    const rankings = await fetchClassRankings(baseClass, maxRank, raceType);
    return { rankings };
  } catch (err) {
    return { rankings: [], error: err.message };
  }
});

ipcMain.handle('fetch-multiple-rankings', async (event, baseClasses, maxRank = 1000, raceType = 'forest') => {
  const results = {};

  console.log(`Fetching rankings for race type: ${raceType}`);

  // Fetch all in sequence to be nice to the server
  for (const baseClass of baseClasses) {
    try {
      const rankings = await fetchClassRankings(baseClass, maxRank, raceType);
      results[baseClass] = rankings;
    } catch (err) {
      console.error(`Error fetching ${baseClass}:`, err);
      results[baseClass] = [];
    }
  }

  return results;
});

ipcMain.handle('fetch-joa-numbers', async () => {
  try {
    console.log('Fetching JOA numbers from openlist...');
    const joaNumbers = await fetchJoaNumbers();
    return { joaNumbers };
  } catch (err) {
    console.error('Error fetching JOA numbers:', err);
    return { joaNumbers: {}, error: err.message };
  }
});

// =============================================================================
// Window Creation
// =============================================================================

function createWindow() {
  console.log('Creating window...');

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'JOY2Mulka - スタートリスト生成ツール',
  });

  // Load the built app
  const indexPath = path.join(__dirname, '../dist/index.html');
  console.log('Loading:', indexPath);

  mainWindow.loadFile(indexPath)
    .then(() => {
      console.log('File loaded successfully');
    })
    .catch((err) => {
      console.error('Failed to load file:', err);
    });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
