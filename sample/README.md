# サンプルデータ

テキストブック（`docs/textbook/main.pdf`）から参照している、形式確認用のサンプルです。
**登場する人名・所属・カード番号・ゼッケン番号・時刻はすべて架空のもの**です。

リポジトリ: <https://github.com/AtsushiYanaigsawa768/JOY2Mulka>

## 文字コード（重要）

**Mulka2 に読ませる CSV は、文字コードが違うと認識されません。**
クラス名やコース名が文字化けする、ドロップしても何も起きない、という形で現れます。
中身は正しいのに読めないので、原因に気づきにくい失敗です。

| 項目 | 指定 |
|---|---|
| 文字コード | **UTF-8（BOM 付き）** |
| 改行 | **CRLF** |
| 区切り | コンマ |

`normal/` と `relay/` の CSV は、**JOY2Mulka が出力するのと同じこの形式**で保存してある。
JOY2Mulka の出力はそのまま Mulka2 に取り込めているので、
**サンプルをコピーして中身を差し替える**のがいちばん確実。

Excel で作り直すときは【名前を付けて保存】→**【CSV UTF-8（コンマ区切り）(*.csv)】**を選ぶ。
ただの【CSV（コンマ区切り）】は環境によって Shift_JIS になるので使わない。

確認は次のとおり（先頭 3 バイトが `efbbbf` なら BOM 付き）。

```bash
head -c 3 normal/Startlist.csv | od -An -tx1
```

`role/` の CSV は人が読む・Excel で開くためのものなので、この制約はない。

## 通常大会（リレー以外）— `normal/`

| ファイル | 内容 | 対応する Step |
|---|---|---|
| [`normal/Course.csv`](./normal/Course.csv) | コースデータ（コース／距離／登距離／コントロール数／S・各ポスト・F） | Step 5 |
| [`normal/Class.csv`](./normal/Class.csv) | クラスデータ（クラス／コース／入賞人数／競技時間） | Step 6 |
| [`normal/Startlist.csv`](./normal/Startlist.csv) | Mulka2 取り込み用スタートリスト | Step 9・13 |

読ませ方はいずれも、Mulka2 のイベントマネージャの**ドロップ枠**に入れて【適用】→【OK】。

`Course.csv` は**コースごとに列数が変わります**（コントロール数に応じて S から F まで）。
`35/36` のようにスラッシュで区切ると、どちらのユニットでも正解になります（ダブルコントロール）。

`Startlist.csv` のゼッケン番号は、テキストブック Step 10 の桁設計に合わせています。

| 番号帯 | 意味 |
|---|---|
| 1101〜 | 第 1 桁 1 ＝ コース A、第 2 桁 1 ＝ レーン 1 |
| 2201〜 | 第 1 桁 2 ＝ コース B、第 2 桁 2 ＝ レーン 2 |
| 3301〜 | 第 1 桁 3 ＝ コース C、第 2 桁 3 ＝ レーン 3 |
| 9001〜 | 当日申込用の空き行（名前だけ当日書き換える） |
| 9901〜 | 前走・試走（記録に混ざらないよう分離） |

## リレー — `relay/`

| ファイル | 内容 |
|---|---|
| [`relay/RelayClass.csv`](./relay/RelayClass.csv) | リレークラス名／走者数／スタート時刻／走順ごとの繰り上げ設定 |
| [`relay/RelayTeam.csv`](./relay/RelayTeam.csv) | クラス名／チーム番号／チーム名／所属／各走のスタートナンバー |
| [`relay/Startlist.csv`](./relay/Startlist.csv) | リレー用スタートリスト（個人戦とは列が違う） |
| [`relay/Course.csv`](./relay/Course.csv) | バリエーション a／b／c のコースデータ |

読み込む順番は `RelayClass` → `RelayTeam` → `Startlist`。

- スタート時刻は **1 走にだけ**入れます（2 走以降は前走者のフィニッシュ時刻）。
- ナンバーは「チーム番号 × 1000 ＋ 走順」。`1001` を見れば 1 チームの 1 走だと分かります。
- **メンバー交代・走順変更は、この CSV を直して読み込み直します**（第 5 部 5.3）。

## 役職用スタートリスト — `role/`

JOY2Mulka が出力する役職別スタートリストの実物です
（`sample/normal/Startlist.csv` から生成）。
役職ごとに**複数の並び順**を用意しています。当日は無線も携帯も通じないことがあり、
紙だけで人を特定する場面が出るためです。

| 役職 | ファイル | 並び／使いどころ |
|---|---|---|
| 救護 | [`Rescue_ByBib`](./role/Rescue_ByBib.csv) | ゼッケン番号順。全クラス通し |
| 救護 | [`Rescue_ByKana`](./role/Rescue_ByKana.csv) | ふりがな順。名前しか分からないとき |
| 救護 | [`Rescue_ByCard`](./role/Rescue_ByCard.csv) | カード番号順。拾得カードから人を特定するとき |
| スタート | [`Start_ByLaneTime`](./role/Start_ByLaneTime.csv) | レーン別・時刻順。**姓のふりがなを大きく**出した本番用 |
| スタート | [`Start_ByBib`](./role/Start_ByBib.csv) | ゼッケン番号順。遅刻・枠違いの確認用 |
| フィニッシュ | [`Finish_ByBib`](./role/Finish_ByBib.csv) | ゼッケン番号順。**ゼッケンを大きく**出し、帰還チェック欄付き |
| フィニッシュ | [`Finish_ByStartTime`](./role/Finish_ByStartTime.csv) | スタート時刻順。未帰還者を早い順に洗い出す用 |

それぞれ `.csv`（表計算ソフト用）と `.tex`（印刷用）があります。
`.tex` は LuaLaTeX でそのままコンパイルできます。

```bash
lualatex Finish_ByBib.tex
```

## そのほか

| ファイル | 内容 |
|---|---|
| `sample_entrylist.csv` | エントリーサイトから落とした生のエントリーリスト（匿名化済み） |
| `Startlist_anonymous.csv` | 匿名化した Mulka2 用スタートリスト |
| `config.json` | 旧 CLI 版の設定ファイル。レーンごとの `start_number` の指定例 |
| `Competition2024/` | 旧 CLI 版の出力例 |
