"""
Output Formatter Module

Generates output files in various formats:
- Startlist.csv: Main startlist for Mulka
- Role_Startlist.csv: Startlist with role assignments
- Public_Startlist.tex: LaTeX format for public display (supports English/Japanese)
- Role_Startlist.tex: LaTeX format with furigana for staff use
"""

import csv
import os
from typing import List, Dict, Any
from collections import defaultdict


# Language-specific labels
LABELS = {
    'en': {
        'startlist': 'Startlist',
        'entries': 'entries',
        'no': 'No.',
        'time': 'Time',
        'name': 'Name',
        'affiliation': 'Affiliation',
        'card': 'Card',
        'rental': '(rental)',
        'lane': 'Lane',
    },
    'ja': {
        'startlist': 'スタートリスト',
        'entries': '名',
        'no': 'No.',
        'time': '時刻',
        'name': '氏名',
        'affiliation': '所属',
        'card': 'カード',
        'rental': 'レンタル',
        'lane': 'レーン',
    }
}


def write_startlist_csv(startlist: List[Dict[str, Any]], output_path: str) -> None:
    """
    Write startlist in Mulka-compatible CSV format.

    Columns:
    - Class (クラス)
    - Start Number (スタートナンバー)
    - Name 1 (氏名１) - Kanji
    - Name 2 (氏名2) - Hiragana
    - Affiliation (所属)
    - Start Time (スタート時刻)
    - Card Number (カード番号)
    - Card Note (カード備考)
    - Registration Number (競技者登録番号)
    """
    fieldnames = [
        'クラス',
        'スタートナンバー',
        '氏名１',
        '氏名2',
        '所属',
        'スタート時刻',
        'カード番号',
        'カード備考',
        '競技者登録番号'
    ]

    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for entry in startlist:
            # Determine card note
            card_note = 'レンタル' if entry.get('is_rental', False) else 'my card'
            if not entry.get('card_number'):
                card_note = 'レンタル'

            row = {
                'クラス': entry.get('class_name', ''),
                'スタートナンバー': entry.get('start_number', ''),
                '氏名１': entry.get('name1', ''),
                '氏名2': entry.get('name2', ''),
                '所属': entry.get('affiliation', '-') or '-',
                'スタート時刻': entry.get('start_time', ''),
                'カード番号': entry.get('card_number', ''),
                'カード備考': card_note,
                '競技者登録番号': entry.get('joa_number', '')
            }
            writer.writerow(row)


def write_role_startlist_csv(startlist: List[Dict[str, Any]], output_path: str) -> None:
    """
    Write startlist with role assignments for staff use.

    Additional columns for role management and check-in status.
    """
    fieldnames = [
        'クラス',
        'スタートナンバー',
        '氏名',
        '所属',
        'スタート時刻',
        'カード番号',
        'チェックイン',
        '備考'
    ]

    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for entry in startlist:
            row = {
                'クラス': entry.get('class_name', ''),
                'スタートナンバー': entry.get('start_number', ''),
                '氏名': entry.get('name1', ''),
                '所属': entry.get('affiliation', '-') or '-',
                'スタート時刻': entry.get('start_time', ''),
                'カード番号': entry.get('card_number', ''),
                'チェックイン': '',
                '備考': 'レンタル' if entry.get('is_rental', False) else ''
            }
            writer.writerow(row)


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
    if not text:
        return ''

    # Characters that need escaping in LaTeX
    replacements = [
        ('\\', r'\textbackslash{}'),
        ('&', r'\&'),
        ('%', r'\%'),
        ('$', r'\$'),
        ('#', r'\#'),
        ('_', r'\_'),
        ('{', r'\{'),
        ('}', r'\}'),
        ('~', r'\textasciitilde{}'),
        ('^', r'\textasciicircum{}'),
    ]

    for old, new in replacements:
        text = text.replace(old, new)

    return text


