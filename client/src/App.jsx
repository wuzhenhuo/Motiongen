import { useCallback, useRef, useState } from 'react';
import PromptInput from './components/PromptInput.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import ModelViewer from './components/ModelViewer.jsx';
import { saveToHistory } from './components/History.jsx';
import PostProcessPanel from './components/PostProcessPanel.jsx';
import MusicTimeline from './components/MusicTimeline.jsx';
import HyMotionPage from './components/HyMotionPage.jsx';
import { useTaskPolling } from './hooks/useTaskPolling.js';
import { getDownloadUrl } from './utils/api.js';

function EmptyState({ page }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none pointer-events-none">
      <div className="w-28 h-28 rounded-3xl bg-gray-800/60 border border-gray-700/50 flex items-center justify-center">
        <svg className="w-14 h-14 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        {page === 'generate' ? (
          <>
            <p className="text-gray-400 font-medium">在左侧输入描述或上传图片</p>
            <p className="text-gray-600 text-sm">支持文字转3D · 图片转3D</p>
          </>
        ) : (
          <>
            <p className="text-gray-400 font-medium">上传动作文件开始编辑</p>
            <p className="text-gray-600 text-sm">支持 GLB · GLTF · FBX</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { status, progress, result, error, generate, reset } = useTaskPolling();
  const isGenerating = ['uploading', 'queued', 'running'].includes(status);

  const [page, setPage] = useState('generate'); // 'generate' | 'animate' | 'motion'
  const [pipelinePreview, setPipelinePreview] = useState(null);
  const localFileInputRef = useRef(null);
  const localObjectUrlRef = useRef(null);
  const modelViewerRef = useRef(null);
  const musicTimelineRef = useRef(null);

  const [actionTracks, setActionTracks] = useState([]);

  const handleLocalFileOpen = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    localObjectUrlRef.current = objectUrl;
    const ext = file.name.split('.').pop().toLowerCase();
    setPipelinePreview({ url: objectUrl, label: file.name, fileType: ext });
    setActionTracks(prev => [...prev, {
      id: Date.now(),
      name: file.name,
      duration: 8,
      offset: 0,
      fileType: ext,
      colorIdx: prev.length,
    }]);
    e.target.value = '';
  }, []);

  const handleSave = useCallback(() => {
    if (result) {
      saveToHistory({
        mode: 'generated',
        prompt: 'Generated model',
        model_url: result.model_url,
        pbr_model_url: result.pbr_model_url,
      });
    }
  }, [result]);

  const handleReset = useCallback(() => {
    reset();
    setPipelinePreview(null);
  }, [reset]);

  const baseModelUrl = result?.model_url
    ? getDownloadUrl(result.model_url)
    : result?.pbr_model_url
      ? getDownloadUrl(result.pbr_model_url)
      : null;

  const activeViewerUrl = pipelinePreview?.url ?? baseModelUrl;
  const activeViewerLabel = pipelinePreview?.label ?? null;
  const activeViewerFileType = pipelinePreview?.fileType ?? 'gltf';

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/70 backdrop-blur">
        {/* Studio branding banner */}
        <div className="text-center py-1.5 border-b border-gray-800/60 bg-gray-900/40">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">
            AI动态雕塑工作室，吴振，明日剧场 &nbsp;·&nbsp; 2026
          </p>
        </div>
        {/* App bar */}
        <div className="flex items-center justify-between px-5 py-2">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/50">
              <svg className="w-4 h-4" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <h1 className="text-base font-bold text-white tracking-tight">
              <span className="text-indigo-400">WuZhen</span> Studio
            </h1>
          </div>

          {/* Page tabs */}
          <div className="flex bg-gray-800/80 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setPage('generate')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${
                page === 'generate'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              模型生成
            </button>
            <button
              onClick={() => setPage('animate')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${
                page === 'animate'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              动作编辑
            </button>
            <button
              onClick={() => setPage('motion')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${
                page === 'motion'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              动作生成
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {pipelinePreview && (
              <button
                onClick={() => setPipelinePreview(null)}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
              >
                ← 返回原始模型
              </button>
            )}
            <button
              onClick={() => localFileInputRef.current?.click()}
              className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded text-gray-300 hover:text-white transition"
            >
              上传文件预览
            </button>
            <input
              ref={localFileInputRef}
              type="file"
              accept=".glb,.gltf,.fbx"
              className="hidden"
              onChange={handleLocalFileOpen}
            />
          </div>
        </div>
      </header>

      {/* ── HY-Motion page (full body replacement) ─────── */}
      {page === 'motion' && (
        <div className="flex flex-1 overflow-hidden">
          <HyMotionPage />
        </div>
      )}

      {/* ── Body ───────────────────────────────────────── */}
      <div className={`flex flex-1 overflow-hidden ${page === 'motion' ? 'hidden' : ''}`}>

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col overflow-hidden">
          {page === 'generate' ? (
            <>
              {/* ── Generation controls ── */}
              <div className="flex-shrink-0 p-4 space-y-3 border-b border-gray-800 overflow-y-auto max-h-[55vh]">
                <PromptInput onGenerate={generate} disabled={isGenerating} />

                {status !== 'idle' && (
                  <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
                    <ProgressBar status={status} progress={progress} error={error} />
                    {status === 'failed' && (
                      <button onClick={handleReset}
                        className="w-full py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition">
                        重试
                      </button>
                    )}
                  </div>
                )}

                {/* Download + new after success */}
                {status === 'success' && result && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="w-full text-xs text-emerald-400 font-medium">✓ 模型生成成功</span>
                    {result.model_url && (
                      <a href={getDownloadUrl(result.model_url)} download
                        className="flex-1 text-center px-2 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition">
                        下载 GLB
                      </a>
                    )}
                    {result.pbr_model_url && (
                      <a href={getDownloadUrl(result.pbr_model_url)} download
                        className="flex-1 text-center px-2 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 rounded-lg text-white font-medium transition">
                        下载 PBR
                      </a>
                    )}
                    <button onClick={() => { handleSave(); handleReset(); }}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition">
                      新建
                    </button>
                  </div>
                )}
              </div>

              {/* ── Pipeline tabs — always visible ── */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <PostProcessPanel
                  taskId={result?.task_id ?? null}
                  onPreview={setPipelinePreview}
                />
              </div>
            </>
          ) : (
            /* ── Animate page sidebar placeholder ── */
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-gray-600 text-center">在下方时间线上传动作文件</p>
            </div>
          )}
        </aside>

        {/* ── Main Area ────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Viewer — always mounted so modelViewerRef is always available */}
          <div className="flex-1 relative overflow-hidden bg-gray-950 min-h-0">
            <ModelViewer
              ref={modelViewerRef}
              modelUrl={activeViewerUrl}
              label={activeViewerLabel}
              fileType={activeViewerFileType}
              page={page}
              onActionPlayStart={() => musicTimelineRef.current?.startPlay()}
              onActionStop={() => musicTimelineRef.current?.stopPlay()}
            />
            {!activeViewerUrl && <EmptyState page={page} />}
          </div>

          {/* ── Animate page bottom panel ── */}
          {page === 'animate' && (
            <MusicTimeline
              ref={musicTimelineRef}
              actionTracks={actionTracks}
              onActionTracksChange={setActionTracks}
              onPlayStart={() => modelViewerRef.current?.playAnimation()}
              onPlayStop={() => modelViewerRef.current?.stopAnimation()}
              onAnimFileLoad={(file) => modelViewerRef.current?.loadAnimFile(file)}
              onPreviewModel={(url, name, ext) => setPipelinePreview({ url, label: name, fileType: ext })}
              onActionDelete={(track) => modelViewerRef.current?.removeAnimByFileName(track.name)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
