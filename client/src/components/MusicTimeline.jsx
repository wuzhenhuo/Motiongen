import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';

const PX_PER_SEC = 50;
const TOTAL_SECS = 120;
const RULER_OFFSET = 116; // px for left label column
const TRACK_H = 44; // px per track row

function formatTime(secs) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Action track colors (warm)
const ACTION_COLORS = [
  'bg-orange-600/80 border-orange-500/60',
  'bg-amber-600/80 border-amber-500/60',
  'bg-yellow-600/80 border-yellow-500/60',
  'bg-rose-600/80 border-rose-500/60',
  'bg-red-600/80 border-red-500/60',
];

// Music track colors (cool)
const MUSIC_COLORS = [
  'bg-indigo-600/80 border-indigo-500/60',
  'bg-violet-600/80 border-violet-500/60',
  'bg-fuchsia-600/80 border-fuchsia-500/60',
  'bg-sky-600/80 border-sky-500/60',
  'bg-emerald-600/80 border-emerald-500/60',
];

// Time ruler markers every 5 seconds
const MARKERS = Array.from({ length: Math.floor(TOTAL_SECS / 5) + 1 }, (_, i) => i * 5);

function TrackRow({ track, colorClass, onMouseDown, onDelete, icon, isSelected, onSelect }) {
  return (
    <div className="relative flex items-center group/row" style={{ height: TRACK_H }}>
      {/* Label column */}
      <div
        style={{ width: RULER_OFFSET }}
        className="flex-shrink-0 flex items-center gap-1.5 px-2 border-r border-gray-800/60"
      >
        {icon}
        <span
          className="text-[10px] text-gray-500 truncate flex-1"
          title={track.name}
        >
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
        }}
        className={`rounded border cursor-grab active:cursor-grabbing flex items-center px-2 select-none overflow-visible ${colorClass} ${isSelected ? 'ring-2 ring-white/70' : ''}`}
      >
        {/* Delete button — visible on hover or when selected */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(track.id); }}
          className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-gray-300 hover:bg-red-600 hover:border-red-500 hover:text-white transition z-20 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}
          title="删除 (Delete)"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span className="text-[11px] text-white/90 truncate flex-1">
          {track.name.replace(/\.[^.]+$/, '')}
        </span>
        <span className="text-[10px] text-white/50 flex-shrink-0 pl-2">
          {formatTime(track.duration)}
        </span>
      </div>
    </div>
  );
}