def get_lane_for_class(class_name: str, lanes_config: Dict[str, Any]) -> str:
    """
    Find which lane a class belongs to.
    """
    for lane_name, lane_config in lanes_config.items():
        classes = lane_config.get('classes', [])
        # Check for exact match or if class is a split of configured class
        for cls in classes:
            if class_name == cls or class_name.startswith(cls):
                return lane_name
    return ''


def write_public_startlist_tex(
    startlist: List[Dict[str, Any]],
    output_path: str,
    config: Dict[str, Any]
) -> None:
    """
    Write public startlist in LaTeX format.

    Creates a formatted document suitable for printing and public display.
    Organized by Lane (Lane 1, Lane 2, ...) then by class within each lane.
    Supports English and Japanese languages via config['language'].
    """
    # Get language setting
    language = config.get('language', 'en')
    labels = LABELS.get(language, LABELS['en'])

    # Get competition name from config
    competition_name = config.get('competition_name', 'Competition Startlist')
    output_folder = config.get('output_folder', '')
    lanes_config = config.get('lanes', {})

    # Group entries by lane, then by class
    by_lane = defaultdict(lambda: defaultdict(list))
    for entry in startlist:
        class_name = entry.get('class_name', '')
        lane_name = get_lane_for_class(class_name, lanes_config)
        if not lane_name:
            lane_name = 'Other'
        by_lane[lane_name][class_name].append(entry)

    with open(output_path, 'w', encoding='utf-8') as f:
        # Write LaTeX preamble with ltjsarticle for LuaLaTeX
        f.write(r'''\documentclass[a4paper,10pt]{ltjsarticle}
\usepackage{geometry}
\usepackage{longtable}
\usepackage{booktabs}
\usepackage{fancyhdr}

\geometry{margin=2cm}
\pagestyle{fancy}
\fancyhf{}
''')
        f.write(f'\\fancyhead[C]{{{escape_latex(competition_name)} - {labels["startlist"]}}}\n')
        f.write(r'\fancyfoot[C]{\thepage}')
        f.write('\n')
        f.write(r'\setlength{\headheight}{15pt}')
        f.write('\n')
        f.write(r'\begin{document}')
        f.write('\n\n')

        # Title
        f.write(f'\\section*{{{escape_latex(output_folder)} {labels["startlist"]}}}\n\n')

        # Sort lanes naturally (Lane 1, Lane 2, ...)
        sorted_lanes = sorted(by_lane.keys(), key=lambda x: (
            int(''.join(filter(str.isdigit, x)) or '999'),
            x
        ))

        # Write each lane section
        for lane_name in sorted_lanes:
            classes_in_lane = by_lane[lane_name]

            # Lane header
            f.write(f'\\section*{{{escape_latex(lane_name)}}}\n\n')

            # Write each class within this lane
            for class_name in sorted(classes_in_lane.keys()):
                entries = classes_in_lane[class_name]
                entries.sort(key=lambda x: x.get('start_number', 0))

                entry_count_label = f'{len(entries)} {labels["entries"]}'
                f.write(f'\\subsection*{{{escape_latex(class_name)} ({entry_count_label})}}\n\n')

                f.write(r'\begin{longtable}{rllll}')
                f.write('\n')
                f.write(r'\toprule')
                f.write('\n')
                f.write(f'{labels["no"]} & {labels["time"]} & {labels["name"]} & {labels["affiliation"]} & {labels["card"]} \\\\\n')
                f.write(r'\midrule')
                f.write('\n')
                f.write(r'\endhead')
                f.write('\n')

                for entry in entries:
                    start_num = entry.get('start_number', '')
                    start_time = entry.get('start_time', '')
                    name = escape_latex(entry.get('name1', ''))
                    affiliation = escape_latex(entry.get('affiliation', '-') or '-')
                    card = entry.get('card_number', '')
                    if entry.get('is_rental', False) or not card:
                        card = labels['rental']

                    f.write(f'{start_num} & {start_time} & {name} & {affiliation} & {card} \\\\\n')

                f.write(r'\bottomrule')
                f.write('\n')
                f.write(r'\end{longtable}')
                f.write('\n\n')

        f.write(r'\end{document}')
        f.write('\n')


