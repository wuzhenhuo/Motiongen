import { useState, useCallback } from 'react';
import { analyzePrompt, optimizePrompt, TEMPLATE_PROMPTS } from '../utils/promptOptimizer.js';

export default function PromptInput({ onGenerate, disabled }) {
  const [mode, setMode] = useState('text');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const analysis = analyzePrompt(prompt);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'text' && !prompt.trim()) return;
    if (mode === 'image' && !imageFile) return;

    const optimizedPrompt = mode === 'text' ? optimizePrompt(prompt) : '';
    onGenerate({
      mode,
      prompt: optimizedPrompt,
      negative_prompt: negativePrompt || undefined,
      imageFile,
    });
  };

  const applyTemplate = (tpl) => {
    setPrompt(tpl.prompt);
    setMode('text');
    setShowTemplates(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            mode === 'text'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Text to 3D
        </button>
        <button
          type="button"
          onClick={() => setMode('image')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            mode === 'image'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Image to 3D
        </button>
      </div>

      {/* Text Mode */}
      {mode === 'text' && (
        <>
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the 3D model you want to generate... (e.g., A realistic wooden treasure chest with gold trim)"
              rows={3}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              disabled={disabled}
            />
            {/* Prompt Analysis */}
            {prompt.trim().length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        analysis.score >= 70 ? 'bg-green-500' : analysis.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${analysis.score}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">Quality: {analysis.score}%</span>
                </div>
                {analysis.issues.map((issue, i) => (
                  <p key={i} className="text-xs text-red-400">* {issue}</p>
                ))}
                {analysis.suggestions.map((s, i) => (
                  <p key={i} className="text-xs text-yellow-400">Tip: {s}</p>
                ))}
              </div>
            )}
          </div>

          {/* Template Prompts */}
          <div>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              {showTemplates ? 'Hide templates' : 'Use a template prompt'}
            </button>
            {showTemplates && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TEMPLATE_PROMPTS.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 text-left"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Image Mode */}
      {mode === 'image' && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-indigo-500 transition">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="h-full object-contain rounded-lg" />
            ) : (
              <div className="text-center text-gray-400">
                <p className="text-lg">Click or drag to upload</p>
                <p className="text-sm">JPG, PNG, WebP (max 20MB)</p>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="hidden"
              disabled={disabled}
            />
          </label>
          {imageFile && (
            <button
              type="button"
              onClick={() => { setImageFile(null); setImagePreview(null); }}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Remove image
            </button>
          )}
        </div>
      )}

      {/* Advanced Options */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-gray-400 hover:text-gray-300"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>
        {showAdvanced && (
          <div className="mt-2">
            <label className="block text-sm text-gray-400 mb-1">Negative prompt (what to avoid)</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="e.g., blurry, low quality, distorted"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={disabled || (mode === 'text' && !prompt.trim()) || (mode === 'image' && !imageFile)}
        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition"
      >
        {disabled ? 'Generating...' : 'Generate 3D Model'}
      </button>
    </form>
  );
}
