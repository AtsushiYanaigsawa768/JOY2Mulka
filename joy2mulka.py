"""
JOY2Mulka - Convert JOY entry list to Mulka startlist format

This program reads an entry list from JapanO-Entry (JOY) and generates
startlist files compatible with the Mulka orienteering timing system.

Features:
- Per-lane configuration (start time, classes, start number, interval)
- Class splits (e.g., M21 -> M21A1, M21A2) with ranking-based distribution
- Consecutive affiliation splitting to prevent same-club runners back-to-back
- JOA registration lookup for competitor rankings
- Multiple output formats: CSV, Role CSV, LaTeX

Author: Generated for orienteering competition management
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

from entry_parser import parse_entry_list
from ranking_fetcher import fetch_rankings, get_joa_registration
from startlist_generator import generate_startlist
from output_formatter import (
    write_startlist_csv,
    write_role_startlist_csv,
    write_public_startlist_tex,
    write_role_startlist_tex,
    write_class_summary_csv
)


def load_config(config_path: str) -> dict:
    """
    Load configuration from JSON file.

    Config structure:
    {
        "output_folder": "Competition2024",
        "lanes": {
            "Lane 1": {
                "start_time": "11:00",
                "classes": ["M21A", "M20E", ...],
                "start_number": 1100,
                "interval": 2,
                "affiliation_split": true
            },
            ...
        },
        "class_overrides": {
            "M21A": {
                "start_time": "10:30",
                "start_number": 1000,
                "interval": 3,
                "affiliation_split": false
            }
        },
        "splits": {
            "M21": {
                "count": 2,
                "suffix_format": "A{}",
                "use_ranking": true
            }
        }
    }
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def validate_config(config: dict) -> bool:
    """Validate configuration structure."""
    required_keys = ['output_folder', 'lanes']
    for key in required_keys:
        if key not in config:
            print(f"Error: Missing required config key: {key}")
            return False

    for lane_name, lane_config in config['lanes'].items():
        required_lane_keys = ['start_time', 'classes', 'start_number', 'interval']
        for key in required_lane_keys:
            if key not in lane_config:
                print(f"Error: Missing key '{key}' in lane '{lane_name}'")
                return False

    return True