def write_role_startlist_tex(
    startlist: List[Dict[str, Any]],
    output_path: str,
    config: Dict[str, Any]
) -> None:
    """
    Write role startlist in LaTeX format with furigana.

    Creates a formatted document for staff use with name readings (furigana).
    Organized by Lane (Lane 1, Lane 2, ...) then by class within each lane.
    Uses ruby for furigana display.
    """
    # Get competition name from config
    competition_name = config.get('competition_name', 'Competition Startlist')
    output_folder = config.get('output_folder', '')
    lanes_config = config.get('lanes', {})

    # Group entries by lane, then by class
    by_lane = defaultdict(lambda: defaultdict(list))
    for entry in startlist:
        class_name = entry.get('class_name', '')
        lane_name = get_lane_for_class(class_name, lanes_config)
        if not lane_name:
            lane_name = 'Other'
        by_lane[lane_name][class_name].append(entry)

    with open(output_path, 'w', encoding='utf-8') as f:
        # Write LaTeX preamble with ltjsarticle for LuaLaTeX
        f.write(r'''\documentclass[a4paper,10pt]{ltjsarticle}
\usepackage{geometry}
\usepackage{longtable}
\usepackage{booktabs}
\usepackage{fancyhdr}
\usepackage{luatexja-ruby}

\geometry{margin=2cm}
\pagestyle{fancy}
\fancyhf{}
''')
        f.write(f'\\fancyhead[C]{{{escape_latex(competition_name)} - 役員用スタートリスト}}\n')
        f.write(r'\fancyfoot[C]{\thepage}')
        f.write('\n')
        f.write(r'\setlength{\headheight}{15pt}')
        f.write('\n')
        f.write(r'\begin{document}')
        f.write('\n\n')

        # Title
        f.write(f'\\section*{{{escape_latex(output_folder)} 役員用スタートリスト}}\n\n')

        # Sort lanes naturally (Lane 1, Lane 2, ...)
        sorted_lanes = sorted(by_lane.keys(), key=lambda x: (
            int(''.join(filter(str.isdigit, x)) or '999'),
            x
        ))

        # Write each lane section
        for lane_name in sorted_lanes:
            classes_in_lane = by_lane[lane_name]

            # Lane header
            f.write(f'\\section*{{{escape_latex(lane_name)}}}\n\n')

            # Write each class within this lane
            for class_name in sorted(classes_in_lane.keys()):
                entries = classes_in_lane[class_name]
                entries.sort(key=lambda x: x.get('start_number', 0))

                f.write(f'\\subsection*{{{escape_latex(class_name)} ({len(entries)}名)}}\n\n')

                f.write(r'\begin{longtable}{rlp{6cm}ll}')
                f.write('\n')
                f.write(r'\toprule')
                f.write('\n')
                f.write(r'No. & 時刻 & 氏名 & 所属 & カード \\')
                f.write('\n')
                f.write(r'\midrule')
                f.write('\n')
                f.write(r'\endhead')
                f.write('\n')

                for entry in entries:
                    start_num = entry.get('start_number', '')
                    start_time = entry.get('start_time', '')
                    name1 = escape_latex(entry.get('name1', ''))
                    name2 = escape_latex(entry.get('name2', ''))
                    affiliation = escape_latex(entry.get('affiliation', '-') or '-')
                    card = entry.get('card_number', '')
                    if entry.get('is_rental', False) or not card:
                        card = 'レンタル'

                    # Create name with furigana if name2 exists
                    if name2 and name1:
                        name_display = f'\\ruby{{{name1}}}{{{name2}}}'
                    else:
                        name_display = name1

                    f.write(f'{start_num} & {start_time} & {name_display} & {affiliation} & {card} \\\\\n')

                f.write(r'\bottomrule')
                f.write('\n')
                f.write(r'\end{longtable}')
                f.write('\n\n')

        f.write(r'\end{document}')
        f.write('\n')


