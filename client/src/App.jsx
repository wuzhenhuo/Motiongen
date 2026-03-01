import { useCallback } from 'react';
import PromptInput from './components/PromptInput.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import ResultPanel from './components/ResultPanel.jsx';
import History, { saveToHistory } from './components/History.jsx';
import { useTaskPolling } from './hooks/useTaskPolling.js';

function App() {
  const { status, progress, result, error, generate, reset } = useTaskPolling();

  const isGenerating = ['uploading', 'queued', 'running'].includes(status);

  const handleSaveHistory = useCallback(() => {
    if (result) {
      saveToHistory({
        mode: 'text',
        prompt: 'Generated model',
        model_url: result.model_url,
        pbr_model_url: result.pbr_model_url,
      });
    }
  }, [result]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-indigo-400">Tripo</span>3D Generator
          </h1>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
            Powered by Tripo AI
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Input Section */}
        <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Create a 3D Model</h2>
          <PromptInput onGenerate={generate} disabled={isGenerating} />
        </section>

        {/* Progress */}
        {status !== 'idle' && (
          <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
            <ProgressBar status={status} progress={progress} error={error} />
            {(status === 'failed') && (
              <button
                onClick={reset}
                className="mt-3 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
              >
                Try Again
              </button>
            )}
          </section>
        )}

        {/* Result */}
        {status === 'success' && result && (
          <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
            <ResultPanel result={result} onReset={reset} onSaveHistory={handleSaveHistory} />
          </section>
        )}

        {/* History */}
        <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
          <History />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm text-gray-600">
          Tripo3D Generator &mdash; Uses the Tripo AI API for 3D model generation
        </div>
      </footer>
    </div>
  );
}

export default App;
