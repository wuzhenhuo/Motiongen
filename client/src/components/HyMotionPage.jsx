import { useState, useCallback, useRef, useEffect } from 'react';

const HISTORY_KEY = 'hymotion_history';
const MAX_HISTORY = 15;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistoryToStorage(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    try {
      const slim = entries.map(({ motionHtml: _h, ...rest }) => rest);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch { /* silent */ }
  }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

function useResizable(defaultWidth = 360, min = 240, max = 560) {
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
  if (typeof file === 'string') { url = file; }
  else if (file?.url) { url = file.url; }
  else if (file?.path) { url = `${HF_SPACE}/file=${file.path}`; }
  if (!url) return null;
  if (url.startsWith('/')) url = `${HF_SPACE}${url}`;
  return url;
}

function randomSeeds() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 1000)).join(',');
}

/* ── Section label ──────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-1 h-3 rounded-full" style={{ background: 'var(--accent)' }} />
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
        {children}
      </span>
    </div>
  );
}

/* ── Status badge ───────────────────────────────────────── */
function StatusDot({ status }) {
  const colors = {
    success: '#10b981',
    error:   '#f87171',
    loading: 'var(--accent-hi)',
    idle:    'var(--text-3)',
  };
  return (
    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0"
      style={{ background: colors[status] || colors.idle,
        boxShadow: status === 'loading' ? `0 0 6px ${colors.loading}` : undefined }} />
  );
}

