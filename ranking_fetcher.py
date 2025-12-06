"""
Ranking Fetcher Module

Fetches competitor rankings from:
1. JOA Ranking pages (japan-o-entry.com/ranking)
2. JOA Registration open list (japan-o-entry.com/joaregist/openlist)

Used to:
- Sort competitors by ranking for class splits
- Look up registration numbers for competitor verification
"""

import re
import time
from typing import List, Dict, Any, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import ssl

# Try to import pandas for HTML table parsing
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    print("Warning: pandas not available. Ranking lookup disabled.")


# JOA Ranking URLs
RANKING_BASE_URLS = {
    'M21': "https://japan-o-entry.com/ranking/ranking/ranking_index/5/39",
    'W21': "https://japan-o-entry.com/ranking/ranking/ranking_index/5/40",
    'M20': "https://japan-o-entry.com/ranking/ranking/ranking_index/5/41",
    'W20': "https://japan-o-entry.com/ranking/ranking/ranking_index/5/42",
    # Add more class rankings as needed
}

# JOA Registration lookup URL
JOA_REGISTRY_URL = "https://japan-o-entry.com/joaregist/openlist"


def normalize_name(name: str) -> str:
    """
    Normalize name for matching.
    Removes spaces and converts to lowercase.
    """
    if not name:
        return ""
    # Remove all types of whitespace
    name = re.sub(r'[\s\u3000]+', '', name)
    # Convert to lowercase for comparison
    return name.lower()


