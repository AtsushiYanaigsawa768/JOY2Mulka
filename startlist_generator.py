"""
Startlist Generator Module

Generates startlists with:
- Class splits (e.g., M21 -> M21A1, M21A2) using ranking-based distribution
- Consecutive affiliation splitting to prevent same-club runners back-to-back
- Random assignment for unranked players
- Configurable start times, intervals, and start numbers
"""

import random
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from ranking_fetcher import lookup_entry_rank


def parse_time(time_str: str) -> datetime:
    """Parse time string to datetime object."""
    # Try common formats
    formats = ['%H:%M', '%H:%M:%S', '%H;%M', '%H;%M;%S']
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse time: {time_str}")


def format_time(dt: datetime) -> str:
    """Format datetime to HH:MM:SS string."""
    return dt.strftime('%H:%M:%S')


def get_effective_config(
    class_name: str,
    lane_config: Dict[str, Any],
    class_overrides: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Get effective configuration for a class, applying any overrides.

    Priority: class_overrides > lane_config
    """
    config = {
        'start_time': lane_config['start_time'],
        'start_number': lane_config['start_number'],
        'interval': lane_config.get('interval', 1),
        'affiliation_split': lane_config.get('affiliation_split', True)
    }

    # Apply class-specific overrides
    if class_name in class_overrides:
        override = class_overrides[class_name]
        if 'start_time' in override:
            config['start_time'] = override['start_time']
        if 'start_number' in override:
            config['start_number'] = override['start_number']
        if 'interval' in override:
            config['interval'] = override['interval']
        if 'affiliation_split' in override:
            config['affiliation_split'] = override['affiliation_split']

    return config


def split_class_by_ranking(
    entries: List[Dict[str, Any]],
    split_count: int,
    rankings: Dict[str, int],
    seed: Optional[int] = None
) -> List[List[Dict[str, Any]]]:
    """
    Split entries into groups based on ranking.

    Ranked entries are distributed using modulo:
    - Rank 1 -> Group 1, Rank 2 -> Group 2, etc.

    Unranked entries are distributed randomly to balance group sizes.

    Args:
        entries: List of entries to split
        split_count: Number of groups to create
        rankings: Dictionary mapping names to ranks
        seed: Random seed for reproducibility

    Returns:
        List of lists, each containing entries for one group
    """
    if seed is not None:
        random.seed(seed)

    # Separate ranked and unranked entries
    ranked_entries = []
    unranked_entries = []

    for entry in entries:
        rank = lookup_entry_rank(entry, rankings)
        if rank is not None:
            ranked_entries.append((rank, entry))
        else:
            unranked_entries.append(entry)

    # Sort ranked entries by rank
    ranked_entries.sort(key=lambda x: x[0])

    # Create groups
    groups = [[] for _ in range(split_count)]

    # Distribute ranked entries by modulo
    for i, (rank, entry) in enumerate(ranked_entries):
        # Reconstruct internal rank (1, 2, 3, ...)
        internal_rank = i + 1
        group_idx = (internal_rank - 1) % split_count
        groups[group_idx].append(entry)

    # Shuffle unranked entries
    random.shuffle(unranked_entries)

    # Distribute unranked entries to balance group sizes
    group_sizes = [len(g) for g in groups]
    for entry in unranked_entries:
        # Find smallest group
        min_idx = group_sizes.index(min(group_sizes))
        groups[min_idx].append(entry)
        group_sizes[min_idx] += 1

    return groups


def split_affiliations_for_check(entry: Dict[str, Any]) -> List[str]:
    """
    Get affiliations for checking consecutive runners.
    Drops numeric suffixes from affiliations.
    """
    affiliations = entry.get('affiliations', [])
    if not affiliations:
        aff = entry.get('affiliation', '')
        if aff and aff != '-':
            affiliations = [aff]

    # Remove numeric suffixes
    result = []
    for aff in affiliations:
        aff_clean = re.sub(r'\d+$', '', aff).strip()
        if aff_clean:
            result.append(aff_clean.lower())

    return result


def has_affiliation_overlap(entry1: Dict[str, Any], entry2: Dict[str, Any]) -> bool:
    """
    Check if two entries have overlapping affiliations.
    """
    affs1 = set(split_affiliations_for_check(entry1))
    affs2 = set(split_affiliations_for_check(entry2))

    if not affs1 or not affs2:
        return False

    return bool(affs1 & affs2)


def shuffle_avoiding_consecutive_affiliations(
    entries: List[Dict[str, Any]],
    max_attempts: int = 1000,
    seed: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Shuffle entries to avoid consecutive same-affiliation runners.

    Uses a greedy algorithm with backtracking:
    1. Start with shuffled list
    2. Try to find valid ordering
    3. If stuck, reshuffle and retry

    Args:
        entries: List of entries to shuffle
        max_attempts: Maximum shuffle attempts
        seed: Random seed for reproducibility

    Returns:
        Shuffled list with minimal consecutive affiliations
    """
    if len(entries) <= 1:
        return entries

    if seed is not None:
        random.seed(seed)

    best_result = entries.copy()
    best_conflicts = count_consecutive_conflicts(entries)

    for attempt in range(max_attempts):
        # Shuffle entries
        shuffled = entries.copy()
        random.shuffle(shuffled)

        # Try greedy ordering
        result = greedy_order_by_affiliation(shuffled)
        conflicts = count_consecutive_conflicts(result)

        if conflicts < best_conflicts:
            best_result = result
            best_conflicts = conflicts

        if conflicts == 0:
            break

    if best_conflicts > 0:
        print(f"  Warning: Could not eliminate all consecutive affiliations "
              f"({best_conflicts} conflicts remain)")

    return best_result


def greedy_order_by_affiliation(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Greedy algorithm to order entries avoiding consecutive affiliations.
    """
    if len(entries) <= 1:
        return entries

    remaining = entries.copy()
    result = [remaining.pop(0)]

    while remaining:
        # Find an entry that doesn't conflict with the last one
        found = False
        for i, entry in enumerate(remaining):
            if not has_affiliation_overlap(result[-1], entry):
                result.append(remaining.pop(i))
                found = True
                break

        if not found:
            # No non-conflicting entry, just add the first one
            result.append(remaining.pop(0))

    return result


def count_consecutive_conflicts(entries: List[Dict[str, Any]]) -> int:
    """Count number of consecutive same-affiliation pairs."""
    conflicts = 0
    for i in range(len(entries) - 1):
        if has_affiliation_overlap(entries[i], entries[i + 1]):
            conflicts += 1
    return conflicts


def generate_startlist_for_class(
    entries: List[Dict[str, Any]],
    class_name: str,
    config: Dict[str, Any],
    seed: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Generate startlist entries for a single class.

    Args:
        entries: List of entries for this class
        class_name: Name of the class
        config: Configuration for this class
        seed: Random seed for reproducibility

    Returns:
        List of startlist entries with assigned start times and numbers
    """
    if not entries:
        return []

    # Shuffle avoiding consecutive affiliations if enabled
    if config.get('affiliation_split', True):
        ordered = shuffle_avoiding_consecutive_affiliations(entries, seed=seed)
    else:
        ordered = entries.copy()
        if seed is not None:
            random.seed(seed)
        random.shuffle(ordered)

    # Assign start times and numbers
    start_time = parse_time(config['start_time'])
    start_number = int(config['start_number'])
    interval = int(config.get('interval', 1))

    startlist = []
    for i, entry in enumerate(ordered):
        entry_time = start_time + timedelta(minutes=i * interval)
        entry_number = start_number + i

        startlist_entry = {
            'class_name': class_name,
            'start_number': entry_number,
            'name1': entry.get('name1', ''),
            'name2': entry.get('name2', ''),
            'affiliation': entry.get('affiliation', ''),
            'start_time': format_time(entry_time),
            'card_number': entry.get('card_number', ''),
            'is_rental': entry.get('is_rental', False),
            'joa_number': entry.get('joa_number', ''),
            'gender': entry.get('gender', '')
        }
        startlist.append(startlist_entry)

    return startlist


def generate_startlist(
    entries: List[Dict[str, Any]],
    lane_config: Dict[str, Any],
    class_overrides: Dict[str, Dict[str, Any]],
    splits_config: Dict[str, Dict[str, Any]],
    rankings: Dict[str, Dict[str, int]],
    joa_data: Dict[str, Dict[str, Any]],
    seed: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Generate complete startlist for a lane.

    Args:
        entries: All entries
        lane_config: Configuration for this lane
        class_overrides: Per-class configuration overrides
        splits_config: Configuration for class splits
        rankings: Rankings data by class
        joa_data: JOA registration data
        seed: Random seed for reproducibility

    Returns:
        Complete startlist for the lane
    """
    startlist = []
    classes = lane_config.get('classes', [])

    # Track current start time and number for auto-incrementing
    current_time = parse_time(lane_config['start_time'])
    current_number = int(lane_config['start_number'])

    for class_name in classes:
        # Check if this class needs splitting
        base_class = re.sub(r'[AES].*$', '', class_name)

        if base_class in splits_config:
            split_cfg = splits_config[base_class]
            split_count = split_cfg.get('count', 2)
            suffix_format = split_cfg.get('suffix_format', 'A{}')
            use_ranking = split_cfg.get('use_ranking', True)

            # Get entries for this class
            class_entries = [e for e in entries if e.get('class_name', '') == class_name]

            if not class_entries:
                continue

            # Split by ranking
            class_rankings = rankings.get(base_class, {})
            groups = split_class_by_ranking(
                class_entries, split_count, class_rankings, seed
            )

            # Generate startlist for each split
            for group_num, group_entries in enumerate(groups, start=1):
                split_class_name = f"{class_name}{suffix_format.format(group_num)}"

                # Get config for this split class
                config = get_effective_config(split_class_name, lane_config, class_overrides)
                config['start_time'] = format_time(current_time).rsplit(':', 1)[0]  # HH:MM format
                config['start_number'] = current_number

                split_startlist = generate_startlist_for_class(
                    group_entries, split_class_name, config, seed
                )

                startlist.extend(split_startlist)

                # Update tracking
                if split_startlist:
                    interval = int(config.get('interval', 1))
                    current_time += timedelta(minutes=len(split_startlist) * interval)
                    current_number += len(split_startlist)

        else:
            # No splitting, generate directly
            class_entries = [e for e in entries if e.get('class_name', '') == class_name]

            if not class_entries:
                continue

            config = get_effective_config(class_name, lane_config, class_overrides)
            config['start_time'] = format_time(current_time).rsplit(':', 1)[0]
            config['start_number'] = current_number

            class_startlist = generate_startlist_for_class(
                class_entries, class_name, config, seed
            )

            startlist.extend(class_startlist)

            # Update tracking
            if class_startlist:
                interval = int(config.get('interval', 1))
                current_time += timedelta(minutes=len(class_startlist) * interval)
                current_number += len(class_startlist)

    return startlist


if __name__ == '__main__':
    # Test with sample data
    test_entries = [
        {'class_name': 'M21A', 'name1': 'Runner A', 'affiliation': 'Club1'},
        {'class_name': 'M21A', 'name1': 'Runner B', 'affiliation': 'Club1'},
        {'class_name': 'M21A', 'name1': 'Runner C', 'affiliation': 'Club2'},
        {'class_name': 'M21A', 'name1': 'Runner D', 'affiliation': 'Club2'},
        {'class_name': 'M21A', 'name1': 'Runner E', 'affiliation': 'Club3'},
    ]

    config = {
        'start_time': '11:00',
        'start_number': 100,
        'interval': 2,
        'affiliation_split': True
    }

    result = generate_startlist_for_class(test_entries, 'M21A', config, seed=42)
    print("Generated startlist:")
    for entry in result:
        print(f"  {entry['start_number']} {entry['start_time']} {entry['name1']} ({entry['affiliation']})")
