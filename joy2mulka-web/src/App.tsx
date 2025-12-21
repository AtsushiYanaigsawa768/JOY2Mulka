import { useApp } from './context/AppContext';
import MenuScreen from './components/MenuScreen';
import Step0Upload from './components/Step0Upload';
import Step0Edit from './components/Step0Edit';
import Step0Update from './components/Step0Update';
import Step1ClassConfig from './components/Step1ClassConfig';
import Step2AreaLanes from './components/Step2AreaLanes';
import Step3Constraints from './components/Step3Constraints';
import Step4Generate from './components/Step4Generate';
import DoneScreen from './components/DoneScreen';

const steps = [
  { id: 'step0', label: 'アップロード', shortLabel: 'Step 0' },
  { id: 'step1', label: 'クラス設定', shortLabel: 'Step 1' },
  { id: 'step2', label: 'スタート設定', shortLabel: 'Step 2' },
  { id: 'step3', label: '制約設定', shortLabel: 'Step 3' },
  { id: 'step4', label: '生成', shortLabel: 'Step 4' },
  { id: 'done', label: 'ダウンロード', shortLabel: 'Done' },
];

function StepIndicator() {
  const { state, goToStep, canProceedToStep } = useApp();

  return (
    <div className="flex items-center justify-center space-x-2 mb-8">
      {steps.map((step, index) => {
        const isActive = state.step === step.id;
        const isCompleted = steps.findIndex((s) => s.id === state.step) > index;
        const canClick = canProceedToStep(step.id as any);

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => canClick && goToStep(step.id as any)}
              disabled={!canClick}
              className={`
                flex flex-col items-center px-4 py-2 rounded-lg transition-all
                ${isActive ? 'bg-blue-600 text-white' : ''}
                ${isCompleted && !isActive ? 'bg-green-100 text-green-800' : ''}
                ${!isActive && !isCompleted ? 'bg-gray-100 text-gray-500' : ''}
                ${canClick && !isActive ? 'hover:bg-blue-100 cursor-pointer' : ''}
                ${!canClick ? 'cursor-not-allowed opacity-50' : ''}
              `}
            >
              <span className="text-xs font-medium">{step.shortLabel}</span>
              <span className="text-xs">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${isCompleted ? 'bg-green-400' : 'bg-gray-300'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const { state, dispatch } = useApp();

  const renderStep = () => {
    // Menu screen is shown first
    if (state.step === 'menu') {
      return <MenuScreen />;
    }

    // For edit and update modes, show different Step0 component
    if (state.step === 'step0') {
      if (state.appMode === 'edit') {
        return <Step0Edit />;
      } else if (state.appMode === 'update') {
        return <Step0Update />;
      }
      return <Step0Upload />;
    }

    switch (state.step) {
      case 'step1':
        return <Step1ClassConfig />;
      case 'step2':
        return <Step2AreaLanes />;
      case 'step3':
        return <Step3Constraints />;
      case 'step4':
        return <Step4Generate />;
      case 'done':
        return <DoneScreen />;
      default:
        return <MenuScreen />;
    }
  };

  // Determine if we should show the step indicator
  const showStepIndicator = state.step !== 'menu';

  // Get mode label for header
  const getModeLabel = () => {
    switch (state.appMode) {
      case 'create':
        return 'エントリーリスト作成';
      case 'edit':
        return 'エントリーリスト修正';
      case 'update':
        return 'エントリーリスト更新';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🏃</span>
              <div>
                <h1 className="text-xl font-bold text-gray-900">JOY2Mulka</h1>
                <p className="text-sm text-gray-500">
                  {showStepIndicator ? getModeLabel() : 'スタートリスト生成ツール'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm('メニューに戻りますか？すべてのデータがリセットされます。')) {
                  dispatch({ type: 'RESET' });
                }
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {state.step === 'menu' ? '' : 'メニューに戻る'}
            </button>
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      {showStepIndicator && (
        <div className="max-w-7xl mx-auto px-4 pt-6 sm:px-6 lg:px-8">
          <StepIndicator />
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <span className="text-red-500 mr-2">⚠️</span>
              <span className="text-red-700">{state.error}</span>
              <button
                onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pb-12 sm:px-6 lg:px-8">
        {renderStep()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            JOY2Mulka - JOYエントリーリストからMulkaスタートリストを生成
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
