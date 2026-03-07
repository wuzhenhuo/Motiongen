import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Html } from '@react-three/drei';
import { Suspense, useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as THREE from 'three';

// ── Timeline layout constants ──────────────────────────────────
const TRACK_COUNT = 3;
const TRACK_H = 36;
const RULER_H = 22;
const CTRL_H = 34;
const LABEL_W = 64;
const PX_PER_SEC = 80;

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

// ── Model ─────────────────────────────────────────────────────
function Model({ url, fileType = 'gltf', externalClips, savedPositionRef, mixerRef, onLoaded, onHasAnimation, onSceneMount }) {
  const [scene, setScene] = useState(null);
  const [error, setError] = useState(null);
  const { camera } = useThree();

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  useEffect(() => {
    setScene(null);
    setError(null);
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }

    const isFbx = fileType === 'fbx';
    const loader = isFbx ? new FBXLoader() : new GLTFLoader();

    loader.load(url, (loaded) => {
      const s = isFbx ? loaded : loaded.scene;
      const animations = loaded.animations;

      const box = new THREE.Box3().setFromObject(s);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;

      s.scale.setScalar(scale);
      if (savedPositionRef?.current) {
        const sp = savedPositionRef.current;
        s.position.set(sp.x, sp.y, sp.z);
      } else {
        s.position.sub(center.multiplyScalar(scale));
        s.position.y -= box.min.y * scale;
      }

      camera.position.set(3, 2, 3);
      camera.lookAt(0, 0, 0);

      if (animations?.length > 0) {
        const mixer = new THREE.AnimationMixer(s);
        animations.forEach(clip => mixer.clipAction(clip).play());
        mixerRef.current = mixer;
        onHasAnimation?.(true);
      } else {
        onHasAnimation?.(false);
      }

      setScene(s);
      onSceneMount?.(s);
      onLoaded?.();
    }, undefined, (err) => {
      console.error('Model load error:', err);
      setError('无法加载3D模型');
    });

    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
    };
  }, [url, fileType, camera, onLoaded, onHasAnimation]);

  useEffect(() => {
    if (!externalClips?.length || !scene) return;
    if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(scene);
    mixerRef.current.stopAllAction();
    externalClips.forEach(clip => mixerRef.current.clipAction(clip).play());
    onHasAnimation?.(true);
  }, [externalClips, scene, onHasAnimation]);

  if (error) return (
    <Html center>
      <div className="text-red-400 text-center bg-gray-900/90 px-4 py-2 rounded-lg text-sm">{error}</div>
    </Html>
  );

  if (!scene) return (
    <Html center>
      <div className="text-indigo-400 text-center">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-sm">加载模型中...</span>
      </div>
    </Html>
  );

  return <primitive object={scene} />;
}

