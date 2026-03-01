import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Html } from '@react-three/drei';
import { Suspense, useEffect, useState, useMemo } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';

function Model({ url, onLoaded }) {
  const [scene, setScene] = useState(null);
  const [error, setError] = useState(null);
  const { camera } = useThree();

  useEffect(() => {
    const loader = new GLTFLoader();
    setScene(null);
    setError(null);

    loader.load(
      url,
      (gltf) => {
        const loadedScene = gltf.scene;

        // Auto-center and scale the model
        const box = new THREE.Box3().setFromObject(loadedScene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;

        loadedScene.scale.setScalar(scale);
        loadedScene.position.sub(center.multiplyScalar(scale));
        loadedScene.position.y -= (box.min.y * scale);

        // Adjust camera
        camera.position.set(3, 2, 3);
        camera.lookAt(0, 0, 0);

        setScene(loadedScene);
        onLoaded?.();
      },
      undefined,
      (err) => {
        console.error('Model load error:', err);
        setError('Failed to load 3D model');
      }
    );
  }, [url, camera, onLoaded]);

  if (error) {
    return (
      <Html center>
        <div className="text-red-400 text-center bg-gray-900/90 px-4 py-2 rounded-lg">
          {error}
        </div>
      </Html>
    );
  }

  if (!scene) {
    return (
      <Html center>
        <div className="text-indigo-400 text-center">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading model...
        </div>
      </Html>
    );
  }

  return <primitive object={scene} />;
}

function ViewCube() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />
    </>
  );
}

export default function ModelViewer({ modelUrl }) {
  const [viewMode, setViewMode] = useState('standard'); // standard | wireframe | matcap
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const proxiedUrl = useMemo(() => modelUrl, [modelUrl]);

  if (!modelUrl) return null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 text-xs rounded-lg transition ${
              autoRotate ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Auto Rotate
          </button>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-3 py-1.5 text-xs rounded-lg transition ${
              showGrid ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            Grid
          </button>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
          {['standard', 'wireframe'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition ${
                viewMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-[500px] rounded-xl overflow-hidden bg-gray-950 border border-gray-700 relative">
        <Canvas
          camera={{ position: [3, 2, 3], fov: 45, near: 0.01, far: 1000 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        >
          <Suspense fallback={null}>
            <ViewCube />
            <Environment preset="city" />

            {showGrid && (
              <Grid
                args={[10, 10]}
                cellSize={0.5}
                cellThickness={0.5}
                cellColor="#1e293b"
                sectionSize={2}
                sectionThickness={1}
                sectionColor="#334155"
                fadeDistance={10}
                fadeStrength={1}
                position={[0, -0.01, 0]}
              />
            )}

            <Model url={proxiedUrl} onLoaded={() => setLoaded(true)} />

            <OrbitControls
              autoRotate={autoRotate}
              autoRotateSpeed={2}
              enableDamping
              dampingFactor={0.05}
              minDistance={0.5}
              maxDistance={20}
              maxPolarAngle={Math.PI / 1.5}
            />
          </Suspense>
        </Canvas>

        {/* Interaction hint */}
        {loaded && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-500 bg-gray-900/80 px-3 py-1 rounded-full pointer-events-none">
            Left drag: rotate &middot; Scroll: zoom &middot; Right drag: pan
          </div>
        )}
      </div>
    </div>
  );
}