def create_ssl_context():
    """Create SSL context that handles certificate issues."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_url(url: str, retries: int = 3) -> Optional[str]:
    """
    Fetch URL content with retry logic.
    Returns HTML content as string or None on failure.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    for attempt in range(retries):
        try:
            req = Request(url, headers=headers)
            ctx = create_ssl_context()
            with urlopen(req, context=ctx, timeout=30) as response:
                return response.read().decode('utf-8')
        except (URLError, HTTPError) as e:
            print(f"  Attempt {attempt + 1}/{retries} failed for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(2)
    return None


def pick_ranking_table(url: str) -> Optional['pd.DataFrame']:
    """
    Extract ranking table from JOA ranking page.
    Looks for tables with '順位' and '氏名' columns.
    """
    if not HAS_PANDAS:
        return None

    try:
        dfs = pd.read_html(url)
        for df in dfs:
            cols = set(map(str, df.columns))
            if {'順位', '氏名'}.issubset(cols):
                return df[['順位', '氏名']]
    except Exception as e:
        print(f"  Error parsing ranking table: {e}")
    return None


def fetch_class_rankings(base_class: str, max_rank: int = 1000) -> Dict[str, int]:
    """
    Fetch rankings for a specific class.

    Args:
        base_class: Base class name (e.g., "M21", "W20")
        max_rank: Maximum rank to fetch (default 1000)

    Returns:
        Dictionary mapping normalized names to ranks
    """
    if not HAS_PANDAS:
        print("  Pandas not available, skipping ranking fetch")
        return {}

    if base_class not in RANKING_BASE_URLS:
        print(f"  No ranking URL configured for class {base_class}")
        return {}

    base_url = RANKING_BASE_URLS[base_class]
    rankings = {}

    # Calculate number of pages (50 entries per page)
    pages_needed = (max_rank + 49) // 50

    print(f"  Fetching rankings for {base_class} ({pages_needed} pages)...")

    for page in range(pages_needed):
        url = base_url if page == 0 else f"{base_url}/{page}"

        try:
            df = pick_ranking_table(url)
            if df is not None:
                for _, row in df.iterrows():
                    try:
                        rank = int(row['順位'])
                        name = str(row['氏名'])
                        if rank <= max_rank:
                            normalized = normalize_name(name)
                            if normalized:
                                rankings[normalized] = rank
                    except (ValueError, KeyError):
                        continue
            time.sleep(0.5)  # Be nice to the server
        except Exception as e:
            print(f"  Warning: Failed to fetch page {page}: {e}")

    print(f"  Retrieved {len(rankings)} rankings for {base_class}")
    return rankings


def fetch_rankings(entries: List[Dict[str, Any]], target_class: str) -> Dict[str, int]:
    """
    Fetch rankings for entries in a specific class.

    Args:
        entries: List of entry dictionaries
        target_class: Class to fetch rankings for (e.g., "M21")

    Returns:
        Dictionary mapping entry names to their ranks
    """
    # Extract base class (e.g., "M21A" -> "M21")
    base_class = re.sub(r'[AES].*$', '', target_class)

    # Fetch rankings
    all_rankings = fetch_class_rankings(base_class)

    if not all_rankings:
        return {}

    # Match entries to rankings
    entry_rankings = {}
    for entry in entries:
        if not entry.get('class_name', '').startswith(target_class):
            continue

        # Try matching by name1 (kanji)
        name1_norm = normalize_name(entry.get('name1', ''))
        if name1_norm in all_rankings:
            entry_rankings[entry.get('name1', '')] = all_rankings[name1_norm]
            continue

        # Try matching by name2 (hiragana)
        name2_norm = normalize_name(entry.get('name2', ''))
        if name2_norm in all_rankings:
            entry_rankings[entry.get('name1', '')] = all_rankings[name2_norm]

    return entry_rankings


def fetch_joa_registry() -> Dict[str, Dict[str, str]]:
    """
    Fetch JOA registration data from open list.

    Returns:
        Dictionary mapping JOA numbers to registration info
    """
    if not HAS_PANDAS:
        return {}

    print("  Fetching JOA registration data...")

    try:
        dfs = pd.read_html(JOA_REGISTRY_URL)
        if not dfs:
            return {}

        # Find the registration table
        for df in dfs:
            cols = [str(c).lower() for c in df.columns]
            if '氏名' in cols or 'name' in cols:
                registry = {}
                for _, row in df.iterrows():
                    try:
                        joa_num = str(row.get('登録番号', row.get('番号', '')))
                        name = str(row.get('氏名', row.get('name', '')))
                        if joa_num and name:
                            registry[joa_num] = {
                                'name': name,
                                'joa_number': joa_num
                            }
                    except Exception:
                        continue
                return registry
    except Exception as e:
        print(f"  Error fetching JOA registry: {e}")

    return {}


def get_joa_registration(entries: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Look up JOA registration data for entries.

    Uses the JOA number from entries to look up registration info.

    Args:
        entries: List of entry dictionaries

    Returns:
        Dictionary mapping entry names to JOA registration data
    """
    # For now, just extract JOA numbers from entries
    # Full registry lookup can be enabled if needed
    joa_data = {}

    for entry in entries:
        joa_num = entry.get('joa_number', '')
        if joa_num:
            joa_data[entry.get('name1', '')] = {
                'joa_number': joa_num,
                'name': entry.get('name1', ''),
                'class': entry.get('class_name', '')
            }

    return joa_data


def lookup_entry_rank(entry: Dict[str, Any], rankings: Dict[str, int]) -> Optional[int]:
    """
    Look up rank for a specific entry.

    Args:
        entry: Entry dictionary
        rankings: Rankings dictionary (name -> rank)

    Returns:
        Rank if found, None otherwise
    """
    name1 = entry.get('name1', '')
    if name1 in rankings:
        return rankings[name1]

    # Try normalized matching
    name1_norm = normalize_name(name1)
    for name, rank in rankings.items():
        if normalize_name(name) == name1_norm:
            return rank

    return None


if __name__ == '__main__':
    # Test ranking fetch
    print("Testing ranking fetch for M21...")
    rankings = fetch_class_rankings('M21', max_rank=100)
    print(f"Top 10 rankings:")
    sorted_rankings = sorted(rankings.items(), key=lambda x: x[1])[:10]
    for name, rank in sorted_rankings:
        print(f"  {rank}: {name}")
