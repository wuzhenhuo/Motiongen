import ModelViewer from './ModelViewer.jsx';
import { getDownloadUrl } from '../utils/api.js';

export default function ResultPanel({ result, onReset, onSaveHistory }) {
  if (!result) return null;

  const modelUrl = result.model_url ? getDownloadUrl(result.model_url) : null;
  const pbrUrl = result.pbr_model_url ? getDownloadUrl(result.pbr_model_url) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Generated Model</h2>
        <button
          onClick={() => { onSaveHistory(); onReset(); }}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
        >
          New Generation
        </button>
      </div>

      {/* 3D Viewer */}
      {modelUrl && <ModelViewer modelUrl={modelUrl} />}

      <p className="text-sm text-gray-400 text-center">
        Drag to rotate / Scroll to zoom / Right-click to pan
      </p>

      {/* Download Buttons */}
      <div className="flex gap-3 justify-center">
        {modelUrl && (
          <a
            href={modelUrl}
            download
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition"
          >
            Download GLB
          </a>
        )}
        {pbrUrl && (
          <a
            href={pbrUrl}
            download
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium transition"
          >
            Download PBR Model
          </a>
        )}
      </div>
    </div>
  );
}
