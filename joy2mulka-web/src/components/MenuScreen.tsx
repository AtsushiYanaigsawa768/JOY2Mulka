import { useApp } from '../context/AppContext';
import { AppMode } from '../types';

interface MenuOption {
  mode: AppMode;
  title: string;
  description: string;
  icon: string;
  gradient: string;
  hoverGradient: string;
}

const menuOptions: MenuOption[] = [
  {
    mode: 'create',
    title: 'エントリーリストの作成',
    description: '部内エントリーリストやJOYのエントリーリストから、Mulka用、役職用、公開用のスタートリストを作成します。',
    icon: '📝',
    gradient: 'from-blue-500 to-blue-600',
    hoverGradient: 'hover:from-blue-600 hover:to-blue-700',
  },
  {
    mode: 'edit',
    title: 'エントリーリストの修正',
    description: '既存のスタートリスト（.zip）を読み込んで、各競技クラスのデータを表示・編集し、修正版をダウンロードします。',
    icon: '✏️',
    gradient: 'from-green-500 to-green-600',
    hoverGradient: 'hover:from-green-600 hover:to-green-700',
  },
  {
    mode: 'update',
    title: 'エントリーリストの更新',
    description: 'CSVファイルやTeXファイルを読み込んで、役職用・Mulka用・公開用のスタートリストに一括変換します。',
    icon: '🔄',
    gradient: 'from-purple-500 to-purple-600',
    hoverGradient: 'hover:from-purple-600 hover:to-purple-700',
  },
];

export default function MenuScreen() {
  const { dispatch } = useApp();

  const handleSelectMode = (mode: AppMode) => {
    dispatch({ type: 'SET_APP_MODE', payload: mode });
    dispatch({ type: 'SET_STEP', payload: 'step0' });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          何をしますか？
        </h2>
        <p className="text-gray-600">
          作業内容を選択してください
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {menuOptions.map((option) => (
          <button
            key={option.mode}
            onClick={() => handleSelectMode(option.mode)}
            className={`
              group relative overflow-hidden rounded-xl p-6 text-left
              bg-gradient-to-br ${option.gradient} ${option.hoverGradient}
              text-white shadow-lg
              transform transition-all duration-300
              hover:scale-105 hover:shadow-xl
              focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-blue-300
            `}
          >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 transform rotate-45" />
            <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-32 w-32 rounded-full bg-white/5" />

            {/* Content */}
            <div className="relative z-10">
              <div className="text-4xl mb-4 transform group-hover:scale-110 transition-transform duration-300">
                {option.icon}
              </div>
              <h3 className="text-lg font-bold mb-2">
                {option.title}
              </h3>
              <p className="text-sm text-white/80 leading-relaxed">
                {option.description}
              </p>

              {/* Arrow indicator */}
              <div className="mt-4 flex items-center text-white/70 group-hover:text-white transition-colors">
                <span className="text-sm font-medium">選択する</span>
                <svg
                  className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Additional info */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>
          作業を開始すると、各モードに応じたステップが表示されます
        </p>
      </div>
    </div>
  );
}
