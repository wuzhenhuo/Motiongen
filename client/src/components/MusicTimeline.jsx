import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';

const PX_PER_SEC = 50;
const TOTAL_SECS = 120;
const RULER_OFFSET = 116;
const TRACK_H = 44;

function formatTime(secs) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Clip colors — work on both themes
const ACTION_COLORS = [
  { bg: 'rgba(234,88,12,0.75)',  border: 'rgba(249,115,22,0.5)'  },
  { bg: 'rgba(180,83,9,0.75)',   border: 'rgba(217,119,6,0.5)'   },
  { bg: 'rgba(202,138,4,0.75)',  border: 'rgba(234,179,8,0.5)'   },
  { bg: 'rgba(190,18,60,0.75)',  border: 'rgba(244,63,94,0.5)'   },
  { bg: 'rgba(185,28,28,0.75)',  border: 'rgba(239,68,68,0.5)'   },
];

const MUSIC_COLORS = [
  { bg: 'rgba(79,70,229,0.75)',  border: 'rgba(99,102,241,0.5)'  },
  { bg: 'rgba(124,58,237,0.75)', border: 'rgba(167,139,250,0.5)' },
  { bg: 'rgba(168,85,247,0.75)', border: 'rgba(216,180,254,0.5)' },
  { bg: 'rgba(2,132,199,0.75)',  border: 'rgba(56,189,248,0.5)'  },
  { bg: 'rgba(4,120,87,0.75)',   border: 'rgba(52,211,153,0.5)'  },
];

const MARKERS = Array.from({ length: Math.floor(TOTAL_SECS / 5) + 1 }, (_, i) => i * 5);

function TrackRow({ track, color, onMouseDown, onDelete, icon, isSelected, onSelect }) {
  return (
    <div className="relative flex items-center group/row" style={{ height: TRACK_H }}>
      {/* Label column */}
      <div style={{ width: RULER_OFFSET, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderRight: '1px solid var(--border)' }}>
        {icon}
        <span style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          title={track.name}>
          {track.name.replace(/\.[^.]+$/, '')}
        </span>
      </div>

      {/* Clip block */}
      <div
        onMouseDown={(e) => { onSelect(); onMouseDown(e, track.id); }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          height: TRACK_H - 10,
          left: RULER_OFFSET + track.offset * PX_PER_SEC,
          width: Math.max(track.duration * PX_PER_SEC, 48),
          background: color.bg,
          border: `1px solid ${color.border}`,
          borderRadius: 6,
          cursor: 'grab',
          display: 'flex', alignItems: 'center', padding: '0 8px',
          userSelect: 'none', overflow: 'visible',
          boxShadow: isSelected ? `0 0 0 2px rgba(255,255,255,0.5)` : 'none',
        }}
        className="active:cursor-grabbing"
      >
        {/* Delete button */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(track.id); }}
          style={{
            position: 'absolute', top: -6, left: -6,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)', cursor: 'pointer', zIndex: 20,
            opacity: isSelected ? 1 : 0, transition: 'opacity 0.15s, background 0.15s',
          }}
          className="group/row-hover:opacity-100"
          title="删除"
          onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-2)'; if (!isSelected) e.currentTarget.style.opacity = '0'; }}
        >
          <svg width="8" height="8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {track.name.replace(/\.[^.]+$/, '')}
        </span>
        <span className="font-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flexShrink: 0, paddingLeft: 8 }}>
          {formatTime(track.duration)}
        </span>
      </div>
    </div>
  );
}

const MIN_H = 100;
const MAX_H = 520;
const DEFAULT_H = 200;

