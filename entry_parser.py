"""
Entry List Parser Module

Parses JapanO-Entry (JOY) export CSV files and extracts participant information.
Handles the complex multi-row, multi-participant structure of JOY exports.

The JOY export format has:
- Row 1: Group headers (申込代表者, チーム(組), 1人目, 2人目, ...)
- Row 2: Column names within each group
- Row 3+: Data rows

Each row can contain multiple participants (up to 5) with their class/affiliation
information in the team columns.
"""

import csv
import re
from typing import List, Dict, Any, Optional
import unicodedata


def normalize_whitespace(text: str) -> str:
    """
    Normalize whitespace in text.
    Converts full-width spaces to half-width and normalizes multiple spaces.
    """
    if not text:
        return ""

    # Convert full-width space to half-width
    text = text.replace('\u3000', ' ')

    # Normalize Unicode (NFKC converts full-width to half-width where applicable)
    text = unicodedata.normalize('NFKC', text)

    # Remove leading/trailing whitespace and normalize internal spaces
    text = ' '.join(text.split())

    return text


def parse_affiliation(affiliation: str) -> List[str]:
    """
    Parse affiliation string and extract individual affiliations.
    Affiliations may be separated by / or , and may contain numeric info to drop.

    Examples:
        "東大OLK / 早大OC" -> ["東大OLK", "早大OC"]
        "京大OLC, 同志社OLC" -> ["京大OLC", "同志社OLC"]
        "東工大OLC1" -> ["東工大OLC"]
    """
    if not affiliation or affiliation in ['-', '−', '―', '']:
        return []

    # Split by / or ,
    parts = re.split(r'[/,、]', affiliation)

    result = []
    for part in parts:
        part = normalize_whitespace(part)
        if not part or part in ['-', '−', '―']:
            continue

        # Remove trailing numbers (e.g., "東工大OLC1" -> "東工大OLC")
        part = re.sub(r'\d+$', '', part)
        part = part.strip()

        if part:
            result.append(part)

    return result


def detect_encoding(file_path: str) -> str:
    """Detect file encoding by trying common encodings."""
    encodings = ['utf-8-sig', 'utf-8', 'cp932', 'shift_jis', 'euc-jp']

    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                f.read(1024)
            return encoding
        except (UnicodeDecodeError, UnicodeError):
            continue

    return 'utf-8-sig'  # Default fallback


def detect_delimiter(file_path: str, encoding: str) -> str:
    """Detect CSV delimiter (tab or comma)."""
    with open(file_path, 'r', encoding=encoding) as f:
        first_line = f.readline()

    tab_count = first_line.count('\t')
    comma_count = first_line.count(',')

    return '\t' if tab_count > comma_count else ','


def find_column_indices(header_row: List[str], column_names_row: List[str]) -> Dict[str, int]:
    """
    Find column indices for required fields based on header structure.
    Returns a mapping of field names to column indices.
    """
    indices = {}

    # Find team/class columns (in チーム(組) section)
    team_start = -1
    for i, h in enumerate(header_row):
        if 'チーム' in h or '組' in h:
            team_start = i
            break

    # Find participant sections (1人目, 2人目, ...)
    participant_starts = {}
    for i, h in enumerate(header_row):
        match = re.match(r'(\d+)人目', h)
        if match:
            num = int(match.group(1))
            if num not in participant_starts:
                participant_starts[num] = i

    # Map column names to indices within each section
    for i, col_name in enumerate(column_names_row):
        col_name = normalize_whitespace(col_name)

        # Team section columns
        if team_start <= i < min(participant_starts.values(), default=len(column_names_row)):
            if col_name == 'クラス':
                indices['class'] = i
            elif col_name == '所属':
                indices['affiliation'] = i
            elif col_name == 'チーム名(氏名)':
                indices['team_name'] = i
            elif col_name == 'カードレンタル枚数':
                indices['rental_count'] = i

    # Participant columns
    for p_num, p_start in participant_starts.items():
        p_end = min([v for v in participant_starts.values() if v > p_start],
                    default=len(column_names_row))

        prefix = f'p{p_num}_'
        for i in range(p_start, p_end):
            if i >= len(column_names_row):
                break
            col_name = normalize_whitespace(column_names_row[i])

            if col_name == '氏名1':
                indices[f'{prefix}name1'] = i
            elif col_name == '氏名2':
                indices[f'{prefix}name2'] = i
            elif col_name == '性別':
                indices[f'{prefix}gender'] = i
            elif col_name == 'カード番号':
                indices[f'{prefix}card_number'] = i
            elif col_name == 'JOA競技者番号':
                indices[f'{prefix}joa_number'] = i

    return indices


