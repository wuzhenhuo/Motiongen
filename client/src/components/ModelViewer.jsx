import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Html } from '@react-three/drei';
import { Suspense, useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as THREE from 'three';


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
      <div style={{ color: '#f87171', textAlign: 'center', background: 'var(--bg-card)', padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)' }}>{error}</div>
    </Html>
  );

  if (!scene) return (
    <Html center>
      <div style={{ color: 'var(--accent-hi)', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--accent-hi)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 8px' }} className="animate-spin" />
        <span style={{ fontSize: 13 }}>加载模型中...</span>
      </div>
    </Html>
  );

  return <primitive object={scene} />;
}

// ── AnimPanel ──────────────────────────────────────────────────
const AnimPanel = forwardRef(function AnimPanel({ onClipsChange, onPlayOnce }, ref) {
  const [clipItems, setClipItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const loadAnimFile = useCallback(async (file) => {
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
      onPlayOnce?.([newItems[0].clip]);
    } catch (err) {
      console.error('Animation load error:', err);
      setLoadError('加载失败');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLoading(false);
    }
  }, [onClipsChange]);

  const handleFileInput = useCallback((e) => {
    Array.from(e.target.files).forEach(f => loadAnimFile(f));
    e.target.value = '';
  }, [loadAnimFile]);

const playClip = useCallback((item) => { setActiveId(item.id); onPlayOnce?.([item.clip]); }, [onPlayOnce]);
  const playAll = useCallback((items) => { setActiveId('all'); onPlayOnce?.(items.map(c => c.clip)); }, [onPlayOnce]);
  const removeClip = useCallback((id, remaining) => {
    setClipItems(remaining);
    if (activeId === id || activeId === 'all') { setActiveId(null); onClipsChange(null); }
  }, [activeId, onClipsChange]);
  const clearAll = useCallback(() => { setClipItems([]); setActiveId(null); onClipsChange(null); }, [onClipsChange]);

  useImperativeHandle(ref, () => ({
    addFile: (file) => loadAnimFile(file),
    addFileExternal: (file) => loadAnimFile(file),
    getClips: () => clipItems,
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
    <div style={{ width: 176, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>动作文件</p>
          <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>.fbx · .glb · .bvh</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {clipItems.length > 1 && (
            <button onClick={() => playAll(clipItems)}
              style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                background: activeId === 'all' ? '#059669' : 'var(--bg-card)',
                color: activeId === 'all' ? '#fff' : 'var(--text-2)',
                transition: 'all 0.15s',
              }}>
              全部
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="上传动作文件"
            style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1, fontFamily: 'inherit', border: 'none',
              background: 'var(--accent)', color: '#fff', transition: 'all 0.15s',
            }}
          >
            {loading ? '…' : '+ 上传'}
          </button>
          <input ref={fileInputRef} type="file" accept=".fbx,.glb,.gltf,.bvh" multiple className="hidden" onChange={handleFileInput} />
        </div>
      </div>

      {/* Clip list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loadError && <p style={{ fontSize: 9, color: '#f87171', textAlign: 'center' }}>{loadError}</p>}
        {clipItems.length > 0 && (
          <>
            {clipItems.map(item => {
              const isActive = activeId === item.id || activeId === 'all';
              return (
                <div key={item.id}
                  onClick={() => playClip(item)}
                  style={{
                    borderRadius: 6, padding: '6px 8px', cursor: 'pointer', transition: 'all 0.15s',
                    background: isActive ? 'rgba(5,150,105,0.15)' : 'var(--bg-card)',
                    border: `1px solid ${isActive ? 'rgba(5,150,105,0.4)' : 'var(--border)'}`,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#34d399' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, margin: 0 }}>
                      {isActive ? '▶ ' : '○ '}{item.name}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeClip(item.id, clipItems.filter(c => c.id !== item.id)); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 10, flexShrink: 0, padding: 0, lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                    >✕</button>
                  </div>
                  <p style={{ fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{item.fileName}</p>
                </div>
              );
            })}
            <button onClick={clearAll}
              style={{ width: '100%', fontSize: 9, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >清空列表</button>
          </>
        )}
      </div>
    </div>
  );
});


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
const ModelViewer = forwardRef(function ModelViewer({ modelUrl, label, fileType = 'gltf', page = 'animate', onActionPlayStart, onActionStop }, ref) {
  const isGeneratePage = page === 'generate';
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMode, setViewMode] = useState('standard');
  const [loaded, setLoaded] = useState(false);
  const [hasAnimation, setHasAnimation] = useState(false);
  const [showAnimPanel, setShowAnimPanel] = useState(true);
  const [externalClips, setExternalClips] = useState(null);
  const [positionSaved, setPositionSaved] = useState(false);
  const sceneRef = useRef(null);
  const savedPositionRef = useRef(null);
  const mixerRef = useRef(null);
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
    playTimeline({ actionTracks, playhead }) {
      if (!mixerRef.current) return;
      const clips = animPanelRef.current?.getClips() ?? [];
      mixerRef.current.stopAllAction();
      mixerRef.current.time = 0;
      mixerRef.current.timeScale = 1;
      actionTracks.forEach(track => {
        const matching = clips.filter(c => c.fileName === track.name);
        matching.forEach(({ clip }) => {
          const action = mixerRef.current.clipAction(clip);
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          const delayFromNow = track.offset - playhead;
          if (delayFromNow >= 0) {
            action.startAt(delayFromNow);
          } else {
            const clipSeek = -delayFromNow;
            if (clipSeek >= clip.duration) return;
            action.time = clipSeek;
          }
          action.play();
        });
      });
    },
    stopTimeline() {
      if (!mixerRef.current) return;
      mixerRef.current.stopAllAction();
      mixerRef.current.time = 0;
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

  // Play clips once (LoopOnce) — used by AnimPanel click
  const handlePlayOnce = useCallback((clips) => {
    if (!mixerRef.current || !clips?.length) return;
    mixerRef.current.stopAllAction();
    clips.forEach(clip => {
      const action = mixerRef.current.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — only when a model is loaded */}
      {modelUrl && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {label && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-hi)', padding: '2px 8px', borderRadius: 4, background: 'var(--cyan-dim)', border: '1px solid var(--border-accent)' }}>
                {label}
              </span>
            )}
            {hasAnimation && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399', padding: '2px 8px', borderRadius: 4, background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.3)' }}
                className="animate-pulse">
                ▶ 动画播放中
              </span>
            )}
            {[
              { label: '自动旋转', active: autoRotate, onClick: () => setAutoRotate(v => !v) },
              { label: '网格', active: showGrid, onClick: () => setShowGrid(v => !v) },
              ...(!isGeneratePage ? [
                { label: '动作面板', active: showAnimPanel, onClick: () => setShowAnimPanel(v => !v) },
              ] : []),
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                  background: btn.active ? 'var(--accent)' : 'var(--bg-card)',
                  color: btn.active ? '#fff' : 'var(--text-2)',
                  boxShadow: btn.active ? '0 0 8px var(--accent-glow)' : 'none',
                }}>
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
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                background: positionSaved ? 'rgba(180,83,9,0.3)' : 'var(--bg-card)',
                color: positionSaved ? '#fbbf24' : 'var(--text-2)',
              }}>
              {positionSaved ? '坐标已保存' : '重置坐标'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {[['standard', '实体'], ['wireframe', '线框']].map(([mode, lbl]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                  background: viewMode === mode ? 'var(--accent)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-2)',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas row: AnimPanel (animate page only) + 3D canvas */}
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ background: 'var(--bg-base)' }}>
        {!isGeneratePage && showAnimPanel && (
          <AnimPanel
            ref={animPanelRef}
            onClipsChange={setExternalClips}
            onPlayOnce={handlePlayOnce}
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
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full pointer-events-none whitespace-nowrap"
                style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                左键拖拽旋转 · 滚轮缩放 · 右键平移
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
});

export default ModelViewer;
