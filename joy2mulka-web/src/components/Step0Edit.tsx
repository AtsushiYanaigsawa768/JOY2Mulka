import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { StartListEntry } from '../types';
import { generateOutputFiles } from '../utils/outputFormatter';

/**
 * エントリーリストの修正画面。
 *
 * ここでの中心的な考え方は「スタート枠（スロット）」と「出走者」を分けること。
 * クラス内の No. と スタート時刻 は枠に固定されていて動かない。
 * 「1つ前へ」「先頭へ」などの操作は、枠はそのままに出走者だけを入れ替える。
 * その結果、ある人を同じクラスの前の方／後の方へ動かす操作が、
 * 他の人の時刻を壊さずに行える。
 */

/** 出走者（枠に入る中身） */
interface Occupant {
  name1: string;
  name2: string;
  affiliation: string;
  cardNumber: string;
  cardNote: string;
  joaNumber: string;
  isRental: boolean;
}

/** スタート枠 ＋ そこに入っている出走者 */
interface Slot extends Occupant {
  rowId: string;
  className: string;
  startNumber: number;
  startTime: string;
}

interface ParsedFile {
  slots: Slot[];
  classes: string[];
  fileName: string;
}

const EMPTY_OCCUPANT: Occupant = {
  name1: '',
  name2: '',
  affiliation: '',
  cardNumber: '',
  cardNote: '',
  joaNumber: '',
  isRental: false,
};

function takeOccupant(slot: Slot): Occupant {
  return {
    name1: slot.name1,
    name2: slot.name2,
    affiliation: slot.affiliation,
    cardNumber: slot.cardNumber,
    cardNote: slot.cardNote,
    joaNumber: slot.joaNumber,
    isRental: slot.isRental,
  };
}

function withOccupant(slot: Slot, occupant: Occupant): Slot {
  return { ...slot, ...occupant };
}

/** ヘッダー名から列番号を引く（Startlist.csv / Role_Startlist.csv 両対応） */
function buildHeaderIndex(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const key = (name || '').replace(/[\s　"]/g, '').replace(/１/g, '1').replace(/２/g, '2');
    if (key && !(key in index)) index[key] = i;
  });
  return index;
}

function pick(row: string[], index: Record<string, number>, ...names: string[]): string {
  for (const n of names) {
    if (n in index) {
      const v = row[index[n]];
      if (v !== undefined) return v;
    }
  }
  return '';
}