def parse_entry_list(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse JOY entry list CSV and extract participant information.

    Returns a list of dictionaries, each containing:
    - class_name: Competition class (e.g., "M21A", "W20E")
    - name1: Name in kanji
    - name2: Name in hiragana/katakana
    - affiliation: Club/team affiliation
    - affiliations: List of parsed affiliations (for split detection)
    - card_number: SI card number
    - joa_number: JOA registration number
    - is_rental: Whether card is rental
    - gender: M/W
    """
    encoding = detect_encoding(file_path)
    delimiter = detect_delimiter(file_path, encoding)

    entries = []

    with open(file_path, 'r', encoding=encoding, newline='') as f:
        reader = csv.reader(f, delimiter=delimiter)
        rows = list(reader)

    if len(rows) < 3:
        raise ValueError("Entry list must have at least 3 rows (2 header rows + data)")

    header_row = rows[0]
    column_names_row = rows[1]
    data_rows = rows[2:]

    indices = find_column_indices(header_row, column_names_row)

    def safe_get(row: List[str], idx: Optional[int], default: str = "") -> str:
        """Safely get value from row by index."""
        if idx is None or idx >= len(row):
            return default
        val = row[idx]
        return normalize_whitespace(val) if val else default

    for row_num, row in enumerate(data_rows, start=3):
        if not row or all(not cell.strip() for cell in row):
            continue

        # Get class and affiliation from team section
        class_name = safe_get(row, indices.get('class'))
        affiliation = safe_get(row, indices.get('affiliation'))
        rental_count_str = safe_get(row, indices.get('rental_count'), '0')

        # Skip rows without class
        if not class_name or class_name == '〃':
            # Handle continuation rows (〃 means same as above)
            # These need special handling - class should be taken from row
            pass

        # Parse each participant in the row
        for p_num in range(1, 6):
            prefix = f'p{p_num}_'

            name1 = safe_get(row, indices.get(f'{prefix}name1'))
            if not name1:
                continue  # No participant in this slot

            name2 = safe_get(row, indices.get(f'{prefix}name2'))
            gender = safe_get(row, indices.get(f'{prefix}gender'))
            card_number = safe_get(row, indices.get(f'{prefix}card_number'))
            joa_number = safe_get(row, indices.get(f'{prefix}joa_number'))

            # Determine if rental card
            try:
                rental_count = int(rental_count_str) if rental_count_str else 0
            except ValueError:
                rental_count = 0
            is_rental = rental_count > 0 and not card_number

            # Parse affiliations for split detection
            affiliations = parse_affiliation(affiliation)

            entry = {
                'class_name': class_name,
                'name1': name1,
                'name2': name2,
                'affiliation': affiliation if affiliation and affiliation != '-' else '',
                'affiliations': affiliations,
                'card_number': card_number,
                'joa_number': joa_number,
                'is_rental': is_rental,
                'gender': gender,
                'row_number': row_num,
                'participant_number': p_num
            }

            entries.append(entry)

    return entries


def group_entries_by_class(entries: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group entries by their class name."""
    groups = {}
    for entry in entries:
        class_name = entry['class_name']
        if class_name not in groups:
            groups[class_name] = []
        groups[class_name].append(entry)
    return groups


def get_unique_classes(entries: List[Dict[str, Any]]) -> List[str]:
    """Get unique class names from entries."""
    return list(set(entry['class_name'] for entry in entries if entry['class_name']))


if __name__ == '__main__':
    # Test parsing
    import sys

    if len(sys.argv) > 1:
        entries = parse_entry_list(sys.argv[1])
        print(f"Parsed {len(entries)} entries")

        # Show class distribution
        classes = group_entries_by_class(entries)
        print("\nClass distribution:")
        for cls, members in sorted(classes.items()):
            print(f"  {cls}: {len(members)} entries")

        # Show first few entries
        print("\nFirst 5 entries:")
        for entry in entries[:5]:
            print(f"  {entry['class_name']}: {entry['name1']} ({entry['affiliation']})")
