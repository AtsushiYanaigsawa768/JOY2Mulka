<div align="center">

# JOY2Mulka

**Convert JapanO-Entry (JOY) Entry Lists to Mulka Startlist Format**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![LuaLaTeX](https://img.shields.io/badge/LaTeX-LuaLaTeX-orange.svg)](https://www.luatex.org/)

**English** | [日本語](README.md)

</div>

---

## Overview

JOY2Mulka is a tool designed to streamline orienteering competition management. It reads entry lists from JapanO-Entry (JOY) and automatically generates Mulka-compatible startlists.

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-lane Support** | Configure start times, classes, and intervals per lane |
| **Class Splitting** | Auto-split classes (e.g., M21 → M21A1, M21A2) |
| **Ranking Distribution** | Fair group distribution using JOA rankings |
| **Affiliation Separation** | Prevent consecutive same-club runners |
| **Bilingual LaTeX** | Switch between English and Japanese |
| **Furigana Support** | Name readings for announcements |

---

## Quick Start

### 1. Install

```bash
pip install pandas
```

### 2. Run

```bash
python joy2mulka.py <entry_list.csv> <config.json>
```

### Try with Sample Data

You can quickly test the tool using the included sample data:

```bash
# Run with sample data
python joy2mulka.py sample/sample_entrylist.csv sample/config.json

# Specify output directory
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --output-dir output

# Skip ranking lookup (for offline use)
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --no-ranking
```

### 3. Check Output

The following files are generated in the output folder:

```
output_folder/
├── Startlist.csv          # For Mulka import
├── Role_Startlist.csv     # Staff use (with check-in column)
├── Public_Startlist.tex   # Public display LaTeX
├── Role_Startlist.tex     # Staff LaTeX (with furigana)
└── Class_Summary.csv      # Entry counts per class
```

---

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--no-ranking` | Skip ranking lookup | - |
| `--output-dir <path>` | Output directory | Current |
| `--seed <number>` | Random seed for reproducibility | - |

**Example:**

```bash
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --output-dir output
```

---

## Configuration File

### Basic Structure

```json
{
    "output_folder": "Competition2024",
    "competition_name": "Sample Competition",
    "language": "en",

    "lanes": {
        "Lane 1": {
            "start_time": "11:00",
            "classes": ["M21A", "M20E"],
            "start_number": 1100,
            "interval": 2,
            "affiliation_split": true
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
```

### Configuration Options

<details>
<summary><b>Global Settings</b></summary>

| Key | Description | Example |
|-----|-------------|---------|
| `output_folder` | Output folder name | `"Competition2024"` |
| `competition_name` | Competition name (for LaTeX) | `"My Competition"` |
| `language` | Language setting | `"en"` or `"ja"` |

</details>

<details>
<summary><b>Lane Settings</b></summary>

| Key | Description | Example |
|-----|-------------|---------|
| `start_time` | First start time | `"11:00"` |
| `classes` | List of classes | `["M21A", "M20E"]` |
| `start_number` | Starting bib number | `1100` |
| `interval` | Minutes between starts | `2` |
| `affiliation_split` | Prevent same-club consecutive | `true` |

</details>

<details>
<summary><b>Split Settings</b></summary>

| Key | Description | Example |
|-----|-------------|---------|
| `count` | Number of groups | `2` |
| `suffix_format` | Suffix format | `"A{}"` → M21A1, M21A2 |
| `use_ranking` | Use JOA rankings | `true` |

</details>

---

## LaTeX Output

### Requirements

Generated `.tex` files require **LuaLaTeX** for compilation.

### Using Overleaf

1. Upload the `.tex` file
2. **Menu** → **Settings** → Change **Compiler** to **LuaLaTeX**
3. Click **Recompile**

### Local Compilation

```bash
lualatex Public_Startlist.tex
lualatex Role_Startlist.tex
```

### Required Packages

- `ltjsarticle` - Japanese document class for LuaLaTeX
- `luatexja-ruby` - For furigana display
- `geometry`, `longtable`, `booktabs`, `fancyhdr`

---

## Algorithms

### Class Splitting

```
Ranked runners:
  Rank 1 → Group 1
  Rank 2 → Group 2
  Rank 3 → Group 1
  ... (distributed by modulo)

Unranked runners:
  Randomly distributed to balance group sizes
```

### Affiliation Separation

1. Shuffle runners randomly
2. Greedy algorithm to avoid consecutive same-club
3. "/" and "," separators treated as multiple affiliations
4. Trailing numbers ignored (ClubA1 = ClubA)

---

## File Structure

```
JOY2Mulka/
├── joy2mulka.py           # Main program
├── entry_parser.py        # Entry list parser
├── ranking_fetcher.py     # JOA ranking lookup
├── startlist_generator.py # Startlist generation
├── output_formatter.py    # Output formatters
├── README.md              # Japanese documentation
├── README_en.md           # This file (English)
└── sample/
    ├── config.json        # Sample configuration
    └── sample_entrylist.csv
```

---

## Notes

- Mixed full-width/half-width spaces in names are auto-normalized
- Supports UTF-8 (with BOM), Shift-JIS, and EUC-JP encodings
- Both tab-separated and comma-separated CSV files supported

---

<div align="center">

**Made for Orienteering Competition Management**

</div>