def apply_class_splits(
    entries: List[Dict[str, Any]],
    splits_config: Dict[str, Dict[str, Any]],
    rankings: Dict[str, Dict[str, int]],
    seed: Optional[int] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """
    Apply class splits to entries before lane processing.

    For classes configured for splitting (e.g., M21 -> M21A1, M21A2),
    this assigns each entry to a split group and updates their class_name.

    Returns:
        Tuple of:
        - Updated entries with split class names
        - Mapping of original class -> list of split class names
    """
    from startlist_generator import split_class_by_ranking
    import random

    if seed is not None:
        random.seed(seed)

    updated_entries = []
    split_mapping = {}

    # Group entries by class
    entries_by_class = {}
    for entry in entries:
        class_name = entry.get('class_name', '')
        if class_name not in entries_by_class:
            entries_by_class[class_name] = []
        entries_by_class[class_name].append(entry)

    for class_name, class_entries in entries_by_class.items():
        # Check if this class is configured for splitting
        if class_name in splits_config:
            split_cfg = splits_config[class_name]
            split_count = split_cfg.get('count', 2)
            suffix_format = split_cfg.get('suffix_format', '{}')

            # Get rankings for this class (try with and without suffix)
            class_rankings = rankings.get(class_name, {})

            # Split by ranking
            groups = split_class_by_ranking(
                class_entries, split_count, class_rankings, seed
            )

            # Generate split class names
            split_names = []
            for group_num in range(1, split_count + 1):
                split_name = f"{class_name}{suffix_format.format(group_num)}"
                split_names.append(split_name)

            split_mapping[class_name] = split_names

            # Update entries with split class names
            for group_num, group_entries in enumerate(groups, start=1):
                split_name = f"{class_name}{suffix_format.format(group_num)}"
                for entry in group_entries:
                    updated_entry = entry.copy()
                    updated_entry['class_name'] = split_name
                    updated_entry['original_class'] = class_name
                    updated_entries.append(updated_entry)
        else:
            # No splitting, keep original class
            updated_entries.extend(class_entries)

    return updated_entries, split_mapping


def main():
    parser = argparse.ArgumentParser(
        description='Convert JOY entry list to Mulka startlist format'
    )
    parser.add_argument(
        'entry_list',
        help='Path to the entry list CSV file'
    )
    parser.add_argument(
        'config',
        help='Path to the configuration JSON file'
    )
    parser.add_argument(
        '--no-ranking',
        action='store_true',
        help='Skip ranking lookup (use random distribution for splits)'
    )
    parser.add_argument(
        '--output-dir',
        default='.',
        help='Base output directory (default: current directory)'
    )
    parser.add_argument(
        '--seed',
        type=int,
        default=None,
        help='Random seed for reproducible results'
    )

    args = parser.parse_args()

    # Load configuration
    print(f"Loading configuration from: {args.config}")
    config = load_config(args.config)

    if not validate_config(config):
        sys.exit(1)

    # Parse entry list
    print(f"Parsing entry list from: {args.entry_list}")
    entries = parse_entry_list(args.entry_list)
    print(f"Found {len(entries)} entries")

    # Get rankings if needed and not disabled
    rankings = {}
    if not args.no_ranking and 'splits' in config:
        split_classes = list(config.get('splits', {}).keys())
        if split_classes:
            print("Fetching rankings from JOA registration...")
            for cls in split_classes:
                if config['splits'][cls].get('use_ranking', True):
                    rankings[cls] = fetch_rankings(entries, cls)

    # Get JOA registration data for competitor lookup
    print("Looking up JOA registration data...")
    joa_data = get_joa_registration(entries)

    # Apply class splits before lane processing
    if 'splits' in config:
        print("\nApplying class splits...")
        entries, split_mapping = apply_class_splits(
            entries, config['splits'], rankings, args.seed
        )
        for orig_class, split_classes in split_mapping.items():
            print(f"  {orig_class} -> {', '.join(split_classes)}")

    # Create output directory
    output_folder = os.path.join(args.output_dir, config['output_folder'])
    os.makedirs(output_folder, exist_ok=True)
    print(f"Output directory: {output_folder}")

    # Generate startlist for each lane
    all_startlists = {}
    for lane_name, lane_config in config['lanes'].items():
        print(f"\nProcessing {lane_name}...")

        # For lanes, don't apply splits again (already applied)
        startlist = generate_startlist(
            entries=entries,
            lane_config=lane_config,
            class_overrides=config.get('class_overrides', {}),
            splits_config={},  # Empty - splits already applied
            rankings=rankings,
            joa_data=joa_data,
            seed=args.seed
        )

        all_startlists[lane_name] = startlist
        print(f"  Generated {len(startlist)} start positions")

    # Combine all startlists
    combined_startlist = []
    for lane_name, startlist in all_startlists.items():
        combined_startlist.extend(startlist)

    # Sort by start time
    combined_startlist.sort(key=lambda x: x['start_time'])

    # Write output files
    startlist_path = os.path.join(output_folder, 'Startlist.csv')
    role_startlist_path = os.path.join(output_folder, 'Role_Startlist.csv')
    public_tex_path = os.path.join(output_folder, 'Public_Startlist.tex')
    role_tex_path = os.path.join(output_folder, 'Role_Startlist.tex')
    class_summary_path = os.path.join(output_folder, 'Class_Summary.csv')

    print(f"\nWriting output files...")
    write_startlist_csv(combined_startlist, startlist_path)
    print(f"  Created: {startlist_path}")

    write_role_startlist_csv(combined_startlist, role_startlist_path)
    print(f"  Created: {role_startlist_path}")

    write_public_startlist_tex(combined_startlist, public_tex_path, config)
    print(f"  Created: {public_tex_path}")

    write_role_startlist_tex(combined_startlist, role_tex_path, config)
    print(f"  Created: {role_tex_path}")

    write_class_summary_csv(combined_startlist, class_summary_path)
    print(f"  Created: {class_summary_path}")

    print(f"\nDone! Total entries: {len(combined_startlist)}")


if __name__ == '__main__':
    main()