const MusicTimeline = forwardRef(function MusicTimeline({ actionTracks = [], onActionTracksChange, onPlayStart, onPlayStop, onAnimFileLoad, onPreviewModel, onActionDelete }, ref) {
  const [musicTracks, setMusicTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [selected, setSelected] = useState(null);
  const [panelH, setPanelH] = useState(DEFAULT_H);
  const resizeDragRef = useRef(null);

  const fileInputRef = useRef(null);
  const actionFileInputRef = useRef(null);
  const audioEls = useRef({});
  const rafRef = useRef(null);
  const playStartWall = useRef(0);
  const playStartHead = useRef(0);
  const pendingTimers = useRef([]);
  const dragRef = useRef(null);
  const timelineRef = useRef(null);
  const onPlayStartRef = useRef(onPlayStart);
  const onPlayStopRef = useRef(onPlayStop);
  useEffect(() => { onPlayStartRef.current = onPlayStart; }, [onPlayStart]);
  useEffect(() => { onPlayStopRef.current = onPlayStop; }, [onPlayStop]);

  const historyRef = useRef([]);
  const actionTracksRef = useRef(actionTracks);
  const musicTracksRef = useRef(musicTracks);
  useEffect(() => { actionTracksRef.current = actionTracks; }, [actionTracks]);
  useEffect(() => { musicTracksRef.current = musicTracks; }, [musicTracks]);

  const saveSnapshot = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-19),
      { actionTracks: actionTracksRef.current, musicTracks: musicTracksRef.current },
    ];
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    onActionTracksChange?.(prev.actionTracks);
    setMusicTracks(prev.musicTracks);
    setSelected(null);
  }, [onActionTracksChange]);

  const handleActionUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    saveSnapshot();
    const ext = file.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(file);
    onActionTracksChange?.(prev => [...prev, {
      id: Date.now(), name: file.name, duration: 8,
      offset: 0, fileType: ext, colorIdx: prev.length,
    }]);
    onAnimFileLoad?.(file);
    onPreviewModel?.(url, file.name, ext);
    e.target.value = '';
  }, [saveSnapshot, onActionTracksChange, onAnimFileLoad, onPreviewModel]);

  const handleUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    saveSnapshot();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    const id = Date.now();
    audioEls.current[id] = audio;
    audio.addEventListener('loadedmetadata', () => {
      setMusicTracks(prev => [...prev, {
        id, name: file.name, duration: audio.duration,
        offset: 0, colorIdx: prev.length % MUSIC_COLORS.length,
      }]);
    }, { once: true });
    e.target.value = '';
  }, []);

  const stopPlayback = useCallback(() => {
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
    cancelAnimationFrame(rafRef.current);
    Object.values(audioEls.current).forEach(a => { try { a.pause(); } catch {} });
    setIsPlaying(false);
    onPlayStopRef.current?.();
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) { stopPlayback(); return; }
    const totalTracks = actionTracks.length + musicTracks.length;
    if (totalTracks === 0) return;

    const head = playhead;
    playStartHead.current = head;
    playStartWall.current = performance.now();

    musicTracks.forEach(({ id, offset, duration }) => {
      const audio = audioEls.current[id];
      if (!audio) return;
      const startIn = offset - head;
      if (startIn <= 0) {
        const seekTo = -startIn;
        if (seekTo < duration) { audio.currentTime = seekTo; audio.play().catch(() => {}); }
      } else {
        const t = setTimeout(() => { audio.currentTime = 0; audio.play().catch(() => {}); }, startIn * 1000);
        pendingTimers.current.push(t);
      }
    });

    const tick = () => {
      const elapsed = (performance.now() - playStartWall.current) / 1000;
      const newHead = playStartHead.current + elapsed;
      setPlayhead(newHead);
      if (newHead <= TOTAL_SECS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        stopPlayback();
        setPlayhead(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    setIsPlaying(true);
    onPlayStartRef.current?.({ actionTracks: actionTracksRef.current, playhead: head });
  }, [isPlaying, playhead, musicTracks, actionTracks, stopPlayback]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setPlayhead(0);
  }, [stopPlayback]);

  const handleDeleteMusic = useCallback((id) => {
    saveSnapshot();
    const audio = audioEls.current[id];
    if (audio) { audio.pause(); delete audioEls.current[id]; }
    setMusicTracks(prev => prev.filter(t => t.id !== id));
    setSelected(s => s?.id === id ? null : s);
  }, [saveSnapshot]);

  const handleDeleteAction = useCallback((id) => {
    saveSnapshot();
    const track = actionTracksRef.current.find(t => t.id === id);
    if (track) onActionDelete?.(track);
    onActionTracksChange?.(prev => prev.filter(t => t.id !== id));
    setSelected(s => s?.id === id ? null : s);
  }, [saveSnapshot, onActionTracksChange, onActionDelete]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selected) return;
      if (selected.type === 'action') handleDeleteAction(selected.id);
      else handleDeleteMusic(selected.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, handleDeleteAction, handleDeleteMusic, undo]);

  const onClipMouseDown = useCallback((e, trackId, type) => {
    e.preventDefault();
    const tracks = type === 'action' ? actionTracks : musicTracks;
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    saveSnapshot();
    dragRef.current = { trackId, type, startX: e.clientX, startOffset: track.offset, lastY: e.clientY };
  }, [actionTracks, musicTracks, saveSnapshot]);

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { trackId, type, startX, startOffset } = dragRef.current;
    const dx = e.clientX - startX;
    const newOffset = Math.max(0, startOffset + dx / PX_PER_SEC);
    const dy = e.clientY - dragRef.current.lastY;
    const rowShift = Math.round(dy / TRACK_H);

    if (type === 'action') {
      if (rowShift !== 0) {
        dragRef.current.lastY += rowShift * TRACK_H;
        onActionTracksChange?.(prev => {
          const arr = [...prev];
          const fromIdx = arr.findIndex(t => t.id === trackId);
          if (fromIdx === -1) return arr.map(t => t.id === trackId ? { ...t, offset: newOffset } : t);
          const toIdx = Math.max(0, Math.min(arr.length - 1, fromIdx + rowShift));
          arr[fromIdx] = { ...arr[fromIdx], offset: newOffset };
          if (fromIdx !== toIdx) { const [item] = arr.splice(fromIdx, 1); arr.splice(toIdx, 0, item); }
          return arr;
        });
      } else {
        onActionTracksChange?.(prev => prev.map(t => t.id === trackId ? { ...t, offset: newOffset } : t));
      }
    } else {
      if (rowShift !== 0) {
        dragRef.current.lastY += rowShift * TRACK_H;
        setMusicTracks(prev => {
          const arr = [...prev];
          const fromIdx = arr.findIndex(t => t.id === trackId);
          if (fromIdx === -1) return arr.map(t => t.id === trackId ? { ...t, offset: newOffset } : t);
          const toIdx = Math.max(0, Math.min(arr.length - 1, fromIdx + rowShift));
          arr[fromIdx] = { ...arr[fromIdx], offset: newOffset };
          if (fromIdx !== toIdx) { const [item] = arr.splice(fromIdx, 1); arr.splice(toIdx, 0, item); }
          return arr;
        });
      } else {
        setMusicTracks(prev => prev.map(t => t.id === trackId ? { ...t, offset: newOffset } : t));
      }
    }
  }, [onActionTracksChange]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    resizeDragRef.current = { startY: e.clientY, startH: panelH };
  }, [panelH]);

  const onResizeMouseMove = useCallback((e) => {
    if (!resizeDragRef.current) return;
    const dy = resizeDragRef.current.startY - e.clientY; // drag up = increase height
    const newH = Math.min(MAX_H, Math.max(MIN_H, resizeDragRef.current.startH + dy));
    setPanelH(newH);
  }, []);

  const onResizeMouseUp = useCallback(() => { resizeDragRef.current = null; }, []);

  const onRulerClick = useCallback((e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft - RULER_OFFSET;
    setPlayhead(Math.min(Math.max(0, x / PX_PER_SEC), TOTAL_SECS));
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onResizeMouseMove);
    window.addEventListener('mouseup', onResizeMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onResizeMouseMove);
      window.removeEventListener('mouseup', onResizeMouseUp);
    };
  }, [onMouseMove, onMouseUp, onResizeMouseMove, onResizeMouseUp]);

  useEffect(() => {
    return () => {
      stopPlayback();
      Object.values(audioEls.current).forEach(a => { try { URL.revokeObjectURL(a.src); } catch {} });
    };
  }, [stopPlayback]);

  useImperativeHandle(ref, () => ({
    startPlay() { if (!isPlaying) handlePlayPause(); },
    stopPlay() { if (isPlaying) stopPlayback(); },
  }), [isPlaying, handlePlayPause, stopPlayback]);

  const totalTracks = actionTracks.length + musicTracks.length;
  const timelineHeight = totalTracks === 0 ? 36 : totalTracks * TRACK_H;

  const ActionIcon = (
    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"
      style={{ color: 'rgba(251,146,60,0.8)', flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const MusicIcon = (
    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"
      style={{ color: 'rgba(129,140,248,0.8)', flexShrink: 0 }}>
      <path d="M9 19V6l12-3v13M9 19c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zm12-3c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2z" />
    </svg>
  );

  /* ── Icon button helper ── */
  const iconBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s',
  };

  return (
    <div className="flex-shrink-0" style={{ height: panelH, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          flexShrink: 0, height: 6, cursor: 'ns-resize',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-surface)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--border-accent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
      >
        <div style={{ width: 32, height: 2, borderRadius: 1, background: 'var(--border)' }} />
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>

        {/* Stop */}
        <button onClick={handleStop} title="停止并归零" style={iconBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}>
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          disabled={totalTracks === 0}
          title={isPlaying ? '暂停' : '播放'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: totalTracks === 0 ? 'var(--bg-card)' : 'var(--accent)',
            color: '#fff', cursor: totalTracks === 0 ? 'not-allowed' : 'pointer',
            opacity: totalTracks === 0 ? 0.4 : 1,
            boxShadow: totalTracks > 0 ? '0 0 10px var(--accent-glow)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {isPlaying ? (
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          )}
        </button>

        {/* Timecode */}
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 40, tabularNums: true }}>
          {formatTime(playhead)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Upload action */}
        <button
          onClick={() => actionFileInputRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'rgba(251,146,60,0.9)', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(251,146,60,0.4)'; e.currentTarget.style.color = 'rgb(251,146,60)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'rgba(251,146,60,0.9)'; }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          上传动作
        </button>
        <input ref={actionFileInputRef} type="file" accept=".glb,.gltf,.fbx" className="hidden" onChange={handleActionUpload} />

        {/* Upload music */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
        >
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 19V6l12-3v13M9 19c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zm12-3c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2z" />
          </svg>
          上传音乐
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Timeline scroll area */}
      <div ref={timelineRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <div style={{ width: RULER_OFFSET + TOTAL_SECS * PX_PER_SEC + 32, position: 'relative' }}>

          {/* Time ruler */}
          <div
            style={{ height: 24, borderBottom: '1px solid var(--border)', position: 'relative', cursor: 'crosshair', userSelect: 'none', background: 'var(--bg-base)' }}
            onClick={onRulerClick}
          >
            <div style={{ width: RULER_OFFSET, position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '0 12px', borderRight: '1px solid var(--border)' }}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>时间线</span>
            </div>
            {MARKERS.map(s => (
              <div key={s} style={{ position: 'absolute', left: RULER_OFFSET + s * PX_PER_SEC, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ width: 1, height: 8, background: 'var(--border)' }} />
                <span className="font-mono" style={{ fontSize: 9, color: 'var(--text-3)', position: 'absolute', top: 4, left: 3 }}>
                  {s > 0 ? formatTime(s) : ''}
                </span>
              </div>
            ))}
            {/* Playhead on ruler */}
            <div style={{ position: 'absolute', left: RULER_OFFSET + playhead * PX_PER_SEC, top: 0, bottom: 0, width: 1, background: '#ef4444', pointerEvents: 'none' }}>
              <div style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%', position: 'absolute', top: -2, left: -3.5 }} />
            </div>
          </div>

          {/* Track area */}
          <div style={{ position: 'relative', height: timelineHeight }} onClick={() => setSelected(null)}>

            {/* Playhead line across all tracks */}
            <div style={{ position: 'absolute', left: RULER_OFFSET + playhead * PX_PER_SEC, top: 0, bottom: 0, width: 1, background: 'rgba(239,68,68,0.4)', zIndex: 10, pointerEvents: 'none' }} />

            {/* Action tracks */}
            {actionTracks.map((track, idx) => (
              <div key={track.id} style={{ position: 'absolute', top: idx * TRACK_H, left: 0, right: 0 }}>
                <TrackRow
                  track={track}
                  color={ACTION_COLORS[track.colorIdx % ACTION_COLORS.length]}
                  onMouseDown={(e, id) => onClipMouseDown(e, id, 'action')}
                  onDelete={handleDeleteAction}
                  icon={ActionIcon}
                  isSelected={selected?.id === track.id}
                  onSelect={() => setSelected({ id: track.id, type: 'action' })}
                />
              </div>
            ))}

            {/* Divider between action and music */}
            {actionTracks.length > 0 && musicTracks.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: actionTracks.length * TRACK_H, height: 1, background: 'var(--border)' }} />
            )}

            {/* Music tracks */}
            {musicTracks.map((track, idx) => (
              <div key={track.id} style={{ position: 'absolute', top: actionTracks.length * TRACK_H + idx * TRACK_H, left: 0, right: 0 }}>
                <TrackRow
                  track={track}
                  color={MUSIC_COLORS[track.colorIdx]}
                  onMouseDown={(e, id) => onClipMouseDown(e, id, 'music')}
                  onDelete={handleDeleteMusic}
                  icon={MusicIcon}
                  isSelected={selected?.id === track.id}
                  onSelect={() => setSelected({ id: track.id, type: 'music' })}
                />
              </div>
            ))}

            {/* Empty hint */}
            {totalTracks === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: RULER_OFFSET + 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>上传动作文件或音乐后将显示在此处，可拖动调整位置</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default MusicTimeline;