export default function HyMotionPage() {
  const { width: sidebarWidth, onMouseDown: onDividerMouseDown } = useResizable(360, 240, 560);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5.0);
  const [seeds, setSeeds] = useState('0,1,2,3');
  const [cfg, setCfg] = useState(5.0);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('Enter a motion description and click Generate.');
  const [motionHtml, setMotionHtml] = useState(null);
  const [downloadFiles, setDownloadFiles] = useState([]);
  const [rewrittenPrompt, setRewrittenPrompt] = useState(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [retryCountdown, setRetryCountdown] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);
  const progressTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const addToHistory = useCallback((entry) => {
    setHistory(prev => {
      const updated = [entry, ...prev.filter(h => h.id !== entry.id)].slice(0, MAX_HISTORY);
      saveHistoryToStorage(updated);
      return updated;
    });
  }, []);

  const handleDeleteHistory = useCallback((id) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveHistoryToStorage(updated);
      return updated;
    });
  }, []);

  const handleLoadHistory = useCallback((item) => {
    setPrompt(item.prompt);
    setDuration(item.duration);
    if (item.rewrittenPrompt) setRewrittenPrompt(item.rewrittenPrompt);
    else setRewrittenPrompt(null);
    setDownloadFiles(item.downloadFiles || []);
    if (item.motionHtml) {
      setMotionHtml(item.motionHtml);
      setStatus('success');
      setStatusMsg('已从历史记录加载。');
    } else {
      setMotionHtml(null);
      setStatus('idle');
      setStatusMsg('已加载参数，点击 Generate 重新生成。');
    }
  }, []);

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
        return prev + (92 - prev) * 0.018;
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
        seeds, duration, cfg_scale: cfg,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({ error: submitRes.statusText }));
      throw new Error(err.error || `Server error ${submitRes.status}`);
    }

    const { event_id, session_hash } = await submitRes.json();
    if (!event_id) throw new Error('No event_id returned from server.');

    setProgressStage('Generating…');
    setStatusMsg('Generating motion… This may take 1–3 minutes.');
    startProgress(18);

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

    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const rawData = line.replace(/^data:\s*/, '').trim();
      if (!rawData) continue;
      let msg;
      try { msg = JSON.parse(rawData); } catch { continue; }

      if (msg.msg === 'estimation') {
        const eta = msg.rank_eta ? Math.round(msg.rank_eta) : null;
        if (eta) setStatusMsg(`In queue (position ${msg.rank ?? 0}, ~${eta}s wait)…`);
        continue;
      }
      if (['process_starts','close_stream','heartbeat'].includes(msg.msg)) continue;

      if (msg.msg === 'process_completed') {
        if (!msg.success) { lastError = msg.output?.error || 'Generation failed'; continue; }
        const resultData = msg.output?.data;
        if (Array.isArray(resultData)) {
          htmlContent = resultData[0] || null;
          const rawFiles = resultData[1];
          files = rawFiles ? (Array.isArray(rawFiles) ? rawFiles : [rawFiles]) : [];
        }
        break;
      }
      if (msg.error) { lastError = String(msg.error); }
    }

    if (!htmlContent && !files.length) {
      const err = lastError || 'space_sleeping';
      if (err.includes('ZeroGPU') || err.includes('quota'))
        throw new Error('ZeroGPU daily quota exhausted. Please use a different HF token or wait for quota reset.');
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
        setProgressStage('Done');
        finishProgress(true);
        setMotionHtml(htmlContent || '');
        const resolvedFiles = Array.isArray(files) ? files : (files ? [files] : []);
        setDownloadFiles(resolvedFiles);
        setStatus('success');
        setStatusMsg('Motion generated successfully!');
        addToHistory({
          id: Date.now().toString(),
          prompt: originalText,
          rewrittenPrompt: textToUse !== originalText ? textToUse : null,
          duration,
          motionHtml: htmlContent || '',
          downloadFiles: resolvedFiles,
          createdAt: new Date().toISOString(),
        });
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
  }, [prompt, rewrittenPrompt, duration, doGenerate, finishProgress, startCountdown, addToHistory]);

  /* ── Styles ────────────────────────────────────────────── */
  const inputStyle = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    resize: 'none',
    padding: '10px 12px',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── Left panel ─────────────────────────────────────── */}
      <aside style={{ width: sidebarWidth, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Input */}
          <div>
            <SectionLabel>Motion Description</SectionLabel>
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); setRewrittenPrompt(null); }}
              rows={4}
              placeholder={'Describe the motion, e.g.:\n"A person jumps up with both arms raised."'}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Rewrite */}
          <button
            onClick={handleRewrite}
            disabled={isRewriting || !prompt.trim()}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: isRewriting || !prompt.trim() ? 'not-allowed' : 'pointer',
              opacity: isRewriting || !prompt.trim() ? 0.4 : 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isRewriting ? 'Rewriting…' : 'Rewrite Text'}
          </button>

          {/* Rewritten prompt */}
          {rewrittenPrompt !== null && (
            <div>
              <SectionLabel>Rewritten Prompt</SectionLabel>
              <textarea
                value={rewrittenPrompt}
                onChange={e => setRewrittenPrompt(e.target.value)}
                rows={4}
                style={{ ...inputStyle, borderColor: 'var(--border-accent)', color: 'var(--accent-hi)' }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-accent)'}
              />
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                Auto-filled after rewrite · editable
              </p>
            </div>
          )}

          {/* Duration */}
          <div>
            <SectionLabel>Duration</SectionLabel>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Length</span>
              <span className="font-mono text-xs" style={{ color: 'var(--accent-hi)' }}>{duration.toFixed(1)}s</span>
            </div>
            <input type="range" min="0.5" max="12" step="0.1" value={duration}
              onChange={e => setDuration(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div className="flex justify-between mt-1" style={{ fontSize: 10, color: 'var(--text-3)' }}>
              <span>0.5s</span><span>12s</span>
            </div>
          </div>

          {/* Advanced */}
          <details style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
            <summary style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', userSelect: 'none', letterSpacing: '0.05em', textTransform: 'uppercase', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Advanced Settings</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </summary>
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Random Seeds</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={seeds} onChange={e => setSeeds(e.target.value)}
                    placeholder="0,1,2,3"
                    style={{ ...inputStyle, padding: '7px 10px', fontSize: 12 }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button onClick={() => setSeeds(randomSeeds())}
                    style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ⊛
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CFG Strength</span>
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--accent-hi)' }}>{cfg.toFixed(1)}</span>
                </div>
                <input type="range" min="1" max="10" step="0.1" value={cfg}
                  onChange={e => setCfg(parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>
            </div>
          </details>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={status === 'loading'}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              border: 'none',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              opacity: status === 'loading' ? 0.6 : 1,
              background: status === 'loading'
                ? 'var(--bg-card)'
                : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              boxShadow: status === 'loading' ? 'none' : '0 0 20px var(--accent-glow)',
              fontFamily: 'inherit',
              letterSpacing: '0.02em',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {status === 'loading' ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 3l14 9-14 9V3z"/>
                </svg>
                Generate Motion
              </>
            )}
          </button>

          {/* Status */}
          <div style={{
            fontSize: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid',
            borderColor: status === 'success' ? 'rgba(16,185,129,0.25)'
              : status === 'error'   ? 'rgba(248,113,113,0.25)'
              : status === 'loading' ? 'var(--border-accent)'
              : 'var(--border)',
            background: status === 'success' ? 'rgba(16,185,129,0.06)'
              : status === 'error'   ? 'rgba(248,113,113,0.06)'
              : 'var(--bg-card)',
          }}>
            {status === 'loading' ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600 }}>{progressStage}</span>
                  {retryCountdown !== null
                    ? <span className="font-mono" style={{ fontSize: 11, color: '#fbbf24' }}>{retryCountdown}s</span>
                    : <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.round(progress)}%</span>
                  }
                </div>
                <div style={{ width: '100%', height: 2, borderRadius: 1, background: 'var(--bg-base)', overflow: 'hidden' }}>
                  {retryCountdown !== null
                    ? <div style={{ height: '100%', borderRadius: 1, background: '#fbbf24', transition: 'width 1s linear', width: `${(retryCountdown / 35) * 100}%` }} />
                    : <div style={{ height: '100%', borderRadius: 1, background: 'linear-gradient(90deg, var(--accent), var(--cyan))', transition: 'width 0.7s ease-out', width: `${progress}%` }} />
                  }
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusMsg}</p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <StatusDot status={status} />
                <span style={{ color: status === 'success' ? '#10b981' : status === 'error' ? '#f87171' : 'var(--text-3)' }}>
                  {statusMsg}
                </span>
              </div>
            )}
          </div>

          {/* Example prompts */}
          <div>
            <SectionLabel>Example Prompts</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button key={i} onClick={() => useExample(ex)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = '#16162a'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                >
                  <p style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>{ex.text}</p>
                  <p className="font-mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>{ex.duration}s</p>
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>History</SectionLabel>
                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{history.length} entries</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '10px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => handleLoadHistory(item)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = '#16162a'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-1)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>
                        {item.prompt}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                        <span className="font-mono" style={{ fontSize: 9, color: 'var(--accent-hi)' }}>{item.duration}s</span>
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{timeAgo(item.createdAt)}</span>
                        {item.downloadFiles?.length > 0 && (
                          <span style={{ fontSize: 9, color: 'var(--text-3)' }}>· {item.downloadFiles.length} files</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.id); }}
                      style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s, color 0.15s', paddingTop: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.opacity = '0'; }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </aside>

      {/* ── Drag divider ─────────────────────────────────────── */}
      <div
        onMouseDown={onDividerMouseDown}
        style={{ width: 1, flexShrink: 0, background: 'var(--border)', cursor: 'col-resize', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--border)'}
      />

      {/* ── Right panel ──────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Preview */}
        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-base)' }}
          className="dot-grid">
          {!motionHtml && status !== 'loading' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center' }}>
                {/* Geometric figure */}
                <div style={{ width: 80, height: 80, margin: '0 auto 20px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text-3)' }}>
                    <circle cx="12" cy="5" r="2"/>
                    <path d="M12 7v6M9 9l3 2 3-2M9 16l3-3 3 3M9 16v3M15 16v3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>3D motion visualization will appear here</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Enter a description and click Generate</p>
              </div>
            </div>
          )}

          {status === 'loading' && !motionHtml && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center', width: 280 }}>
                {/* Spinner ring */}
                <div style={{ width: 48, height: 48, margin: '0 auto 20px', border: '1.5px solid var(--border)', borderTop: '1.5px solid var(--accent-hi)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />

                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-hi)', marginBottom: 6 }}>{progressStage}</p>
                {retryCountdown !== null
                  ? <p style={{ fontSize: 11, color: '#fbbf24', marginBottom: 16 }}>Retrying in {retryCountdown}s…</p>
                  : <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>This may take 1–3 minutes</p>
                }

                <div style={{ height: 2, borderRadius: 1, background: 'var(--bg-card)', overflow: 'hidden' }}>
                  {retryCountdown !== null
                    ? <div style={{ height: '100%', background: '#fbbf24', transition: 'width 1s linear', width: `${(retryCountdown / 35) * 100}%` }} />
                    : <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--cyan))', transition: 'width 0.7s ease-out', width: `${progress}%` }} />
                  }
                </div>
                <p className="font-mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
                  {retryCountdown !== null ? `Auto-retry in ${retryCountdown}s` : `${Math.round(progress)}%`}
                </p>
              </div>
            </div>
          )}

          <iframe
            ref={iframeRef}
            title="Motion Preview"
            style={{ width: '100%', height: '100%', border: 'none', display: motionHtml ? 'block' : 'none' }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>

        {/* Downloads */}
        {downloadFiles.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '12px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Download Motion Files
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {downloadFiles.map((file, i) => {
                const rawUrl = resolveFileUrl(file);
                const filename = file?.orig_name || file?.name || `motion_${i + 1}.fbx`;
                const proxyUrl = rawUrl
                  ? `/api/hymotion/download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`
                  : null;
                return proxyUrl ? (
                  <a key={i} href={proxyUrl} download={filename}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px',
                      borderRadius: 8,
                      background: 'rgba(124,58,237,0.1)',
                      border: '1px solid var(--border-accent)',
                      color: 'var(--accent-hi)',
                      fontSize: 11,
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.1)'; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {filename}
                  </a>
                ) : null;
              })}
            </div>
          </div>
        )}

      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
