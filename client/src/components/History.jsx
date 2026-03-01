import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tripo3d_history';

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift({ ...entry, id: Date.now(), createdAt: new Date().toISOString() });
  // Keep last 50 entries
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
}

export default function History({ onSelect }) {
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, [open]);

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-gray-400 hover:text-gray-300"
      >
        {open ? 'Hide' : 'Show'} History ({history.length})
      </button>

      {open && (
        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
          {history.length === 0 && (
            <p className="text-sm text-gray-500">No history yet.</p>
          )}
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer"
              onClick={() => onSelect?.(item)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">
                  {item.mode === 'image' ? '[Image to 3D]' : item.prompt}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              {item.model_url && (
                <span className="ml-2 text-xs text-green-400">Has model</span>
              )}
            </div>
          ))}
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear all history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
