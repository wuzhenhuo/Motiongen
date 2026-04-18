import { useCallback, useRef, useState } from 'react';
import ModelViewer from './components/ModelViewer.jsx';
import MusicTimeline from './components/MusicTimeline.jsx';
import HyMotionPage from './components/HyMotionPage.jsx';
import { useTheme } from './hooks/useTheme.js';

/* ── Theme toggle icons ── */
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 select-none pointer-events-none">
      {/* Geometric figure placeholder */}
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl border border-white/8 flex items-center justify-center"
          style={{ background: 'var(--bg-card)' }}>
          <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.2"
            style={{ color: 'var(--text-3)' }} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
        <div className="absolute -inset-px rounded-2xl"
          style={{ background: 'linear-gradient(135deg, var(--border-accent), transparent)', opacity: 0.4 }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>上传动作文件开始编辑</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>GLB · GLTF · FBX</p>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [page, setPage] = useState('motion'); // 'animate' | 'motion'
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
      id: Date.now(), name: file.name, duration: 8,
      offset: 0, fileType: ext, colorIdx: prev.length,
    }]);
    e.target.value = '';
  }, []);

  const activeViewerUrl = pipelinePreview?.url ?? null;
  const activeViewerLabel = pipelinePreview?.label ?? null;
  const activeViewerFileType = pipelinePreview?.fileType ?? 'gltf';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0" style={{
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Studio banner */}
        <div className="text-center py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[10px] font-medium tracking-[0.25em] uppercase"
            style={{ color: 'var(--text-3)' }}>
            AI辅助编舞 &nbsp;·&nbsp; 混元动作大模型 &nbsp;·&nbsp; by Wu Zhen &nbsp;·&nbsp; 2026
          </p>
        </div>

        {/* App bar */}
        <div className="flex items-center justify-between px-5 py-2.5">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', boxShadow: '0 0 14px var(--accent-glow)' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
              <span style={{ background: 'linear-gradient(90deg, var(--accent-hi), var(--cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                WuZhen
              </span>
              {' '}Studio
            </h1>
          </div>

          {/* Page tabs */}
          <div className="flex rounded-lg p-0.5 gap-0.5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {[
              { key: 'motion',  label: '动作生成', color: 'var(--accent)' },
              { key: 'animate', label: '动作编辑', color: '#4f46e5'       },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className="px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
                style={page === key ? {
                  background: color,
                  color: '#fff',
                  boxShadow: `0 0 12px ${color}55`,
                } : {
                  color: 'var(--text-2)',
                  background: 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {pipelinePreview && (
              <button onClick={() => setPipelinePreview(null)}
                className="text-xs transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                ← 返回原始模型
              </button>
            )}
            <button
              onClick={() => localFileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              上传文件预览
            </button>
            <input ref={localFileInputRef} type="file" accept=".glb,.gltf,.fbx"
              className="hidden" onChange={handleLocalFileOpen} />

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* ── HY-Motion page ─────────────────────────────────── */}
      {page === 'motion' && (
        <div className="flex flex-1 overflow-hidden">
          <HyMotionPage />
        </div>
      )}

      {/* ── Animate page ───────────────────────────────────── */}
      <div className={`flex flex-1 overflow-hidden ${page === 'motion' ? 'hidden' : ''}`}>

        {/* Main Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden min-h-0 dot-grid"
            style={{ background: 'var(--bg-base)' }}>
            <ModelViewer
              ref={modelViewerRef}
              modelUrl={activeViewerUrl}
              label={activeViewerLabel}
              fileType={activeViewerFileType}
              page={page}
              onActionPlayStart={() => musicTimelineRef.current?.startPlay()}
              onActionStop={() => musicTimelineRef.current?.stopPlay()}
            />
            {!activeViewerUrl && <EmptyState />}
          </div>

          {page === 'animate' && (
            <MusicTimeline
              ref={musicTimelineRef}
              actionTracks={actionTracks}
              onActionTracksChange={setActionTracks}
              onPlayStart={(data) => modelViewerRef.current?.playTimeline(data)}
              onPlayStop={() => modelViewerRef.current?.stopTimeline()}
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
