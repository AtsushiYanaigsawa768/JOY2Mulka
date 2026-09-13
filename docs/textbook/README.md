# 計算センター運営テキストブック

`Mulka2 / JOY2Mulka による計算センター運営テキストブック`（日本語・A4・119 ページ）の
LaTeX ソースです。

## フォルダ構成

```
docs/textbook/
├── main.pdf          本編（119 ページ）
├── practice.pdf      練習会版（24 ページ）
├── minimal.pdf       練習会 最小手順シート（A4 表裏 1 枚）
├── tex/              LaTeX ソース
├── image/            画像
└── tmp/              ビルドの中間ファイル（.aux / .log / .out / .toc）
```

PDF は 3 つとも textbook 直下に置く。ソースは `tex/`、画像は `image/`、
`.aux` などの中間ファイルは `tmp/` に出す（`tmp/` は追跡対象外）。

### `tex/`

| ファイル | 内容 |
|---|---|
| `main.tex` | 本編。プリアンブル（体裁・ボックス・タグ・TikZ スタイル）と各部の読み込み |
| `map.tex` | 巻頭「全 Step 早見表」 |
| `lookup.tex` | 巻末「逆引き」（やりたいこと・起きたことから Step を引く） |
| `part0.tex` 〜 `part7.tex` | 本編の本文 |
| `practice.tex` | 練習会版（自己完結。プリアンブルも持つ） |
| `minimal.tex` | 最小手順シート（自己完結） |

### `image/`

| フォルダ | 内容 | 追跡 |
|---|---|---|
| `image/joy2mulka/` | JOY2Mulka の画面 13 点 | する |
| `image/mulka2/` | Mulka2 公式マニュアルからの引用 6 点 | **しない** |
| `image/siconfig/` | SI Config+ のマニュアルからの引用 5 点 | **しない** |

## 成果物

3 段階に分かれています。用途に応じて使い分けます。

| ファイル | 内容 |
|---|---|
| `main.pdf` | 本編・完成版 PDF（119 ページ） |
| `practice.pdf` | **練習会版**（24 ページ）。本編と同じ粒度で、練習会に必要な範囲だけを書いたもの |
| `minimal.pdf` | **練習会 最小手順シート**（A4 表裏 1 枚）。当日持ち歩き用 |

## 構成

| 部 | 内容 |
|---|---|
| 第 0 部 | 計センとは（責任範囲・他パートとの受け渡し・EMIT/SI/SIAC の違い・計時精度） |
| 第 1 部 | 事前準備（Step 1〜16）。2 系統に分けた構成 |
| 第 2 部 | 前日準備（Step 17〜21） |
| 第 3 部 | 当日運営（Step 22〜37） |
| 第 4 部 | 事後処理（Step 38〜43） |
| 第 5 部 | 用途別の運営パターン（ランキング大会／練習会・フリースタート／リレー／スプリント／複数日／ゴール計セン） |
| 第 6 部 | チェックリスト集（CL-1〜CL-8・印刷用） |
| 第 7 部 | 逆引き索引 |
| 第 8 部 | 用語集＋ソフトウェア・資料の入手先 |

第 1 部の 2 系統：

- 準備 1 = Mulka2 のイベントの準備（Step 2〜8）
- 準備 2 = エントリーリストの整形（Step 9〜13）
- 合流 = レンタルカード割り当て・実機照合（Step 14〜15）

巻頭に「全 Step 早見表」、巻末に「逆引き」があります。
分量が多いので、通読は最初の 1 回だけを想定し、以後は早見表と逆引きから引く構成です。

図解は TikZ による自作（34 点）。ほかに実画面のキャプチャ 24 点
（Mulka2 6・SI Config+ 5・JOY2Mulka 13）。
本文の例に出てくる人名・所属・カード番号・ゼッケン番号・時刻は、すべて架空のダミーデータです。
引用したキャプチャの扱いは「画像について」を参照。

## ビルド

LuaLaTeX が必要です（`ltjsbook` / `luatexja-ruby` / `tikz` / `tcolorbox` / `longtable` / `booktabs`）。

**`tex/` の中で実行し、出力先を `../tmp` にする。** できた PDF を textbook 直下へコピーする。

```bash
cd docs/textbook/tex
lualatex -output-directory=../tmp main.tex
lualatex -output-directory=../tmp main.tex   # 目次・相互参照のため 2 回
lualatex -output-directory=../tmp practice.tex
lualatex -output-directory=../tmp minimal.tex
cp ../tmp/main.pdf ../tmp/practice.pdf ../tmp/minimal.pdf ..
```

