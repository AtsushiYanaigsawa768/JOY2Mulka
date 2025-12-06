<div align="center">

# JOY2Mulka

**JapanO-Entry（JOY）エントリーリスト → Mulka スタートリスト変換ツール**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![LuaLaTeX](https://img.shields.io/badge/LaTeX-LuaLaTeX-orange.svg)](https://www.luatex.org/)

[English](README_en.md) | **日本語**

</div>

---

## 概要

JOY2Mulkaは、オリエンテーリング大会の運営を効率化するツールです。JapanO-Entry（JOY）のエントリーリストを読み込み、Mulka対応のスタートリストを自動生成します。
同様に、役職用スタートリスト、公開用スタートリストも作成します。

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| **複数レーン対応** | レーンごとにスタート時刻、クラス、インターバルを設定 |
| **クラス分割** | M21 → M21A1, M21A2 のような自動分割 |
| **ランキング配分** | JOAランキングを使用した公平なグループ分け |
| **同一所属回避** | 連続スタートで同じ所属を避ける |
| **多言語LaTeX** | 英語・日本語切り替え可能 |
| **ふりがな対応** | 役員用リストに読み仮名を表示 |

---

## クイックスタート

### 1. インストール

```bash
pip install pandas
```

### 2. 実行

```bash
python joy2mulka.py <エントリーリスト.csv> <設定.json>
```

### サンプルデータで試す

同梱のサンプルデータを使ってすぐに動作確認ができます：

```bash
# サンプルデータで実行
python joy2mulka.py sample/sample_entrylist.csv sample/config.json

# 出力先を指定する場合
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --output-dir output

# ランキング取得をスキップする場合（オフライン環境向け）
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --no-ranking
```

### 3. 出力ファイル確認

指定した出力フォルダに以下のファイルが生成されます：

```
出力フォルダ/
├── Startlist.csv          # Mulkaインポート用
├── Role_Startlist.csv     # スタッフ用（チェックイン欄付き）
├── Public_Startlist.tex   # 公開用LaTeX
├── Role_Startlist.tex     # 役員用LaTeX（ふりがな付き）
└── Class_Summary.csv      # クラス別人数
```

---

## コマンドラインオプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--no-ranking` | ランキング取得をスキップ | - |
| `--output-dir <パス>` | 出力先ディレクトリ | カレント |
| `--seed <数値>` | 乱数シード（再現性用） | - |

**実行例：**

```bash
python joy2mulka.py sample/sample_entrylist.csv sample/config.json --output-dir output
```

---

## 設定ファイル

### 基本構造

```json
{
    "output_folder": "Competition2024",
    "competition_name": "サンプル大会",
    "language": "ja",

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

### 設定項目

<details>
<summary><b>グローバル設定</b></summary>

| 項目 | 説明 | 例 |
|------|------|-----|
| `output_folder` | 出力フォルダ名 | `"Competition2024"` |
| `competition_name` | 大会名（LaTeX表示用） | `"第30回大会"` |
| `language` | 言語設定 | `"ja"` または `"en"` |

</details>

<details>
<summary><b>レーン設定</b></summary>

| 項目 | 説明 | 例 |
|------|------|-----|
| `start_time` | 開始時刻 | `"11:00"` |
| `classes` | クラス一覧 | `["M21A", "M20E"]` |
| `start_number` | 開始ナンバー | `1100` |
| `interval` | スタート間隔（分） | `2` |
| `affiliation_split` | 所属分離 | `true` |

</details>

<details>
<summary><b>クラス分割設定</b></summary>

| 項目 | 説明 | 例 |
|------|------|-----|
| `count` | 分割数 | `2` |
| `suffix_format` | 接尾辞形式 | `"A{}"` → M21A1, M21A2 |
| `use_ranking` | ランキング使用 | `true` |

</details>

---

## LaTeX出力について

### 必要条件

生成される `.tex` ファイルは **LuaLaTeX** でのコンパイルが必要です。

### Overleafでの使用方法

1. `.tex` ファイルをアップロード
2. **Menu** → **Settings** → **Compiler** を **LuaLaTeX** に変更
3. **Recompile** をクリック

### ローカル環境

```bash
lualatex Public_Startlist.tex
lualatex Role_Startlist.tex
```

### 必要パッケージ

- `ltjsarticle` - 日本語ドキュメントクラス
- `luatexja-ruby` - ふりがな表示
- `geometry`, `longtable`, `booktabs`, `fancyhdr`

---

## アルゴリズム

### クラス分割

```
ランキングあり選手:
  1位 → グループ1
  2位 → グループ2
  3位 → グループ1
  ...（剰余で配分）

ランキングなし選手:
  グループサイズが均等になるようランダム配分
```

### 所属分離

1. 選手をランダムシャッフル
2. 貪欲法で同一所属の連続を回避
3. 「/」「,」区切りは複数所属として処理
4. 末尾数字は無視（ClubA1 = ClubA）

---

## ファイル構成

```
JOY2Mulka/
├── joy2mulka.py           # メインプログラム
├── entry_parser.py        # エントリーリストパーサー
├── ranking_fetcher.py     # JOAランキング取得
├── startlist_generator.py # スタートリスト生成
├── output_formatter.py    # 出力フォーマッター
├── README.md              # このファイル（日本語）
├── README_en.md           # 英語版ドキュメント
└── sample/
    ├── config.json        # サンプル設定
    └── sample_entrylist.csv
```

---

## 注意事項

- 氏名の全角・半角スペースは自動正規化
- UTF-8（BOM付き）、Shift-JIS、EUC-JP対応
- タブ区切り・カンマ区切りCSV両対応

---

<div align="center">

**Made for Orienteering Competition Management**

</div>