const MusicTimeline = forwardRef(function MusicTimeline({ actionTracks = [], onActionTracksChange, onPlayStart, onPlayStop, onAnimFileLoad, onPreviewModel, onActionDelete }, ref) {
  const [musicTracks, setMusicTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  // { id, type: 'action' | 'music' } | null
  const [selected, setSelected] = useState(null);

  const fileInputRef = useRef(null);
  const actionFileInputRef = useRef(null);
  const audioEls = useRef({});
  const rafRef = useRef(null);
  const playStartWall = useRef(0);
  const playStartHead = useRef(0);
  const pendingTimers = useRef([]);
  const dragRef = useRef(null);
  const timelineRef = useRef(null);
  // Keep callbacks in refs to avoid stale closures
  const onPlayStartRef = useRef(onPlayStart);
  const onPlayStopRef = useRef(onPlayStop);
  useEffect(() => { onPlayStartRef.current = onPlayStart; }, [onPlayStart]);
  useEffect(() => { onPlayStopRef.current = onPlayStop; }, [onPlayStop]);

  // Undo history
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

  // Upload action file
  const handleActionUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    saveSnapshot();
    const ext = file.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(file);
    onActionTracksChange?.(prev => [...prev, {
      id: Date.now(),
      name: file.name,
      duration: 8,
      offset: 0,
      fileType: ext,
      colorIdx: prev.length,
    }]);
    onAnimFileLoad?.(file);
    onPreviewModel?.(url, file.name, ext);
    e.target.value = '';
  }, [saveSnapshot, onActionTracksChange, onAnimFileLoad, onPreviewModel]);

  // Upload music
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
        id,
        name: file.name,
        duration: audio.duration,
        offset: 0,
        colorIdx: prev.length % MUSIC_COLORS.length,
      }]);
    }, { once: true });
    e.target.value = '';
  }, []);

  // Stop all playback
  const stopPlayback = useCallback(() => {
    pendingTimers.current.forEach(clearTimeout);
    pendingTimers.current = [];
    cancelAnimationFrame(rafRef.current);
    Object.values(audioEls.current).forEach(a => { try { a.pause(); } catch {} });
    setIsPlaying(false);
    onPlayStopRef.current?.();
  }, []);

  // Play / pause — drives both music and action tracks
  const handlePlayPause = useCallback(() => {
    if (isPlaying) { stopPlayback(); return; }
    const totalTracks = actionTracks.length + musicTracks.length;
    if (totalTracks === 0) return;

    const head = playhead;
    playStartHead.current = head;
    playStartWall.current = performance.now();

    // Schedule each music track
    musicTracks.forEach(({ id, offset, duration }) => {
      const audio = audioEls.current[id];
      if (!audio) return;
      const startIn = offset - head;
      if (startIn <= 0) {
        const seekTo = -startIn;
        if (seekTo < duration) {
          audio.currentTime = seekTo;
          audio.play().catch(() => {});
        }
      } else {
        const t = setTimeout(() => {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }, startIn * 1000);
        pendingTimers.current.push(t);
      }
    });

    // Advance playhead (covers both music and action track visual sync)
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
    onPlayStartRef.current?.();
  }, [isPlaying, playhead, musicTracks, actionTracks, stopPlayback]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setPlayhead(0);
  }, [stopPlayback]);

  // Delete handlers
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

  // Keyboard shortcuts: Delete to remove selected track, Ctrl+Z to undo
  useEffect(() => {
    const onKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selected) return;
      if (selected.type === 'action') handleDeleteAction(selected.id);
      else handleDeleteMusic(selected.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, handleDeleteAction, handleDeleteMusic, undo]);

  // Mouse drag
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
          if (fromIdx !== toIdx) {
            const [item] = arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, item);
          }
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
          if (fromIdx !== toIdx) {
            const [item] = arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, item);
          }
          return arr;
        });
      } else {
        setMusicTracks(prev => prev.map(t => t.id === trackId ? { ...t, offset: newOffset } : t));
      }
    }
  }, [onActionTracksChange]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  // Click ruler to seek
  const onRulerClick = useCallback((e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft - RULER_OFFSET;
    setPlayhead(Math.min(Math.max(0, x / PX_PER_SEC), TOTAL_SECS));
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    return () => {
      stopPlayback();
      Object.values(audioEls.current).forEach(a => { try { URL.revokeObjectURL(a.src); } catch {} });
    };
  }, [stopPlayback]);

  useImperativeHandle(ref, () => ({
    startPlay() {
      if (!isPlaying) handlePlayPause();
    },
    stopPlay() {
      if (isPlaying) stopPlayback();
    },
  }), [isPlaying, handlePlayPause, stopPlayback]);

  const totalTracks = actionTracks.length + musicTracks.length;
  const timelineHeight = totalTracks === 0 ? 36 : totalTracks * TRACK_H;

  const ActionIcon = (
    <svg className="w-3 h-3 text-orange-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const MusicIcon = (
    <svg className="w-3 h-3 text-indigo-400/70 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 19V6l12-3v13M9 19c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zm12-3c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2z" />
    </svg>
  );

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/90 backdrop-blur">

      {/* Controls bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/60">
        {/* Stop */}
        <button
          onClick={handleStop}
          title="停止并归零"
          className="flex items-center justify-center w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 transition"
        >
          <svg className="w-3.5 h-3.5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          disabled={totalTracks === 0}
          title={isPlaying ? '暂停' : '播放'}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition"
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          )}
        </button>

        {/* Timecode */}
        <span className="text-xs text-gray-400 font-mono tabular-nums w-10">
          {formatTime(playhead)}
        </span>

        <div className="flex-1" />

        {/* Upload action button */}
        <button
          onClick={() => actionFileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-lg text-orange-400 hover:text-orange-300 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          上传动作
        </button>
        <input ref={actionFileInputRef} type="file" accept=".glb,.gltf,.fbx" className="hidden" onChange={handleActionUpload} />

        {/* Upload music button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-lg text-gray-300 hover:text-white transition"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 19V6l12-3v13M9 19c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zm12-3c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2z" />
          </svg>
          上传音乐
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Timeline scroll area */}
      <div ref={timelineRef} className="overflow-x-auto">
        <div style={{ width: RULER_OFFSET + TOTAL_SECS * PX_PER_SEC + 32, position: 'relative' }}>

          {/* Time ruler */}
          <div
            className="h-6 border-b border-gray-800 relative cursor-crosshair select-none bg-gray-950/60"
            onClick={onRulerClick}
          >
            <div
              style={{ width: RULER_OFFSET }}
              className="absolute left-0 top-0 bottom-0 flex items-center px-3 border-r border-gray-800/60"
            >
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">时间线</span>
            </div>
            {MARKERS.map(s => (
              <div
                key={s}
                style={{ position: 'absolute', left: RULER_OFFSET + s * PX_PER_SEC, top: 0, bottom: 0 }}
                className="flex flex-col justify-end"
              >
                <div className="w-px h-2 bg-gray-700" />
                <span className="text-[9px] text-gray-600 font-mono absolute top-1" style={{ left: 3 }}>
                  {s > 0 ? formatTime(s) : ''}
                </span>
              </div>
            ))}
            {/* Playhead on ruler */}
            <div
              style={{ position: 'absolute', left: RULER_OFFSET + playhead * PX_PER_SEC, top: 0, bottom: 0 }}
              className="w-px bg-red-500 pointer-events-none"
            >
              <div className="w-2 h-2 bg-red-500 rounded-full absolute -top-0.5 -left-[3px]" />
            </div>
          </div>

          {/* Track area */}
          <div className="relative" style={{ height: timelineHeight }} onClick={() => setSelected(null)}>

            {/* Playhead line across all tracks */}
            <div
              style={{ position: 'absolute', left: RULER_OFFSET + playhead * PX_PER_SEC, top: 0, bottom: 0 }}
              className="w-px bg-red-500/50 z-10 pointer-events-none"
            />

            {/* Section divider: 动作 */}
            {actionTracks.length > 0 && (
              <div
                style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
                className="h-px bg-orange-900/40"
              />
            )}

            {/* Action tracks */}
            {actionTracks.map((track, idx) => (
              <div
                key={track.id}
                style={{ position: 'absolute', top: idx * TRACK_H, left: 0, right: 0 }}
              >
                <TrackRow
                  track={track}
                  colorClass={ACTION_COLORS[track.colorIdx % ACTION_COLORS.length]}
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
              <div
                style={{ position: 'absolute', left: 0, right: 0, top: actionTracks.length * TRACK_H }}
                className="h-px bg-gray-700/60"
              />
            )}

            {/* Music tracks */}
            {musicTracks.map((track, idx) => (
              <div
                key={track.id}
                style={{ position: 'absolute', top: actionTracks.length * TRACK_H + idx * TRACK_H, left: 0, right: 0 }}
              >
                <TrackRow
                  track={track}
                  colorClass={MUSIC_COLORS[track.colorIdx]}
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
              <div className="flex items-center h-full pl-4" style={{ paddingLeft: RULER_OFFSET + 8 }}>
                <span className="text-xs text-gray-600">上传动作文件或音乐后将显示在此处，可拖动调整位置</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default MusicTimeline;
