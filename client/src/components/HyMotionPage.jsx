import { useState, useCallback, useRef, useEffect } from 'react';

function useResizable(defaultWidth = 384, min = 240, max = 640) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setWidth(Math.min(max, Math.max(min, startW.current + delta)));
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [min, max]);

  return { width, onMouseDown };
}


const EXAMPLE_PROMPTS = [
  { text: 'A person jumps upward with both legs twice.', duration: 4.5 },
  { text: 'A person jumps on their right leg.', duration: 4.5 },
  { text: 'Twist at the waist and punch across the body.', duration: 3.0 },
  { text: 'A person is running then takes big leap.', duration: 3.0 },
  { text: 'A person holds a railing and walks down a set of stairs.', duration: 5.0 },
  { text: 'A man performs a fluid hip-hop style dance with body waves.', duration: 5.0 },
  { text: 'A person stands up from the chair, then stretches their arms.', duration: 4.0 },
  { text: 'A person walks unsteadily, then slowly sits down.', duration: 4.0 },
  { text: 'A person runs forward, then kicks a soccer ball.', duration: 4.0 },
  { text: 'A person dances bachata, executing rhythmic hip movements.', duration: 5.0 },
  { text: 'A person performs a squat.', duration: 3.0 },
  { text: 'A person swings a golf club, hitting the ball forward.', duration: 3.0 },
];

const API_BASE = '/api/hymotion';
const HF_SPACE = 'https://tencent-hy-motion-1-0.hf.space';

function resolveFileUrl(file) {
  let url = null;
  if (typeof file === 'string') {
    url = file;
  } else if (file?.url) {
    url = file.url;
  } else if (file?.path) {
    // Gradio path like /tmp/gradio/xxx/file.fbx → full URL
    url = `${HF_SPACE}/file=${file.path}`;
  }
  if (!url) return null;
  // Make relative URLs absolute
  if (url.startsWith('/')) url = `${HF_SPACE}${url}`;
  return url;
}

function randomSeeds() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 1000)).join(',');
}

