import { useApp } from '../context/AppContext';
import { downloadOutputFile, downloadAllAsZip, downloadFile, SingleFileKey } from '../utils/fileDownloader';

type FileKey = SingleFileKey;

interface FileInfo {
  key: FileKey;
  name: string;
  description: string;
  icon: string;
}

export default function DoneScreen() {
  const { state, goToStep } = useApp();

  const files: FileInfo[] = [
    {
      key: 'mulkaCsv',
      name: 'Startlist.csv',
      description: 'Mulka用スタートリスト（インポート用）',
      icon: '📊',
    },
    {
      key: 'roleCsv',
      name: 'Role_Startlist.csv',
      description: '役員用スタートリスト（チェックイン欄付き）',
      icon: '📋',
    },
    {
      key: 'publicTex',
      name: 'Public_Startlist.tex',
      description: '公開用スタートリスト（LaTeX）',
      icon: '📄',
    },
    {
      key: 'roleTex',
      name: 'Role_Startlist.tex',
      description: '役員用スタートリスト（ふりがな付きLaTeX）',
      icon: '📝',
    },
    {
      key: 'publicDocx',
      name: 'Public_Startlist.docx',
      description: '公開用スタートリスト（Word形式）',
      icon: '📃',
    },
    {
      key: 'roleDocx',
      name: 'Role_Startlist.docx',
      description: '役員用スタートリスト（ふりがな付きWord形式）',
      icon: '🗒️',
    },
    {
      key: 'classSummaryCsv',
      name: 'Class_Summary.csv',
      description: 'クラス別人数集計',
      icon: '📈',
    },
  ];

  const handleDownload = (fileKey: FileKey) => {
    if (state.outputFiles) {
      downloadOutputFile(fileKey, state.outputFiles, state.globalSettings);
    }
  };

  const handleDownloadAll = async () => {
    if (state.outputFiles) {
      await downloadAllAsZip(state.outputFiles, state.globalSettings);
    }
  };

  // Calculate stats
  const totalEntries = state.startList.length;
  const classCount = new Set(state.startList.map((e) => e.className)).size;
  const laneCount = state.startAreas.reduce((sum, a) => sum + a.lanes.length, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-center mb-8">
        <span className="text-6xl mb-4 block">🎉</span>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">生成完了!</h2>
        <p className="text-gray-600">
          スタートリストの生成が完了しました。
          以下からファイルをダウンロードしてください。
        </p>
      </div>

      {/* Summary */}
      <div className="mb-8 bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-700">{totalEntries}</div>
            <div className="text-sm text-green-600">エントリー</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700">{classCount}</div>
            <div className="text-sm text-green-600">クラス</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700">{laneCount}</div>
            <div className="text-sm text-green-600">レーン</div>
          </div>
        </div>
      </div>

      {/* Download All Button */}
      <div className="mb-6">
        <button
          onClick={handleDownloadAll}
          className="w-full py-4 bg-blue-600 text-white rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <span>📦</span>
          すべてをZIPでダウンロード
        </button>
        <p className="text-center text-sm text-gray-500 mt-2">
          {state.globalSettings.outputFolder}.zip
        </p>
      </div>

      {/* Individual Files */}
      <div className="mb-8">
        <h3 className="font-medium mb-3">個別ダウンロード</h3>
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.key}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{file.icon}</span>
                <div>
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm text-gray-500">{file.description}</div>
                </div>
              </div>
              <button
                onClick={() => handleDownload(file.key)}
                className="px-4 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
              >
                ダウンロード
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 役職別スタートリスト */}
      {(state.outputFiles?.roleVariants?.length || 0) > 0 && (
        <div className="mb-8">
          <h3 className="font-medium mb-1">役職別スタートリスト</h3>
          <p className="text-sm text-gray-500 mb-3">
            当日は無線も携帯も使えないことがあるので、役職ごとに「探し方」の違う紙を用意します。
            同じ役職でも引くキーが変わるため、役職ごとに複数の並び順を出しています。
          </p>
          <div className="space-y-2">
            {state.outputFiles!.roleVariants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">
                    <span className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-0.5 mr-2">
                      {variant.role}
                    </span>
                    {variant.title}
                  </div>
                  <div className="text-sm text-gray-500">{variant.purpose}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      downloadFile(
                        variant.tex,
                        `${state.globalSettings.outputFolder}_${variant.fileBase}.tex`,
                        'text/x-tex'
                      )
                    }
                    className="px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md text-sm"
                  >
                    .tex
                  </button>
                  <button
                    onClick={() =>
                      downloadFile(
                        variant.csv,
                        `${state.globalSettings.outputFolder}_${variant.fileBase}.csv`,
                        'text/csv'
                      )
                    }
                    className="px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md text-sm"
                  >
                    .csv
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Preview */}
      <div className="mb-8">
        <h3 className="font-medium mb-3">出力プレビュー</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mulka CSV Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 font-medium text-sm">Startlist.csv</div>
            <div className="p-3 max-h-48 overflow-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {state.outputFiles?.mulkaCsv.slice(0, 1000)}
                {(state.outputFiles?.mulkaCsv.length || 0) > 1000 && '\n...'}
              </pre>
            </div>
          </div>

          {/* Class Summary Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 font-medium text-sm">Class_Summary.csv</div>
            <div className="p-3 max-h-48 overflow-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {state.outputFiles?.classSummaryCsv}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* LaTeX Instructions */}
      <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-medium text-yellow-800 mb-2">LaTeX / Word ファイルについて</h4>
        <p className="text-sm text-yellow-700 mb-2">
          .tex ファイルは LuaLaTeX でコンパイル、.docx ファイルは Word / LibreOffice でそのまま開けます。
        </p>
        <div className="bg-yellow-100 rounded p-2 text-sm font-mono text-yellow-800">
          lualatex Public_Startlist.tex
        </div>
        <p className="text-xs text-yellow-600 mt-2">
          * .tex には ltjsarticle クラスと luatexja-ruby パッケージが必要です
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <button
          onClick={() => goToStep('step4')}
          className="px-6 py-2 rounded-md font-medium text-gray-600 hover:text-gray-800"
        >
          ← 戻る
        </button>
        <button
          onClick={() => {
            if (confirm('新しいスタートリストを作成しますか？')) {
              goToStep('step0');
            }
          }}
          className="px-6 py-2 rounded-md font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          新規作成
        </button>
      </div>
    </div>
  );
}