def write_mulka_import_csv(startlist: List[Dict[str, Any]], output_path: str) -> None:
    """
    Write startlist in format optimized for Mulka import.

    This format uses semicolon separators and specific column ordering
    as required by Mulka software.
    """
    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
        # Mulka expects: Class;StartNo;Name;Club;CardNo;StartTime
        f.write('Class;StartNo;Name;Club;CardNo;StartTime\n')

        for entry in startlist:
            class_name = entry.get('class_name', '')
            start_no = entry.get('start_number', '')
            name = entry.get('name1', '')
            club = entry.get('affiliation', '') or ''
            card_no = entry.get('card_number', '')
            start_time = entry.get('start_time', '')

            # Escape semicolons in fields
            name = name.replace(';', ',')
            club = club.replace(';', ',')

            f.write(f'{class_name};{start_no};{name};{club};{card_no};{start_time}\n')


def write_class_summary_csv(startlist: List[Dict[str, Any]], output_path: str) -> None:
    """
    Write a CSV file containing class names and competitor counts.

    Columns:
    - Class (クラス)
    - Count (人数)
    """
    # Group by class
    by_class = defaultdict(int)
    for entry in startlist:
        class_name = entry.get('class_name', '')
        if class_name:
            by_class[class_name] += 1

    fieldnames = ['クラス', '人数']

    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        # Sort classes for consistent output
        for class_name in sorted(by_class.keys()):
            count = by_class[class_name]
            writer.writerow({
                'クラス': class_name,
                '人数': count
            })

        # Write total row
        writer.writerow({
            'クラス': '合計',
            '人数': sum(by_class.values())
        })


def generate_summary_report(
    startlist: List[Dict[str, Any]],
    output_path: str
) -> None:
    """
    Generate a summary report of the startlist.
    """
    # Group by class
    by_class = defaultdict(list)
    for entry in startlist:
        by_class[entry.get('class_name', '')].append(entry)

    # Count totals
    total_entries = len(startlist)
    rental_count = sum(1 for e in startlist if e.get('is_rental', False))

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("Startlist Summary Report\n")
        f.write("=" * 50 + "\n\n")

        f.write(f"Total entries: {total_entries}\n")
        f.write(f"Rental cards: {rental_count}\n")
        f.write(f"Own cards: {total_entries - rental_count}\n\n")

        f.write("Class breakdown:\n")
        f.write("-" * 40 + "\n")

        for class_name in sorted(by_class.keys()):
            entries = by_class[class_name]
            rental = sum(1 for e in entries if e.get('is_rental', False))

            f.write(f"{class_name:15} {len(entries):4} entries")
            if rental > 0:
                f.write(f" ({rental} rental)")
            f.write("\n")

        f.write("-" * 40 + "\n")


if __name__ == '__main__':
    # Test output formatters
    test_startlist = [
        {
            'class_name': 'M21A1',
            'start_number': 100,
            'name1': 'Test Runner',
            'name2': 'Test Kana',
            'affiliation': 'Test Club',
            'start_time': '11:00:00',
            'card_number': '1234567',
            'is_rental': False,
            'joa_number': '123-45-678'
        },
        {
            'class_name': 'M21A1',
            'start_number': 101,
            'name1': 'Another Runner',
            'name2': 'Another Kana',
            'affiliation': 'Another Club',
            'start_time': '11:01:00',
            'card_number': '',
            'is_rental': True,
            'joa_number': ''
        }
    ]

    print("Testing output formatters...")
    write_startlist_csv(test_startlist, 'test_output.csv')
    print("Created test_output.csv")

    write_role_startlist_csv(test_startlist, 'test_role_output.csv')
    print("Created test_role_output.csv")

    write_public_startlist_tex(test_startlist, 'test_output.tex', {'output_folder': 'Test'})
    print("Created test_output.tex")