// ── AnimPanel ──────────────────────────────────────────────────
const AnimPanel = forwardRef(function AnimPanel({ onClipsChange, onNewItemsLoaded }, ref) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [clipItems, setClipItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadAnimFile = useCallback(async (file, { skipTimeline = false } = {}) => {
    setLoadError(null);
    setLoading(true);
    const ext = file.name.split('.').pop().toLowerCase();
    const objectUrl = URL.createObjectURL(file);
    try {
      let clips = [];
      if (ext === 'fbx') {
        const loader = new FBXLoader();
        const fbx = await new Promise((res, rej) => loader.load(objectUrl, res, undefined, rej));
        clips = fbx.animations || [];
      } else if (ext === 'glb' || ext === 'gltf') {
        const loader = new GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(objectUrl, res, undefined, rej));
        clips = gltf.animations || [];
      } else if (ext === 'bvh') {
        const { BVHLoader } = await import('three/addons/loaders/BVHLoader.js');
        const loader = new BVHLoader();
        const result = await new Promise((res, rej) => loader.load(objectUrl, res, undefined, rej));
        clips = result.clip ? [result.clip] : [];
      } else {
        setLoadError('不支持的格式'); return;
      }
      if (clips.length === 0) { setLoadError('文件中无动作数据'); return; }

      const newItems = clips.map((clip, i) => ({
        id: `${Date.now()}_${i}`,
        name: clip.name || `动作${i + 1}`,
        fileName: file.name,
        clip,
      }));
      setClipItems(prev => [...prev, ...newItems]);
      setActiveId(newItems[0].id);
      onClipsChange([newItems[0].clip]);
      if (!skipTimeline) onNewItemsLoaded?.(newItems);
    } catch (err) {
      console.error('Animation load error:', err);
      setLoadError('加载失败');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLoading(false);
    }
  }, [onClipsChange, onNewItemsLoaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false);
    Array.from(e.dataTransfer.files).forEach(f => loadAnimFile(f));
  }, [loadAnimFile]);

  const handleFileInput = useCallback((e) => {
    Array.from(e.target.files).forEach(f => loadAnimFile(f));
    e.target.value = '';
  }, [loadAnimFile]);

  const playClip = useCallback((item) => { setActiveId(item.id); onClipsChange([item.clip]); }, [onClipsChange]);
  const playAll = useCallback((items) => { setActiveId('all'); onClipsChange(items.map(c => c.clip)); }, [onClipsChange]);
  const removeClip = useCallback((id, remaining) => {
    setClipItems(remaining);
    if (activeId === id || activeId === 'all') { setActiveId(null); onClipsChange(null); }
  }, [activeId, onClipsChange]);
  const clearAll = useCallback(() => { setClipItems([]); setActiveId(null); onClipsChange(null); }, [onClipsChange]);

  useImperativeHandle(ref, () => ({
    addFile: (file) => loadAnimFile(file),
    addFileExternal: (file) => loadAnimFile(file, { skipTimeline: true }),
    removeByFileName: (name) => {
      const toRemoveIds = new Set(clipItems.filter(c => c.fileName === name).map(c => c.id));
      if (toRemoveIds.size === 0) return;
      const remaining = clipItems.filter(c => !toRemoveIds.has(c.id));
      setClipItems(remaining);
      if (toRemoveIds.has(activeId) || activeId === 'all') {
        onClipsChange(remaining.length > 0 ? remaining.map(c => c.clip) : null);
        setActiveId(null);
      }
    },
  }), [loadAnimFile, clipItems, activeId, onClipsChange]);

  return (
    <div className="w-44 flex-shrink-0 border-r border-gray-800 bg-gray-900/60 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div>
          <p className="text-xs font-medium text-gray-300">动作文件</p>
          <p className="text-[10px] text-gray-600 mt-0.5">.fbx · .glb · .bvh</p>
        </div>
        {clipItems.length > 1 && (
          <button onClick={() => playAll(clipItems)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition ${activeId === 'all' ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            全部
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2"
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }}
        onDrop={handleDrop}>
        <label className={`flex flex-col items-center justify-center gap-1.5 min-h-20 border-2 border-dashed rounded-lg p-3 cursor-pointer transition ${isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
          <input type="file" accept=".fbx,.glb,.gltf,.bvh" multiple className="hidden" onChange={handleFileInput} />
          {loading
            ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            : <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
          }
          <p className="text-[10px] text-gray-500 text-center">拖入 / 点击添加</p>
        </label>
        {loadError && <p className="text-[10px] text-red-400 text-center">{loadError}</p>}
        {clipItems.length > 0 && (
          <div className="space-y-1">
            {clipItems.map(item => {
              const isActive = activeId === item.id || activeId === 'all';
              return (
                <div key={item.id}
                  className={`rounded px-2 py-1.5 cursor-pointer transition group ${isActive ? 'bg-emerald-900/60 border border-emerald-700/50' : 'bg-gray-800/80 hover:bg-gray-700/80'}`}
                  onClick={() => playClip(item)}>
                  <div className="flex items-start justify-between gap-1">
                    <p className={`text-[10px] font-medium truncate flex-1 ${isActive ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {isActive ? '▶ ' : '○ '}{item.name}
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); removeClip(item.id, clipItems.filter(c => c.id !== item.id)); }}
                      className="text-gray-700 hover:text-red-400 transition flex-shrink-0 opacity-0 group-hover:opacity-100 text-[10px] leading-none">✕</button>
                  </div>
                  <p className="text-[9px] text-gray-600 truncate mt-0.5">{item.fileName}</p>
                </div>
              );
            })}
            <button onClick={clearAll} className="w-full text-[10px] text-gray-600 hover:text-red-400 transition py-1">清空列表</button>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Timeline ───────────────────────────────────────────────────
const TRACK_COLORS = [
  { clip: 'bg-indigo-700/80 hover:bg-indigo-600/90 border-indigo-500/40', track: 'bg-indigo-950/10' },
  { clip: 'bg-violet-700/80 hover:bg-violet-600/90 border-violet-500/40', track: 'bg-violet-950/10' },
  { clip: 'bg-teal-700/80 hover:bg-teal-600/90 border-teal-500/40', track: 'bg-teal-950/10' },
];