`tex/` から実行するのは、`\input{part0}` と `\graphicspath{{../image/}}` が
カレントディレクトリ基準で解決されるため。textbook 直下から
`lualatex tex/main.tex` を実行すると `\input` が見つからない。

## 編集するときの約束

- Step は `\Step{タイトル}{タグ}` で書く。番号は自動採番なので、
  Step を挿入すると以降の番号がずれる。本文中の「Step 28 参照」のような
  相互参照も手で直すこと（`perl -i -pe 's/Step (\d+)/.../ge'` で一括処理できる）。
- 各 Step は `Goal` → 手順 → `Done` → `Fail`（つまずきやすいところ）の 4 ブロック。
  第 5 部は Step ではなくパターン単位なので `GoalC` を使う。
- **JOY2Mulka の操作は `J2M` 環境**（青いボックス「JOY2Mulka を使う場合」）で
  該当 Step の中に置く。独立章にはしない。
- タグは `\tSI` `\tEMIT` `\tSIAC` `\tRANK` `\tPRAC` `\tRELAY` `\tALL`。
- 表の段落列は `p{}` ではなく `P{}`（左揃え）を使う。和文が間延びしない。
- 第 5 部の「標準との違い」表は `PatTable` 環境（ページをまたげる longtable）。
- メニュー名が不確かなときは `\ver`（「画面上の表記はバージョンにより異なる」）を添える。

### 文体

- 断定と手順に徹し、`必ず` `絶対に` `〜してください` の多用を避ける。
  読み手を急かす表現・上から目線の表現は使わない。
- 失敗の話は「読者が失敗する」ではなく「過去にこう起きた／こう対処する」と書く。

### スクリプトで一括置換するときの注意