export default function HyMotionPage() {
  const { width: sidebarWidth, onMouseDown: onDividerMouseDown } = useResizable(384, 240, 640);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5.0);
  const [seeds, setSeeds] = useState('0,1,2,3');
  const [cfg, setCfg] = useState(5.0);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('Ready. Enter a motion description and click Generate.');
  const [motionHtml, setMotionHtml] = useState(null);
  const [downloadFiles, setDownloadFiles] = useState([]);
  const [rewrittenPrompt, setRewrittenPrompt] = useState(null); // null = not yet rewritten
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState(0);       // 0–100
  const [progressStage, setProgressStage] = useState(''); // e.g. 'Submitting…'
  const [retryCountdown, setRetryCountdown] = useState(null); // null or seconds remaining
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);
  const progressTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  useEffect(() => {
    if (!motionHtml || !iframeRef.current) return;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([motionHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    iframeRef.current.src = url;
    return () => {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, [motionHtml]);

  const useExample = useCallback((ex) => {
    setPrompt(ex.text);
    setDuration(ex.duration);
    setStatusMsg('Example loaded. Click Generate to create motion.');
  }, []);

  const handleRewrite = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsRewriting(true);
    setStatusMsg('Rewriting prompt...');
    try {
      const res = await fetch(`${API_BASE}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt.trim() }),
      });
      const data = await res.json();
      setRewrittenPrompt(data.rewritten || prompt.trim());
      if (data.duration) setDuration(parseFloat(data.duration.toFixed(1)));
      setStatusMsg('Rewrite complete. Review and click Generate.');
    } catch {
      setRewrittenPrompt(prompt.trim());
      setStatusMsg('Rewrite failed, showing original text.');
    } finally {
      setIsRewriting(false);
    }
  }, [prompt]);

  const startProgress = useCallback((fromPct) => {
    clearInterval(progressTimerRef.current);
    setProgress(fromPct);
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 92) { clearInterval(progressTimerRef.current); return prev; }
        return prev + (92 - prev) * 0.018; // decelerates near 92%
      });
    }, 600);
  }, []);

  const finishProgress = useCallback((success) => {
    clearInterval(progressTimerRef.current);
    setProgress(success ? 100 : 0);
  }, []);

  const isSleepingError = (msg) =>
    msg === 'space_sleeping' ||
    (msg && (msg.includes('sleeping') || msg.includes('empty output')) && !msg.includes('quota') && !msg.includes('ZeroGPU'));

  const startCountdown = useCallback((seconds) => new Promise((resolve) => {
    setRetryCountdown(seconds);
    let remaining = seconds;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRetryCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        setRetryCountdown(null);
        resolve();
      }
    }, 1000);
  }), []);

  const doGenerate = useCallback(async (textToUse, originalText) => {
    setProgressStage('Submitting…');
    setStatusMsg('Submitting to HY-Motion-1.0...');
    startProgress(3);

    const submitRes = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_text: originalText,
        rewritten_text: textToUse,
        seeds,
        duration,
        cfg_scale: cfg,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({ error: submitRes.statusText }));
      throw new Error(err.error || `Server error ${submitRes.status}`);
    }

    const { event_id, session_hash } = await submitRes.json();
    if (!event_id) throw new Error('No event_id returned from server.');

    setProgressStage('Generating…');
    setStatusMsg('Generating motion... This may take 1–3 minutes.');
    startProgress(18);

    // Stream the SSE result — pass session_hash so Gradio can find the session
    const resultUrl = session_hash
      ? `${API_BASE}/result/${event_id}?session_hash=${session_hash}`
      : `${API_BASE}/result/${event_id}`;
    const resultRes = await fetch(resultUrl);
    if (!resultRes.ok) throw new Error(`Result fetch failed (${resultRes.status})`);

    const text = await resultRes.text();
    console.log('[HyMotion] raw queue/data SSE:', text.slice(0, 4000));

    let htmlContent = null;
    let files = [];
    let lastError = null;

    // Parse queue/data SSE format: each line is `data: {"msg":"...","output":{...}}`
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const rawData = line.replace(/^data:\s*/, '').trim();
      if (!rawData) continue;

      let msg;
      try { msg = JSON.parse(rawData); } catch { continue; }

      // Queue position / progress events
      if (msg.msg === 'estimation') {
        const eta = msg.rank_eta ? Math.round(msg.rank_eta) : null;
        if (eta) setStatusMsg(`In queue (position ${msg.rank ?? 0}, ~${eta}s wait)…`);
        continue;
      }
      if (msg.msg === 'process_starts') continue;
      if (msg.msg === 'close_stream') continue;
      if (msg.msg === 'heartbeat') continue;

      // Completion
      if (msg.msg === 'process_completed') {
        if (!msg.success) {
          lastError = msg.output?.error || 'Generation failed';
          continue;
        }
        const resultData = msg.output?.data;
        if (Array.isArray(resultData)) {
          htmlContent = resultData[0] || null;
          const rawFiles = resultData[1];
          files = rawFiles ? (Array.isArray(rawFiles) ? rawFiles : [rawFiles]) : [];
        }
        break;
      }

      // Fallback: generic error field
      if (msg.error) { lastError = String(msg.error); }
    }

    if (!htmlContent && !files.length) {
      const err = lastError || 'space_sleeping';
      // ZeroGPU quota exhausted
      if (err.includes('ZeroGPU') || err.includes('quota')) {
        throw new Error('ZeroGPU daily quota exhausted. Please use a different HF token or wait for quota reset.');
      }
      throw new Error(err === 'space_sleeping' ? 'space_sleeping' : err);
    }

    return { htmlContent, files };
  }, [seeds, duration, cfg, startProgress]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setStatus('error'); setStatusMsg('Please enter a motion description.'); return; }

    setStatus('loading');
    setMotionHtml(null);
    setDownloadFiles([]);
    setProgress(0);
    setRetryCountdown(null);

    const textToUse = rewrittenPrompt?.trim() || prompt.trim();
    const originalText = prompt.trim();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 35;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { htmlContent, files } = await doGenerate(textToUse, originalText);

        console.log('[HyMotion] raw files from API:', JSON.stringify(files));
        setProgressStage('Done');
        finishProgress(true);
        setMotionHtml(htmlContent || '');
        setDownloadFiles(Array.isArray(files) ? files : (files ? [files] : []));
        setStatus('success');
        setStatusMsg('Motion generated successfully!');
        return;
      } catch (err) {
        console.error(`HyMotion attempt ${attempt + 1} error:`, err);
        const sleeping = err.message === 'space_sleeping' || isSleepingError(err.message);

        if (sleeping && attempt < MAX_RETRIES) {
          clearInterval(progressTimerRef.current);
          setProgress(0);
          setProgressStage('Waking up Space…');
          setStatusMsg(`HY-Motion Space is sleeping. Auto-retrying (${attempt + 1}/${MAX_RETRIES})…`);
          await startCountdown(RETRY_DELAY);
          continue;
        }

        finishProgress(false);
        setProgressStage('');
        setRetryCountdown(null);
        setStatus('error');
        setStatusMsg(sleeping
          ? 'Space did not wake up after retries. Please visit the HY-Motion Space to wake it manually, then try again.'
          : `Error: ${err.message}`);
        return;
      }
    }
  }, [prompt, rewrittenPrompt, doGenerate, finishProgress, startCountdown]);

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Left panel: controls ── */}
      <aside style={{ width: sidebarWidth }} className="flex-shrink-0 bg-gray-900/50 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-3">

          {/* Input Text */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">📝 Input Text</label>
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); setRewrittenPrompt(null); }}
              rows={4}
              placeholder={'Describe the motion, e.g.:\n"A person jumps up with both arms raised."'}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:outline-none focus:border-purple-500 placeholder-gray-600 resize-none"
            />
          </div>

          {/* Rewrite button */}
          <button
            onClick={handleRewrite}
            disabled={isRewriting || !prompt.trim()}
            className={`w-full py-2 rounded-xl text-sm font-semibold transition ${
              isRewriting
                ? 'bg-gray-700/60 cursor-not-allowed text-gray-500'
                : 'bg-gray-800 hover:bg-gray-700 border border-gray-600/50 hover:border-purple-600/50 text-gray-300 hover:text-white'
            }`}
          >
            {isRewriting ? '🔄 Rewriting...' : '🔄 Rewrite Text'}
          </button>

          {/* Rewritten Prompt — shown after rewrite */}
          {rewrittenPrompt !== null && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-medium text-gray-300">✏️ Rewritten Prompt</label>
                <span className="text-[10px] text-gray-500 italic">auto-filled after rewrite, you can further edit</span>
              </div>
              <textarea
                value={rewrittenPrompt}
                onChange={e => setRewrittenPrompt(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-gray-900/80 border border-purple-700/40 text-purple-100 text-sm rounded-lg focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              ⏱️ Duration: <span className="text-purple-400">{duration.toFixed(1)}s</span>
            </label>
            <input
              type="range" min="0.5" max="12" step="0.1" value={duration}
              onChange={e => setDuration(parseFloat(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1"><span>0.5s</span><span>12s</span></div>
          </div>

          {/* Advanced */}
          <details className="border border-gray-700/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-xs font-medium text-gray-400 select-none">🔧 Advanced Settings</summary>
            <div className="px-3 pb-3 space-y-3 pt-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1.5">🎯 Random Seeds</label>
                <div className="flex gap-2">
                  <input type="text" value={seeds} onChange={e => setSeeds(e.target.value)}
                    placeholder="0,1,2,3"
                    className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg focus:outline-none focus:border-purple-500"
                  />
                  <button onClick={() => setSeeds(randomSeeds())}
                    className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">🎲</button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1.5">
                  ⚙️ CFG Strength: <span className="text-purple-400">{cfg.toFixed(1)}</span>
                </label>
                <input type="range" min="1" max="10" step="0.1" value={cfg}
                  onChange={e => setCfg(parseFloat(e.target.value))}
                  className="w-full accent-purple-500" />
              </div>
            </div>
          </details>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={status === 'loading'}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition ${
              status === 'loading'
                ? 'bg-purple-800/60 cursor-not-allowed opacity-70'
                : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-900/40'
            }`}
          >
            {status === 'loading' ? '⏳ Generating...' : '🚀 Generate Motion'}
          </button>

          {/* Status */}
          <div className={`text-xs px-3 py-2 rounded-lg border ${
            status === 'success' ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' :
            status === 'error'   ? 'bg-red-900/30 border-red-700/40 text-red-400' :
            status === 'loading' ? 'bg-gray-900/60 border-purple-800/40 text-gray-400' :
            'bg-gray-800/40 border-gray-700/40 text-gray-500'
          }`}>
            {status === 'loading' ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-purple-300 font-medium">{progressStage}</span>
                  {retryCountdown !== null
                    ? <span className="text-yellow-400 tabular-nums font-medium">{retryCountdown}s</span>
                    : <span className="text-gray-500 tabular-nums">{Math.round(progress)}%</span>
                  }
                </div>
                {retryCountdown !== null ? (
                  <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                    <div className="h-full rounded-full bg-yellow-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${(retryCountdown / 35) * 100}%` }} />
                  </div>
                ) : (
                  <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-violet-400 transition-all duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                <p className="text-gray-600 mt-1.5 text-[10px] truncate">{statusMsg}</p>
              </div>
            ) : statusMsg}
          </div>

          {/* Example prompts */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">📚 Example Prompts</p>
            <div className="grid grid-cols-2 gap-1.5">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button key={i} onClick={() => useExample(ex)}
                  className="text-left px-2 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/40 hover:border-purple-600/40 transition group">
                  <p className="text-[10px] text-gray-400 group-hover:text-white leading-tight line-clamp-2">{ex.text}</p>
                  <p className="text-[9px] text-gray-600 mt-1">⏱ {ex.duration}s</p>
                </button>
              ))}
            </div>
          </div>

        </div>
      </aside>

      {/* ── Drag divider ── */}
      <div
        onMouseDown={onDividerMouseDown}
        className="w-1 flex-shrink-0 bg-gray-800 hover:bg-purple-600 cursor-col-resize transition-colors"
      />

      {/* ── Right panel: preview + downloads ── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Preview */}
        <div className="flex-1 relative bg-gray-950">
          {!motionHtml && status !== 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-4">🎬</div>
                <p className="text-sm">3D motion visualization will appear here</p>
                <p className="text-xs mt-2 text-gray-700">Enter a description and click Generate</p>
              </div>
            </div>
          )}
          {status === 'loading' && !motionHtml && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 text-center">
                {/* Spinner */}
                <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />

                {/* Stage label */}
                <p className="text-sm font-medium text-purple-300 mb-1">{progressStage}</p>
                {retryCountdown !== null ? (
                  <p className="text-xs text-yellow-400 mb-4">Retrying in {retryCountdown}s…</p>
                ) : (
                  <p className="text-xs text-gray-500 mb-4">This may take 1–3 minutes</p>
                )}

                {/* Progress bar */}
                {retryCountdown !== null ? (
                  <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-yellow-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${(retryCountdown / 35) * 100}%` }} />
                  </div>
                ) : (
                  <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-violet-400 transition-all duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                <p className="text-[10px] text-gray-600 mt-2 tabular-nums">
                  {retryCountdown !== null ? `Auto-retry in ${retryCountdown}s` : `${Math.round(progress)}%`}
                </p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            title="Motion Preview"
            className={`w-full h-full border-0 ${motionHtml ? 'block' : 'hidden'}`}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>

        {/* Downloads — only shown after generation */}
        {downloadFiles.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/60 px-5 py-3">
            <p className="text-xs font-medium text-gray-300 mb-2">📦 下载动作文件</p>
            <div className="flex flex-wrap gap-3">
              {downloadFiles.map((file, i) => {
                const rawUrl = resolveFileUrl(file);
                const filename = file?.orig_name || file?.name || `motion_${i + 1}.fbx`;
                const proxyUrl = rawUrl
                  ? `/api/hymotion/download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`
                  : null;
                return proxyUrl ? (
                  <a key={i} href={proxyUrl} download={filename}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 border border-purple-700/40 text-purple-300 hover:text-purple-200 text-xs font-medium transition">
                    ⬇ {filename}
                  </a>
                ) : null;
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
