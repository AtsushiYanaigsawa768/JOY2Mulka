import { useState, useEffect, useMemo } from 'react';
import { Entry } from '../types';
import { normalizeWhitespace, parseAffiliation } from '../utils/csvParser';

/**
 * Simple column mapping for non-JOY entry lists
 * Each row = one entry (no participant grouping)
 */
export interface SimpleColumnMapping {
  class: number | null;
  name1: number | null;
  name2: number | null;
  affiliation: number | null;
  cardNumber: number | null;
  joaNumber: number | null;
  gender: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entries: Entry[]) => void;
  data: string[][];
  columnNames: string[];
  existingEntryCount: number;
}

const FIELD_LABELS: { [key in keyof SimpleColumnMapping]: string } = {
  class: 'クラス',
  name1: '氏名1 (漢字)',
  name2: '氏名2 (かな)',
  affiliation: '所属',
  cardNumber: 'カード番号',
  joaNumber: 'JOA競技者番号',
  gender: '性別',
};

const REQUIRED_FIELDS: (keyof SimpleColumnMapping)[] = ['class', 'name1'];

export default function ColumnMappingModal({
  isOpen,
  onClose,
  onConfirm,
  data,
  columnNames,
  existingEntryCount,
}: Props) {
  const [mapping, setMapping] = useState<SimpleColumnMapping>({
    class: null,
    name1: null,
    name2: null,
    affiliation: null,
    cardNumber: null,
    joaNumber: null,
    gender: null,
  });

  // Auto-detect columns on mount
  useEffect(() => {
    if (columnNames.length === 0) return;

    const newMapping: SimpleColumnMapping = {
      class: null,
      name1: null,
      name2: null,
      affiliation: null,
      cardNumber: null,
      joaNumber: null,
      gender: null,
    };

    columnNames.forEach((col, idx) => {
      const colLower = col.toLowerCase();
      const colNorm = normalizeWhitespace(col);

      // Class detection
      if (colNorm === 'クラス' || colLower === 'class') {
        if (newMapping.class === null) newMapping.class = idx;
      }
      // Name1 detection
      else if (colNorm === '氏名' || colNorm === '氏名1' || colNorm === '名前' || colLower === 'name' || colLower === 'name1') {
        if (newMapping.name1 === null) newMapping.name1 = idx;
      }
      // Name2 detection
      else if (colNorm === '氏名2' || colNorm === 'ふりがな' || colNorm === 'フリガナ' || colLower === 'name2' || colLower === 'kana') {
        if (newMapping.name2 === null) newMapping.name2 = idx;
      }
      // Affiliation detection
      else if (colNorm === '所属' || colNorm === 'クラブ' || colNorm === 'チーム' || colLower === 'club' || colLower === 'team' || colLower === 'affiliation') {
        if (newMapping.affiliation === null) newMapping.affiliation = idx;
      }
      // Card number detection
      else if (colNorm.includes('カード') || colNorm.includes('SI') || colNorm.includes('Eカード') || colLower.includes('card') || colLower.includes('si')) {
        if (newMapping.cardNumber === null) newMapping.cardNumber = idx;
      }
      // JOA number detection
      else if (colNorm.includes('JOA') || colNorm.includes('競技者番号') || colLower.includes('joa')) {
        if (newMapping.joaNumber === null) newMapping.joaNumber = idx;
      }
      // Gender detection
      else if (colNorm === '性別' || colLower === 'gender' || colLower === 'sex') {
        if (newMapping.gender === null) newMapping.gender = idx;
      }
    });

    setMapping(newMapping);
  }, [columnNames]);

  // Parse entries based on current mapping
  const parsedEntries = useMemo(() => {
    if (mapping.class === null || mapping.name1 === null) {
      return [];
    }

    const entries: Entry[] = [];
    let entryId = existingEntryCount;

    const safeGet = (row: string[], idx: number | null): string => {
      if (idx === null || idx >= row.length) return '';
      const val = row[idx];
      return val ? normalizeWhitespace(val) : '';
    };

    for (let rowNum = 0; rowNum < data.length; rowNum++) {
      const row = data[rowNum];
      if (!row || row.every((cell) => !cell.trim())) {
        continue;
      }

      const className = safeGet(row, mapping.class);
      const name1 = safeGet(row, mapping.name1);

      // Skip rows without required fields
      if (!className || !name1) {
        continue;
      }

      const affiliation = safeGet(row, mapping.affiliation);
      const affiliations = parseAffiliation(affiliation);

      entries.push({
        id: `entry-${entryId++}`,
        className,
        name1,
        name2: safeGet(row, mapping.name2),
        affiliation: affiliation && affiliation !== '-' ? affiliation : '',
        affiliations,
        cardNumber: safeGet(row, mapping.cardNumber),
        joaNumber: safeGet(row, mapping.joaNumber),
        isRental: false,
        gender: safeGet(row, mapping.gender),
        rowNumber: rowNum + 2, // 1-indexed, after header row
        participantNumber: 1,
      });
    }

    return entries;
  }, [data, mapping, existingEntryCount]);

  const canConfirm = mapping.class !== null && mapping.name1 !== null && parsedEntries.length > 0;

  const handleFieldChange = (field: keyof SimpleColumnMapping, value: string) => {
    const newVal = value === '' ? null : parseInt(value);
    setMapping((prev) => ({ ...prev, [field]: newVal }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold">カラムマッピング設定</h2>
          <p className="text-sm text-gray-600">CSVの列をエントリー項目に対応させてください</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Column Mapping */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">カラム対応設定</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(Object.keys(FIELD_LABELS) as (keyof SimpleColumnMapping)[]).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${
                      REQUIRED_FIELDS.includes(field) && mapping[field] === null
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <option value="">-- 未選択 --</option>
                    {columnNames.map((col, idx) => (
                      <option key={idx} value={idx}>
                        {col || `列${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-4">
            <h3 className="font-medium mb-2">
              プレビュー
              {parsedEntries.length > 0 && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({parsedEntries.length}件検出)
                </span>
              )}
            </h3>
            {parsedEntries.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
                必須項目（クラス、氏名1）を設定してください
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">#</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">クラス</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">氏名1</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">氏名2</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">所属</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">カード</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">JOA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsedEntries.slice(0, 20).map((entry, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1">{entry.className}</td>
                        <td className="px-2 py-1">{entry.name1}</td>
                        <td className="px-2 py-1">{entry.name2 || '-'}</td>
                        <td className="px-2 py-1 truncate max-w-32">{entry.affiliation || '-'}</td>
                        <td className="px-2 py-1">{entry.cardNumber || '-'}</td>
                        <td className="px-2 py-1">{entry.joaNumber || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedEntries.length > 20 && (
                  <div className="p-2 text-center text-sm text-gray-500 bg-gray-50">
                    他 {parsedEntries.length - 20} 件...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Original Data Preview */}
          <div>
            <h3 className="font-medium mb-2">元データ (最初の10行)</h3>
            <div className="overflow-x-auto border rounded-lg max-h-48 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">#</th>
                    {columnNames.slice(0, 10).map((col, i) => (
                      <th key={i} className="px-2 py-1 text-left text-xs font-medium text-gray-500 truncate max-w-32">
                        {col || `列${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                      {row.slice(0, 10).map((cell, j) => (
                        <td key={j} className="px-2 py-1 truncate max-w-32" title={cell}>
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            {existingEntryCount > 0 && `既存: ${existingEntryCount}件 + `}
            追加: {parsedEntries.length}件
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
            >
              キャンセル
            </button>
            <button
              onClick={() => onConfirm(parsedEntries)}
              disabled={!canConfirm}
              className={`px-4 py-2 rounded-md font-medium ${
                canConfirm
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              インポート
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