- **Bash のヒアドキュメント**（`cat >> file <<'EOF'`）は、環境によって
  `\\`（TikZ の改行）を `\` に潰す。追記・置換は Write/Edit か、
  パターンに `\\` を含めない perl で行う。
- **perl の区切り文字に `|` を使わない。** Markdown の表や LaTeX の
  `\multicolumn` に含まれる `|` とぶつかる（この README を一度壊した）。
- **全角記号を挟んだ `\quad／\quad` は `Undefined control sequence` になる**ことがある。
  区切りに全角記号を使わず、`\\` で改行するか半角の区切りにする（`minimal.tex` で発生）。
  また、この環境の bash から perl へ渡す全角文字は化けるので、
  全角を含む置換は Edit ツールで行う。

## JOY2Mulka の操作をどこに書いたか

独立章をやめ、各 Step の `J2M` ボックスに融合した。対応は次のとおり。

| JOY2Mulka の画面 | 融合先 |
|---|---|
| メニュー（3 モード） | Step 2（機材と消耗品） |
| Step 0 アップロード・大会設定・出力モード | Step 9（エントリーリストの整形） |
| Step 3 競技者番号の取得 | Step 9 |
| ゼッケン番号の計算式 | Step 10（ゼッケン番号の設計） |
| Step 1 クラス分割／Step 2 レーン配置 | Step 11（レーン割） |
| Step 3 制約設定／Step 4 生成・競合警告 | Step 12（シャッフル） |
| Step 3 テンプレート／Done ダウンロード／修正モード／更新モード | Step 13（スタートリスト 4 種） |
| 修正モード（当日版の作り直し） | Step 28（当日版のリストを配る） |
| 練習会モード | 第 5 部 5.2（練習会・フリースタート） |

## サンプルデータ

本文から URL で参照しているサンプルは、リポジトリの `sample/` に置いてある。
一覧は [`sample/README.md`](../../sample/README.md)。

| フォルダ | 内容 | 参照している場所 |
|---|---|---|
| `sample/normal/` | `Course.csv` / `Class.csv` / `Startlist.csv` | Step 5・6・9・10 |
| `sample/relay/` | `RelayClass.csv` / `RelayTeam.csv` / `Startlist.csv` / `Course.csv` | 第 5 部 5.3 |
| `sample/role/` | 役職別スタートリスト 7 種（`.csv` と `.tex`） | Step 13 |

`sample/role/` は JOY2Mulka の実出力。`sample/normal/Startlist.csv` から生成したもので、
`.tex` は `lualatex` でそのままコンパイルできることを確認済み。

## ソフトウェアの入手先

第 8 部（用語集）の末尾に「ソフトウェア・資料の入手先」の表がある。
URL を変えたときはそこも直すこと。Mulka2・ラップセンター・SI Config+・
SI システム運営マニュアル・JOY2Mulka・JOA 競技者番号／ランキング・日本標準時。

## 画像について

### JOY2Mulka

`image/joy2mulka/` に実画面のキャプチャ 13 点。
`docs/manual/img/` から複製したもので、写っているのは
`sample/Startlist_anonymous.csv` の匿名サンプルデータ（テストクラブ／サンプルOLC／デモOLK など）。

### Mulka2 の画面キャプチャ

`image/mulka2/` に 6 点。**Mulka2 公式マニュアル（wiki）から取得したもの**で、
各図の下と巻末に出典 URL を表示している。

| ファイル名 | 画面 | 掲載箇所 |
|---|---|---|
| `eventmanager.png` | イベントマネージャ（ドロップ枠） | Step 9 |
| `nettime.png` | ネットワーク時計 | Step 24 |
| `comport.png` | COM ポート選択 | Step 30 |
| `readsound.png` | 読み取り音設定 | Step 30 |
| `penareport.png` | ペナレポートの例 | Step 31 |
| `noactivate.png` | NO ACTIVATE のカードデータ詳細 | Step 32 |

**人名が写っている画面は採用していない。** wiki には実在の参加者名を含む
スクリーンショットがあるため、選定時に 1 点ずつ確認した。
差し替える場合も同じ基準で確認すること。

再取得は wiki の `Special:FilePath/<ファイル名>` から。
GIF は LaTeX で扱えないので PNG に変換してから置く。
本文では `\mshot[幅]{ファイル名}{説明}{出典ページ名}` で貼る（出典行は自動）。

### SI Config+ の画面キャプチャ

`image/siconfig/` に 5 点。Step 8（SI Config+ の使い方）で使用。

| ファイル名 | 画面 |
|---|---|
| `cardread.png` | SI カード読込（ダイレクト） |
| `clock.png` | 時刻画面 |
| `setting_normal.png` | 通常のコントロール設定（CN・4 時間） |
| `setting_beacon.png` | **タッチフリー設定**（BC CN・12 時間） |
| `backup.png` | バックアップメモリの読み出し（ErrD の例） |

出典は「オリエンテーリング大会 SI システム運営マニュアル」rev.9.0
（オリエンテーリングクラブ サン・スーシ／大場隆夫）。
<https://sans-souci.jpn.org/sisystem/simanual/>

同資料は**著作権者により自由な複製・配布が認められている**（改変は不可）。
そのため画像は**トリミングせずそのまま**使っている。
撮影者の PC ユーザー名が小さく写り込んでいるが、改変しない方針のため残し、
巻末の「図版の出典」でその旨を断っている。

再取得は元 PDF から `pdfimages -png -f 8 -l 16 <PDF> si`。
本文では `\sishot[幅]{ファイル名}{説明}` で貼る（出典行は自動）。

### .gitignore

`image/mulka2/` と `image/siconfig/` は**第三者著作物のため追跡対象外**。
クローン直後は画像が無く、`\mshot` は「差し込み位置」の枠を表示する
（`\sishot` は何も出さない）。`tmp/` も `.gitkeep` 以外は追跡しない。

## 練習会版（`tex/practice.tex`）

練習会・フリースタート専用の版（24 ページ）。
本編とは独立した自己完結の LaTeX ファイルで、プリアンブルも持っている。

- 想定：参加者 100 名以下／PC 1 台／スタート時刻を決めない／当日申込が中心
- **本編と同じ粒度**で書く。Step は P1〜P20 で、各 Step は
  `Goal` → 手順 → `Done` → `Fail` の 4 ブロックをそろえる
- 構成：やること 3 つ → 全 Step 早見表 → 前日まで（P1〜P8）→ 当日（P9〜P17）
  → 終わったあと（P18〜P20）→ トラブル初動カード → 逆引き → チェックリスト
- タグは `\tALL` `\tSI` `\tEMIT` `\tSIAC`。Step の書式は `\Step[タグ]{タイトル}`
  （本編の `\Step{タイトル}{タグ}` とは引数の順が違う。タグ省略時は `\tALL`）
- JOY2Mulka の操作は本編と同じく `J2M` ボックスに置く（P6・P8）

本編の Step 番号を変更した場合は、`practice.tex` 内の参照も確認すること。

## 最小手順シート（`tex/minimal.tex`）

当日に机へ置く A4 表裏 1 枚。練習会版をさらに削ったもので、
持っていくもの・前日まで・当日の手順・困ったときの初動だけを載せている。
2 ページに収まっていることを、変更のたびに確かめること。
