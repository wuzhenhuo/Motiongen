import { useState, useCallback, useRef, useEffect } from 'react';

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

function randomSeeds() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 1000)).join(',');
}

export default function HyMotionPage() {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5.0);
  const [seeds, setSeeds] = useState('0,1,2,3');
  const [cfg, setCfg] = useState(5.0);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('Ready. Enter a motion description and click Generate.');
  const [motionHtml, setMotionHtml] = useState(null);
  const [downloadFiles, setDownloadFiles] = useState([]);
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);

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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setStatus('error'); setStatusMsg('Please enter a motion description.'); return; }

    setStatus('loading');
    setMotionHtml(null);
    setDownloadFiles([]);
    setStatusMsg('Submitting to HY-Motion-1.0...');

    try {
      const submitRes = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() ? { 'x-hf-token': apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          original_text: prompt.trim(),
          rewritten_text: prompt.trim(),
          seeds,
          duration,
          cfg_scale: cfg,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({ error: submitRes.statusText }));
        throw new Error(err.error || `Server error ${submitRes.status}`);
      }

      const { event_id } = await submitRes.json();
      if (!event_id) throw new Error('No event_id returned from server.');

      setStatusMsg('Generating motion... This may take 1–3 minutes.');

      const resultRes = await fetch(`${API_BASE}/result/${event_id}`, {
        headers: apiKey.trim() ? { 'x-hf-token': apiKey.trim() } : {},
      });
      if (!resultRes.ok) throw new Error(`Result fetch failed (${resultRes.status})`);

      const text = await resultRes.text();
      const dataLines = text.split('\n').filter(l => l.startsWith('data:'));
      if (!dataLines.length) throw new Error('No data received from generation.');

      const parsed = JSON.parse(dataLines[dataLines.length - 1].replace(/^data:\s*/, ''));
      if (parsed?.error) throw new Error(parsed.error);

      const htmlContent = Array.isArray(parsed) ? parsed[0] : null;
      const files = Array.isArray(parsed) && parsed[1] ? parsed[1] : [];
      if (!htmlContent && !files.length) throw new Error('Generation returned empty output.');

      setMotionHtml(htmlContent || '');
      setDownloadFiles(files);
      setStatus('success');
      setStatusMsg('Motion generated successfully!');
    } catch (err) {
      console.error('HyMotion generation error:', err);
      setStatus('error');
      setStatusMsg(`Error: ${err.message}`);
    }
  }, [apiKey, prompt, duration, seeds, cfg]);

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* ── Left panel: controls ── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-3">

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">🔑 Hugging Face API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="hf_xxxx  (or set HF_TOKEN in server/.env)"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg focus:outline-none focus:border-purple-500 placeholder-gray-600"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">📝 Motion Description</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={5}
              placeholder={'Describe the motion you want to generate.\n\nTips:\n• Start with "A person..."\n• Focus on body movements\n• Keep under 60 words\n• English only'}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg focus:outline-none focus:border-purple-500 placeholder-gray-600 resize-none"
            />
          </div>

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
            status === 'loading' ? 'bg-yellow-900/20 border-yellow-700/30 text-yellow-400 animate-pulse' :
            'bg-gray-800/40 border-gray-700/40 text-gray-500'
          }`}>
            {statusMsg}
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
              <div className="text-center">
                <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-400">Generating motion...</p>
                <p className="text-xs text-gray-600 mt-1">This may take 1–3 minutes</p>
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
            <p className="text-xs font-medium text-gray-300 mb-2">📦 Download FBX Files</p>
            <div className="flex flex-wrap gap-3">
              {downloadFiles.map((file, i) => (
                <a key={i} href={file.url || file} download
                  className="text-xs text-purple-400 hover:underline">
                  📎 {file.name || `motion_${i + 1}.fbx`}
                </a>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