function Timeline({ items, onItemsChange, mixerRef, onPlayStart, onStop }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [resizingId, setResizingId] = useState(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const itemDur = (item) => item.duration ?? item.clip.duration;
  const totalDuration = Math.max(4, ...items.map(i => i.startTime + itemDur(i)));
  const contentW = Math.ceil(totalDuration + 2) * PX_PER_SEC;

  const play = useCallback(() => {
    if (!mixerRef.current || items.length === 0) return;
    mixerRef.current.stopAllAction();
    mixerRef.current.time = 0;
    mixerRef.current.timeScale = 1;
    items.forEach((item) => {
      const action = mixerRef.current.clipAction(item.clip).reset().startAt(item.startTime);
      if (item.duration != null) action.setDuration(item.duration);
      action.play();
    });
    setCurrentTime(0);
    setIsPlaying(true);
    onPlayStart?.();
  }, [items, mixerRef, onPlayStart]);

  const pause = useCallback(() => {
    if (mixerRef.current) mixerRef.current.timeScale = 0;
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    onStop?.();
  }, [mixerRef, onStop]);

  const resume = useCallback(() => {
    if (mixerRef.current) mixerRef.current.timeScale = 1;
    setIsPlaying(true);
    onPlayStart?.();
  }, [mixerRef, onPlayStart]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current.time = 0;
      mixerRef.current.timeScale = 1;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    onStop?.();
  }, [mixerRef, onStop]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const t = mixerRef.current?.time ?? 0;
      setCurrentTime(t);
      if (t >= totalDuration) { setIsPlaying(false); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, totalDuration, mixerRef]);

  const handleClipMouseDown = useCallback((e, item) => {
    e.preventDefault(); e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setDraggingId(item.id);
    setDragOffsetX(e.clientX - rect.left);
  }, []);

  const handleResizeMouseDown = useCallback((e, item) => {
    e.preventDefault(); e.stopPropagation();
    setResizingId(item.id);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (resizingId) {
      const x = e.clientX - rect.left - LABEL_W;
      const item = items.find(i => i.id === resizingId);
      if (!item) return;
      const newDur = Math.max(0.1, x / PX_PER_SEC - item.startTime);
      onItemsChange(items.map(i => i.id === resizingId ? { ...i, duration: newDur } : i));
      return;
    }

    if (draggingId) {
      const x = e.clientX - rect.left - LABEL_W - dragOffsetX;
      const y = e.clientY - rect.top - RULER_H;
      const startTime = Math.max(0, x / PX_PER_SEC);
      const track = Math.max(0, Math.min(TRACK_COUNT - 1, Math.floor(y / TRACK_H)));
      onItemsChange(items.map(item =>
        item.id === draggingId ? { ...item, startTime, track } : item
      ));
    }
  }, [draggingId, dragOffsetX, resizingId, items, onItemsChange]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setResizingId(null);
  }, []);

  const handleRulerDown = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, (e.clientX - rect.left - LABEL_W) / PX_PER_SEC);
    setCurrentTime(t);
    if (mixerRef.current) {
      mixerRef.current.time = 0;
      mixerRef.current.update(t);
    }
  }, [mixerRef]);

  const ticks = Array.from({ length: Math.ceil(totalDuration) + 3 }, (_, i) => i);

  return (
    <div
      className="flex-shrink-0 border-t border-gray-800 bg-gray-900/90 select-none"
      style={{ height: CTRL_H + RULER_H + TRACK_COUNT * TRACK_H }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 border-b border-gray-800" style={{ height: CTRL_H }}>
        {/* Stop */}
        <button onClick={stop} title="停止"
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white transition">
          <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5"><rect x="1" y="1" width="10" height="10" /></svg>
        </button>
        {/* Play / Pause */}
        <button onClick={isPlaying ? pause : (mixerRef.current?.timeScale === 0 ? resume : play)} title={isPlaying ? '暂停' : '播放'}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition">
          {isPlaying
            ? <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5"><rect x="1" y="1" width="3.5" height="10"/><rect x="7.5" y="1" width="3.5" height="10"/></svg>
            : <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5"><polygon points="1,1 11,6 1,11"/></svg>
          }
        </button>
        {/* Time */}
        <span className="text-[11px] font-mono text-gray-400 tabular-nums">
          {fmtTime(currentTime)}
        </span>
        <span className="text-[10px] text-gray-600">/ {fmtTime(totalDuration)}</span>
        <span className="ml-auto text-[10px] text-gray-600">{items.length} 个片段</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto" ref={containerRef}>
        <div className="relative" style={{ width: LABEL_W + contentW }}>

          {/* Ruler */}
          <div className="flex cursor-crosshair" style={{ height: RULER_H }} onMouseDown={handleRulerDown}>
            <div className="flex-shrink-0 bg-gray-900 border-r border-gray-800 flex items-end pb-1 px-2"
              style={{ width: LABEL_W }}>
              <span className="text-[9px] text-gray-700">时间轴</span>
            </div>
            <div className="relative flex-1 bg-gray-900 border-b border-gray-800 overflow-hidden">
              {ticks.map(t => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * PX_PER_SEC }}>
                  <div className="w-px h-full bg-gray-700/60" />
                  <span className="absolute text-[9px] text-gray-500 ml-0.5" style={{ top: 4 }}>{fmtTime(t)}</span>
                </div>
              ))}
              {ticks.map(t => (
                <div key={`h${t}`} className="absolute top-0 w-px bg-gray-800"
                  style={{ left: (t + 0.5) * PX_PER_SEC, height: RULER_H * 0.4 }} />
              ))}
            </div>
          </div>

          {/* Tracks */}
          {Array.from({ length: TRACK_COUNT }, (_, trackIdx) => (
            <div key={trackIdx} className="flex" style={{ height: TRACK_H }}>
              {/* Label */}
              <div className="flex-shrink-0 flex items-center px-2 border-r border-t border-gray-800 text-[10px] text-gray-600"
                style={{ width: LABEL_W }}>
                轨道 {trackIdx + 1}
              </div>
              {/* Lane */}
              <div className={`relative flex-1 border-t border-gray-800 ${TRACK_COLORS[trackIdx].track}`}>
                {items.filter(item => item.track === trackIdx).map(item => {
                  const dur = itemDur(item);
                  const w = Math.max(dur * PX_PER_SEC, 50);
                  const l = item.startTime * PX_PER_SEC;
                  const isDrag = draggingId === item.id;
                  const isResize = resizingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`absolute top-1 bottom-1 rounded border cursor-grab flex flex-col justify-center px-1.5 transition ${TRACK_COLORS[trackIdx].clip} ${isDrag || isResize ? 'opacity-60 z-10 shadow-lg' : ''}`}
                      style={{ left: l, width: w }}
                      onMouseDown={(e) => handleClipMouseDown(e, item)}
                    >
                      <p className="text-[9px] text-white font-medium truncate pr-2">{item.name}</p>
                      <p className="text-[8px] text-white/50">{dur.toFixed(2)}s</p>
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r transition"
                        onMouseDown={(e) => handleResizeMouseDown(e, item)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div className="absolute pointer-events-none z-20"
            style={{ left: LABEL_W + currentTime * PX_PER_SEC, top: 0, width: 1, height: RULER_H + TRACK_COUNT * TRACK_H }}>
            <div className="w-px h-full bg-red-500/80" />
            <div className="absolute w-2.5 h-2.5 bg-red-500 rounded-full -translate-x-1/2"
              style={{ top: RULER_H - 5 }} />
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Lights ────────────────────────────────────────────────────
function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />
    </>
  );
}

// ── ModelViewer ───────────────────────────────────────────────
const ModelViewer = forwardRef(function ModelViewer({ modelUrl, label, fileType = 'gltf', onActionPlayStart, onActionStop }, ref) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState('standard');
  const [loaded, setLoaded] = useState(false);
  const [hasAnimation, setHasAnimation] = useState(false);
  const [showAnimPanel, setShowAnimPanel] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [externalClips, setExternalClips] = useState(null);
  const [timelineItems, setTimelineItems] = useState([]); // {id,name,fileName,clip,track,startTime}
  const [positionSaved, setPositionSaved] = useState(false);
  const sceneRef = useRef(null);
  const savedPositionRef = useRef(null);
  const mixerRef = useRef(null); // lifted — shared with Timeline
  const animPanelRef = useRef(null);

  useImperativeHandle(ref, () => ({
    playAnimation() {
      if (mixerRef.current) mixerRef.current.timeScale = 1;
    },
    stopAnimation() {
      if (mixerRef.current) mixerRef.current.timeScale = 0;
    },
    loadAnimFile(file) {
      animPanelRef.current?.addFileExternal(file);
    },
    removeAnimByFileName(name) {
      animPanelRef.current?.removeByFileName(name);
    },
  }));

  const proxiedUrl = useMemo(() => modelUrl, [modelUrl]);

  useEffect(() => {
    setLoaded(false);
    setHasAnimation(false);
    setAutoRotate(true);
    setExternalClips(null);
    setPositionSaved(false);
    savedPositionRef.current = null;
  }, [modelUrl]);

  // When AnimPanel loads new items → add to timeline on track 0
  const handleNewItemsLoaded = useCallback((newItems) => {
    if (!newItems) return;
    setTimelineItems(prev => {
      let cursor = prev.filter(i => i.track === 0)
        .reduce((max, i) => Math.max(max, i.startTime + i.clip.duration), 0);
      const placed = newItems.map(item => {
        const entry = { ...item, track: 0, startTime: cursor, duration: item.clip.duration };
        cursor += item.clip.duration;
        return entry;
      });
      return [...prev, ...placed];
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — only when a model is loaded */}
      {modelUrl && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/60">
          <div className="flex items-center gap-2 flex-wrap">
            {label && (
              <span className="text-xs text-indigo-400 font-medium px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                {label}
              </span>
            )}
            {hasAnimation && (
              <span className="text-xs text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 animate-pulse">
                ▶ 动画播放中
              </span>
            )}
            {[
              { label: '自动旋转', active: autoRotate, onClick: () => setAutoRotate(v => !v) },
              { label: '网格', active: showGrid, onClick: () => setShowGrid(v => !v) },
              { label: '动作面板', active: showAnimPanel, onClick: () => setShowAnimPanel(v => !v) },
              { label: '时间线', active: showTimeline, onClick: () => setShowTimeline(v => !v) },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick}
                className={`px-3 py-1 text-xs rounded-md transition ${btn.active ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {btn.label}
              </button>
            ))}
            <button
              onClick={() => {
                if (sceneRef.current) {
                  sceneRef.current.position.set(0, 0, 0);
                  savedPositionRef.current = { x: 0, y: 0, z: 0 };
                  setPositionSaved(true);
                }
              }}
              className={`px-3 py-1 text-xs rounded-md transition ${positionSaved ? 'bg-amber-700/60 text-amber-300' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {positionSaved ? '坐标已保存' : '重置坐标'}
            </button>
          </div>
          <div className="flex gap-1 bg-gray-800 rounded-md p-0.5 flex-shrink-0">
            {[['standard', '实体'], ['wireframe', '线框']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs rounded transition ${viewMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas row: AnimPanel always mounted + 3D canvas when model loaded */}
      <div className="flex-1 flex overflow-hidden bg-gray-950 min-h-0">
        {showAnimPanel && (
          <AnimPanel
            ref={animPanelRef}
            onClipsChange={setExternalClips}
            onNewItemsLoaded={handleNewItemsLoaded}
          />
        )}
        {modelUrl && (
          <div className="flex-1 relative overflow-hidden">
            <Canvas
              camera={{ position: [3, 2, 3], fov: 45, near: 0.01, far: 1000 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            >
              <Suspense fallback={null}>
                <Lights />
                <Environment preset="city" />
                {showGrid && (
                  <Grid args={[10, 10]} cellSize={0.5} cellThickness={0.5} cellColor="#1e293b"
                    sectionSize={2} sectionThickness={1} sectionColor="#334155"
                    fadeDistance={10} fadeStrength={1} position={[0, -0.01, 0]} />
                )}
                <Model
                  url={proxiedUrl}
                  fileType={fileType}
                  externalClips={externalClips}
                  savedPositionRef={savedPositionRef}
                  mixerRef={mixerRef}
                  onLoaded={() => setLoaded(true)}
                  onHasAnimation={setHasAnimation}
                  onSceneMount={(s) => { sceneRef.current = s; }}
                />
                <OrbitControls autoRotate={autoRotate} autoRotateSpeed={hasAnimation ? 0.5 : 2}
                  enableDamping dampingFactor={0.05} minDistance={0.5} maxDistance={20} />
              </Suspense>
            </Canvas>
            {loaded && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-500 bg-gray-900/80 px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
                左键拖拽旋转 · 滚轮缩放 · 右键平移
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline — shown when toggled on and there are items */}
      {showTimeline && timelineItems.length > 0 && (
        <Timeline
          items={timelineItems}
          onItemsChange={setTimelineItems}
          mixerRef={mixerRef}
          onPlayStart={onActionPlayStart}
          onStop={onActionStop}
        />
      )}
    </div>
  );
});

export default ModelViewer;