/** "HH:MM[:SS]" → 分。解釈できなければ null */
function timeToMinutes(t: string): number | null {
  const m = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export default function Step0Edit() {
  const { state, dispatch, goToStep } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [history, setHistory] = useState<Slot[][]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [swapAnchor, setSwapAnchor] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  /** 変更を1手として記録してから slots を書き換える（元に戻す用） */
  const commit = useCallback((next: (prev: Slot[]) => Slot[]) => {
    setSlots((prev) => {
      setHistory((h) => [...h.slice(-49), prev]);
      return next(prev);
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setSlots(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  // ------------------------------------------------------------------
  // 読み込み
  // ------------------------------------------------------------------

  const parseCsvText = useCallback(
    (csvContent: string, fileName: string): boolean => {
      let text = csvContent;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

      const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      if (result.errors.length > 0) {
        dispatch({ type: 'SET_ERROR', payload: `CSV解析エラー: ${result.errors[0].message}` });
        return false;
      }

      const rows = result.data;
      if (rows.length < 2) {
        dispatch({ type: 'SET_ERROR', payload: 'CSVにデータがありません' });
        return false;
      }

      // 列はヘッダー名で対応づける。Startlist.csv と Role_Startlist.csv は
      // 列の並びが違うため、位置決め打ちだと役員用を読んだときに壊れる。
      const index = buildHeaderIndex(rows[0]);
      const parsedSlots: Slot[] = rows.slice(1).map((row, i) => {
        const cardNote = pick(row, index, 'カード備考', '備考');
        return {
          rowId: `row-${i}`,
          className: pick(row, index, 'クラス'),
          startNumber: parseInt(pick(row, index, 'スタートナンバー', 'No.')) || 0,
          name1: pick(row, index, '氏名1', '氏名'),
          name2: pick(row, index, '氏名2'),
          affiliation: pick(row, index, '所属') || '-',
          startTime: pick(row, index, 'スタート時刻', '時刻'),
          cardNumber: pick(row, index, 'カード番号'),
          cardNote,
          joaNumber: pick(row, index, '競技者登録番号'),
          isRental: cardNote.includes('レンタル'),
        };
      });

      // クラス内はスタート時刻順（＝枠の順）に並べておく
      parsedSlots.sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          a.startTime.localeCompare(b.startTime) ||
          a.startNumber - b.startNumber
      );

      const classes = [...new Set(parsedSlots.map((s) => s.className))].sort();

      setParsed({ slots: parsedSlots, classes, fileName });
      setSlots(parsedSlots);
      setHistory([]);
      setSelectedClass(classes[0] || null);
      return true;
    },
    [dispatch]
  );

  const loadFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      dispatch({ type: 'SET_ERROR', payload: null });
      try {
        if (file.name.toLowerCase().endsWith('.csv')) {
          parseCsvText(await file.text(), file.name);
          return;
        }

        const zip = await JSZip.loadAsync(file);
        let csvContent = '';
        let fileName = '';

        for (const [name, zipEntry] of Object.entries(zip.files)) {
          if (
            name.endsWith('Startlist.csv') &&
            !name.includes('Role_') &&
            !name.includes('Class_Summary')
          ) {
            csvContent = await zipEntry.async('string');
            fileName = name;
            break;
          }
        }
        if (!csvContent) {
          for (const [name, zipEntry] of Object.entries(zip.files)) {
            if (name.includes('Role_Startlist.csv')) {
              csvContent = await zipEntry.async('string');
              fileName = name;
              break;
            }
          }
        }
        if (!csvContent) {
          dispatch({
            type: 'SET_ERROR',
            payload: 'ZIPファイルに Startlist.csv が見つかりません',
          });
          return;
        }
        parseCsvText(csvContent, fileName);
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: `ファイル読み込みエラー: ${error}` });
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, parseCsvText]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = Array.from(e.dataTransfer.files).find(
        (f) => f.name.endsWith('.zip') || f.name.toLowerCase().endsWith('.csv')
      );
      if (file) loadFile(file);
      else
        dispatch({
          type: 'SET_ERROR',
          payload: '.zip または .csv ファイルをアップロードしてください',
        });
    },
    [loadFile, dispatch]
  );

  // ------------------------------------------------------------------
  // 編集操作
  // ------------------------------------------------------------------

  /** 表示中クラスの行（枠の順） */
  const classSlots = useMemo(
    () => slots.filter((s) => s.className === selectedClass),
    [slots, selectedClass]
  );

  const editField = useCallback(
    (rowId: string, field: keyof Slot, value: string | number | boolean) => {
      commit((prev) =>
        prev.map((s) => (s.rowId === rowId ? { ...s, [field]: value } : s))
      );
    },
    [commit]
  );

  /**
   * クラス内で出走者を position 番目（0始まり）へ移動する。
   * 間の出走者は1つずつ繰り上げ／繰り下げ、枠（No.・時刻）は動かさない。
   */
  const moveTo = useCallback(
    (rowId: string, target: number) => {
      commit((prev) => {
        const cls = prev.find((s) => s.rowId === rowId)?.className;
        if (!cls) return prev;

        const idxs = prev.reduce<number[]>((acc, s, i) => {
          if (s.className === cls) acc.push(i);
          return acc;
        }, []);
        const from = idxs.findIndex((i) => prev[i].rowId === rowId);
        const to = Math.max(0, Math.min(idxs.length - 1, target));
        if (from === -1 || from === to) return prev;

        // クラス内の出走者だけを並び替え、枠には順に入れ直す
        const occupants = idxs.map((i) => takeOccupant(prev[i]));
        const [moved] = occupants.splice(from, 1);
        occupants.splice(to, 0, moved);

        const next = [...prev];
        idxs.forEach((slotIdx, k) => {
          next[slotIdx] = withOccupant(prev[slotIdx], occupants[k]);
        });
        return next;
      });
      setHighlightId(rowId);
    },
    [commit]
  );

  const moveBy = useCallback(
    (rowId: string, delta: number) => {
      const pos = classSlots.findIndex((s) => s.rowId === rowId);
      if (pos === -1) return;
      moveTo(rowId, pos + delta);
    },
    [classSlots, moveTo]
  );

  /** 選んだ2人のスタート時刻・No.（＝枠）を入れ替える */
  const swapWith = useCallback(
    (rowIdA: string, rowIdB: string) => {
      commit((prev) => {
        const a = prev.find((s) => s.rowId === rowIdA);
        const b = prev.find((s) => s.rowId === rowIdB);
        if (!a || !b) return prev;
        const occA = takeOccupant(a);
        const occB = takeOccupant(b);
        return prev.map((s) => {
          if (s.rowId === rowIdA) return withOccupant(s, occB);
          if (s.rowId === rowIdB) return withOccupant(s, occA);
          return s;
        });
      });
      setSwapAnchor(null);
    },
    [commit]
  );

  /** 出走者を削除し、後続を1つずつ繰り上げて、末尾の枠を取り除く */
  const removeRunner = useCallback(
    (rowId: string) => {
      commit((prev) => {
        const cls = prev.find((s) => s.rowId === rowId)?.className;
        if (!cls) return prev;

        const idxs = prev.reduce<number[]>((acc, s, i) => {
          if (s.className === cls) acc.push(i);
          return acc;
        }, []);
        const from = idxs.findIndex((i) => prev[i].rowId === rowId);
        if (from === -1) return prev;

        const occupants = idxs.map((i) => takeOccupant(prev[i]));
        occupants.splice(from, 1);

        const lastSlotIdx = idxs[idxs.length - 1];
        const next = prev
          .map((s, i) => {
            const k = idxs.indexOf(i);
            if (k === -1 || k >= occupants.length) return s;
            return withOccupant(s, occupants[k]);
          })
          .filter((_, i) => i !== lastSlotIdx);
        return next;
      });
    },
    [commit]
  );

  /** クラス末尾に枠を1つ足す（当日エントリーなど） */
  const appendSlot = useCallback(() => {
    if (!selectedClass) return;
    commit((prev) => {
      const clsSlots = prev.filter((s) => s.className === selectedClass);
      const last = clsSlots[clsSlots.length - 1];
      const prevLast = clsSlots[clsSlots.length - 2];

      let startTime = '';
      if (last) {
        const lastMin = timeToMinutes(last.startTime);
        const prevMin = prevLast ? timeToMinutes(prevLast.startTime) : null;
        const interval = lastMin !== null && prevMin !== null ? lastMin - prevMin : 1;
        if (lastMin !== null) startTime = minutesToTime(lastMin + Math.max(1, interval));
      }

      const newSlot: Slot = {
        ...EMPTY_OCCUPANT,
        rowId: `row-new-${Date.now()}`,
        className: selectedClass,
        startNumber: last ? last.startNumber + 1 : 0,
        startTime,
        affiliation: '-',
      };

      const lastIdx = prev.map((s) => s.className).lastIndexOf(selectedClass);
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newSlot);
      return next;
    });
  }, [selectedClass, commit]);

  // ------------------------------------------------------------------
  // 検索
  // ------------------------------------------------------------------

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return slots
      .filter(
        (s) =>
          s.name1.toLowerCase().includes(q) ||
          s.name2.toLowerCase().includes(q) ||
          s.affiliation.toLowerCase().includes(q) ||
          s.cardNumber.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [slots, searchQuery]);

  const jumpTo = useCallback((slot: Slot) => {
    setSelectedClass(slot.className);
    setHighlightId(slot.rowId);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const el = rowRefs.current[highlightId];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightId, selectedClass]);

  // ------------------------------------------------------------------
  // 変更点の集計
  // ------------------------------------------------------------------

  const changedCount = useMemo(() => {
    if (!parsed) return 0;
    const original = new Map(parsed.slots.map((s) => [s.rowId, s]));
    let changed = 0;
    for (const s of slots) {
      const o = original.get(s.rowId);
      if (!o) {
        changed++;
        continue;
      }
      if (
        o.name1 !== s.name1 ||
        o.name2 !== s.name2 ||
        o.affiliation !== s.affiliation ||
        o.cardNumber !== s.cardNumber ||
        o.startTime !== s.startTime ||
        o.startNumber !== s.startNumber ||
        o.isRental !== s.isRental
      ) {
        changed++;
      }
    }
    return changed + (parsed.slots.length - slots.length > 0 ? parsed.slots.length - slots.length : 0);
  }, [parsed, slots]);

  const isChanged = useCallback(
    (slot: Slot) => {
      if (!parsed) return false;
      const o = parsed.slots.find((s) => s.rowId === slot.rowId);
      if (!o) return true;
      return (
        o.name1 !== slot.name1 ||
        o.name2 !== slot.name2 ||
        o.affiliation !== slot.affiliation ||
        o.cardNumber !== slot.cardNumber ||
        o.startTime !== slot.startTime ||
        o.startNumber !== slot.startNumber ||
        o.isRental !== slot.isRental
      );
    },
    [parsed]
  );

  // ------------------------------------------------------------------
  // 出力
  // ------------------------------------------------------------------

  const handleProceedToDownload = async () => {
    setIsLoading(true);
    try {
      const startList: StartListEntry[] = slots.map((s) => ({
        className: s.className,
        startNumber: s.startNumber,
        name1: s.name1,
        name2: s.name2,
        affiliation: s.affiliation || '-',
        startTime: s.startTime,
        cardNumber: s.cardNumber,
        cardNote: s.isRental || !s.cardNumber ? 'レンタル' : 'my card',
        joaNumber: s.joaNumber,
        isRental: s.isRental || !s.cardNumber,
        lane: '',
        startArea: '',
      }));

      dispatch({ type: 'SET_START_LIST', payload: startList });
      const outputFiles = await generateOutputFiles(startList, state.globalSettings);
      dispatch({ type: 'SET_OUTPUT_FILES', payload: outputFiles });
      dispatch({ type: 'SET_STEP', payload: 'done' });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : '出力ファイル生成に失敗しました',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // 画面
  // ------------------------------------------------------------------

  if (!parsed) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">エントリーリストの修正</h2>
        <div className="mb-4 text-sm text-gray-600">
          既存のスタートリストを読み込んで修正します。
          生成時にダウンロードした <code className="bg-gray-100 px-1 rounded">.zip</code> か、
          <code className="bg-gray-100 px-1 rounded">Startlist.csv</code> /{' '}
          <code className="bg-gray-100 px-1 rounded">Role_Startlist.csv</code> をそのまま使えます。
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          } ${isLoading ? 'opacity-50' : ''}`}
        >
          <div className="text-5xl mb-4">📦</div>
          <p className="text-lg text-gray-700 mb-2">ZIP / CSV ファイルをドロップ</p>
          <p className="text-sm text-gray-500 mb-4">または</p>
          <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
            ファイルを選択
            <input
              type="file"
              accept=".zip,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(file);
              }}
              disabled={isLoading}
            />
          </label>
          {isLoading && <div className="mt-4 text-blue-600">読み込み中...</div>}
        </div>

        <div className="mt-6">
          <button
            onClick={() => goToStep('menu')}
            className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
          >
            ← メニューに戻る
          </button>
        </div>
      </div>
    );
  }

  const swapAnchorSlot = swapAnchor ? slots.find((s) => s.rowId === swapAnchor) : null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">エントリーリストの修正</h2>
          <p className="text-sm text-gray-500 mt-1">
            {parsed.fileName} ／ 全 {slots.length}名 ／ {parsed.classes.length}クラス
            {changedCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">変更 {changedCount}件</span>
            )}
          </p>
        </div>
        <button
          onClick={undo}
          disabled={history.length === 0}
          className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
            history.length === 0
              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          ↩ 元に戻す{history.length > 0 ? `（${history.length}）` : ''}
        </button>
      </div>

      {/* 検索 */}
      <div className="mb-5 relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="名前・所属・カード番号で全クラスから検索…"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
            {searchResults.map((s) => (
              <li key={s.rowId}>
                <button
                  onClick={() => jumpTo(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-3"
                >
                  <span className="font-mono text-xs text-gray-500 w-20 shrink-0">
                    {s.className}
                  </span>
                  <span className="font-medium">{s.name1}</span>
                  <span className="text-gray-500 truncate">{s.affiliation}</span>
                  <span className="ml-auto font-mono text-xs text-gray-500 shrink-0">
                    {s.startTime}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* クラス選択 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">クラス</label>
        <div className="flex flex-wrap gap-2">
          {parsed.classes.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedClass === cls
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cls} ({slots.filter((s) => s.className === cls).length})
            </button>
          ))}
        </div>
      </div>

      {/* 操作の説明 */}
      <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <span className="font-medium">スタート時刻は枠に固定されています。</span>{' '}
        「▲」「▼」「先頭」「最後」「順」で出走者だけが前後に動き、時刻と No. はその場に残ります。
        <span className="mx-1">／</span>
        <span className="font-medium">⇄</span> を2人に押すと、その2人のスタート時刻を入れ替えます。
      </div>

      {swapAnchorSlot && (
        <div className="mb-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center justify-between">
          <span>
            <span className="font-medium">{swapAnchorSlot.name1}</span>（
            {swapAnchorSlot.startTime}）と入れ替える相手の <span className="font-medium">⇄</span>{' '}
            を押してください
          </span>
          <button
            onClick={() => setSwapAnchor(null)}
            className="text-amber-700 hover:text-amber-900 font-medium"
          >
            取り消し
          </button>
        </div>
      )}

      {/* 一覧 */}
      {selectedClass && (
        <div className="mb-6 border rounded-lg overflow-hidden">
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-12">順</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">No.</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">時刻</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">ふりがな</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">所属</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">カード</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 whitespace-nowrap">
                    レンタル
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classSlots.map((slot, idx) => {
                  const changed = isChanged(slot);
                  const highlighted = highlightId === slot.rowId;
                  const isAnchor = swapAnchor === slot.rowId;
                  return (
                    <tr
                      key={slot.rowId}
                      ref={(el) => {
                        rowRefs.current[slot.rowId] = el;
                      }}
                      className={
                        highlighted
                          ? 'bg-yellow-100'
                          : isAnchor
                          ? 'bg-amber-50'
                          : changed
                          ? 'bg-amber-50/40'
                          : 'hover:bg-gray-50'
                      }
                    >
                      <td className="px-2 py-2 text-sm text-gray-500">
                        {idx + 1}
                        {changed && <span className="ml-1 text-amber-500">•</span>}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          value={slot.startNumber}
                          onChange={(e) =>
                            editField(slot.rowId, 'startNumber', parseInt(e.target.value) || 0)
                          }
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={slot.startTime}
                          onChange={(e) => editField(slot.rowId, 'startTime', e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={slot.name1}
                          onChange={(e) => editField(slot.rowId, 'name1', e.target.value)}
                          className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={slot.name2}
                          onChange={(e) => editField(slot.rowId, 'name2', e.target.value)}
                          className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={slot.affiliation}
                          onChange={(e) => editField(slot.rowId, 'affiliation', e.target.value)}
                          className="w-36 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={slot.cardNumber}
                          onChange={(e) => editField(slot.rowId, 'cardNumber', e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={slot.isRental}
                          onChange={(e) => editField(slot.rowId, 'isRental', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <IconButton
                            label="▲"
                            title="1つ前へ（時刻はそのまま、前の人と入れ替え）"
                            disabled={idx === 0}
                            onClick={() => moveBy(slot.rowId, -1)}
                          />
                          <IconButton
                            label="▼"
                            title="1つ後へ"
                            disabled={idx === classSlots.length - 1}
                            onClick={() => moveBy(slot.rowId, 1)}
                          />
                          <IconButton
                            label="先頭"
                            title="クラスの先頭へ"
                            disabled={idx === 0}
                            onClick={() => moveTo(slot.rowId, 0)}
                          />
                          <IconButton
                            label="最後"
                            title="クラスの最後へ"
                            disabled={idx === classSlots.length - 1}
                            onClick={() => moveTo(slot.rowId, classSlots.length - 1)}
                          />
                          <input
                            type="number"
                            min={1}
                            max={classSlots.length}
                            placeholder="順"
                            title="移動先の順番を入力して Enter"
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              const v = parseInt((e.target as HTMLInputElement).value);
                              if (!isNaN(v)) moveTo(slot.rowId, v - 1);
                              (e.target as HTMLInputElement).value = '';
                            }}
                            className="w-14 border border-gray-300 rounded px-1 py-1 text-sm"
                          />
                          <IconButton
                            label="⇄"
                            title={
                              isAnchor
                                ? '入れ替えを取り消す'
                                : swapAnchor
                                ? 'この人と時刻を入れ替える'
                                : '入れ替えの相手として選ぶ'
                            }
                            active={isAnchor}
                            onClick={() => {
                              if (isAnchor) setSwapAnchor(null);
                              else if (swapAnchor) swapWith(swapAnchor, slot.rowId);
                              else setSwapAnchor(slot.rowId);
                            }}
                          />
                          <IconButton
                            label="×"
                            title="この出走者を削除（以降の人を1つずつ繰り上げ）"
                            danger
                            onClick={() => {
                              if (
                                confirm(
                                  `${slot.name1 || 'この行'} を削除します。\n以降の出走者が1つずつ早い時刻に繰り上がります。`
                                )
                              ) {
                                removeRunner(slot.rowId);
                              }
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t bg-gray-50 px-3 py-2">
            <button
              onClick={appendSlot}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              ＋ このクラスの最後に1行追加
            </button>
          </div>
        </div>
      )}

      {/* ナビゲーション */}
      <div className="flex justify-between">
        <button
          onClick={() => {
            if (changedCount === 0 || confirm('変更は破棄されます。よろしいですか？')) {
              setParsed(null);
              setSlots([]);
              setHistory([]);
              setSelectedClass(null);
            }
          }}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 別のファイルを選択
        </button>
        <button
          onClick={handleProceedToDownload}
          disabled={isLoading}
          className={`px-6 py-2 rounded-md font-medium ${
            isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoading ? '生成中...' : 'ダウンロード画面へ →'}
        </button>
      </div>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}

function IconButton({ label, title, onClick, disabled, danger, active }: IconButtonProps) {
  const base = 'px-2 py-1 text-xs rounded border transition-colors whitespace-nowrap';
  const cls = disabled
    ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
    : active
    ? 'border-amber-500 bg-amber-500 text-white'
    : danger
    ? 'border-red-200 text-red-600 hover:bg-red-50'
    : 'border-gray-300 text-gray-700 hover:bg-gray-100';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${cls}`}
    >
      {label}
    </button>
  );
}
