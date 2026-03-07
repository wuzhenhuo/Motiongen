import { useState } from 'react';
import { usePipelineTask } from '../hooks/usePipelineTask.js';
import { getDownloadUrl } from '../utils/api.js';

// ── Shared mini-components ───────────────────────────────────

function MiniProgress({ progress, status }) {
  const isActive = ['queued', 'running'].includes(status);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{status === 'queued' ? '排队中...' : '处理中...'}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 bg-indigo-500 ${isActive ? 'animate-pulse' : ''}`}
          style={{ width: `${Math.max(progress, isActive ? 8 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function DownloadBtn({ url, label }) {
  return (
    <a
      href={getDownloadUrl(url)}
      download
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 rounded-lg text-white font-medium transition"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {label}
    </a>
  );
}

function RunBtn({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition font-medium"
    >
      {label}
    </button>
  );
}

function ResetBtn({ onClick }) {
  return (
    <button onClick={onClick} className="text-xs text-gray-500 hover:text-gray-400 underline">
      重置
    </button>
  );
}

function PreviewBtn({ url, label, onPreview }) {
  return (
    <button
      onClick={() => onPreview({ url: getDownloadUrl(url), label })}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-700 hover:bg-indigo-600 rounded-lg text-white font-medium transition"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      </svg>
      在预览窗口查看
    </button>
  );
}

// ── Tab: 重拓扑 (convert_model — export clean topology) ───────

function RetopoTab({ taskId, onPreview }) {
  const { status, progress, result, error, run, reset } = usePipelineTask();
  const [format, setFormat] = useState('fbx');
  const [quad, setQuad] = useState(true);
  const isRunning = ['queued', 'running'].includes(status);
  const isDone = status === 'success';

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 leading-relaxed">
        将模型导出为游戏引擎兼容格式，FBX 四边面输出可作为重拓扑结果使用。
      </p>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <span className="text-gray-500">导出格式</span>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            disabled={isRunning || isDone}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="fbx">FBX（游戏/动画）</option>
            <option value="obj">OBJ（通用）</option>
            <option value="usdz">USDZ（Apple AR）</option>
            <option value="stl">STL（3D打印）</option>
          </select>
        </label>
        {format === 'fbx' && (
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={quad}
              onChange={e => setQuad(e.target.checked)}
              disabled={isRunning || isDone}
              className="accent-indigo-500"
            />
            四边形网格（重拓扑）
          </label>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {!isDone && (
          <RunBtn
            onClick={() => run('convert_model', taskId, { format, ...(format === 'fbx' && { quad }) })}
            disabled={isRunning}
            label={isRunning ? '导出中...' : '开始导出'}
          />
        )}
        {status !== 'idle' && <ResetBtn onClick={reset} />}
      </div>
      {isRunning && <MiniProgress progress={progress} status={status} />}
      {isDone && result && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-emerald-400 font-medium">✓ 导出完成</span>
          {result.model_url && <PreviewBtn url={result.model_url} label={format.toUpperCase()} onPreview={onPreview} />}
          {result.model_url && <DownloadBtn url={result.model_url} label={`下载 ${format.toUpperCase()}`} />}
          {result.pbr_model_url && <DownloadBtn url={result.pbr_model_url} label="下载 PBR 版本" />}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Tab: 纹理生成 (texture_model) ─────────────────────────────

function TextureTab({ taskId, onPreview }) {
  const { status, progress, result, error, run, reset } = usePipelineTask();
  const isRunning = ['queued', 'running'].includes(status);
  const isDone = status === 'success';

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 leading-relaxed">
        为模型重新生成高清 PBR 纹理贴图（HD 质量），提升材质细节和真实感。
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        {!isDone && (
          <RunBtn
            onClick={() => run('texture_model', taskId)}
            disabled={isRunning}
            label={isRunning ? '生成中...' : '生成 HD 纹理'}
          />
        )}
        {status !== 'idle' && <ResetBtn onClick={reset} />}
      </div>
      {isRunning && <MiniProgress progress={progress} status={status} />}
      {isDone && result && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-emerald-400 font-medium">✓ 纹理生成完成</span>
          {result.model_url && <PreviewBtn url={result.model_url} label="HD纹理" onPreview={onPreview} />}
          {result.model_url && <DownloadBtn url={result.model_url} label="下载 GLB" />}
          {result.pbr_model_url && <DownloadBtn url={result.pbr_model_url} label="下载 PBR" />}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Tab: 动画绑定 (animate_rig → animate_retarget) ────────────

const ANIMATION_PRESETS = [
  { value: 'preset:idle',    label: '待机 (Idle)' },
  { value: 'preset:walk',    label: '行走 (Walk)' },
  { value: 'preset:run',     label: '跑步 (Run)' },
  { value: 'preset:jump',    label: '跳跃 (Jump)' },
  { value: 'preset:wave_hand', label: '挥手 (Wave)' },
  { value: 'preset:slash',   label: '挥砍 (Slash)' },
  { value: 'preset:victory', label: '胜利 (Victory)' },
];

function AnimateTab({ taskId, onPreview }) {
  const rigHook = usePipelineTask();
  const retargetHook = usePipelineTask();
  const [rigSpec, setRigSpec] = useState('mixamo');
  const [animation, setAnimation] = useState('preset:idle');

  const rigRunning = ['queued', 'running'].includes(rigHook.status);
  const rigDone = rigHook.status === 'success';
  const retargetRunning = ['queued', 'running'].includes(retargetHook.status);

  return (
    <div className="flex gap-6 flex-wrap">
      {/* Step 1: Rig */}
      <div className="min-w-[190px] flex-1 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Step 1 · 骨骼绑定</p>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <span className="text-gray-500">规格</span>
          <select
            value={rigSpec}
            onChange={e => setRigSpec(e.target.value)}
            disabled={rigRunning || rigDone}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="mixamo">Mixamo</option>
            <option value="tripo">Tripo</option>
          </select>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {!rigDone && (
            <RunBtn
              onClick={() => rigHook.run('animate_rig', taskId, { spec: rigSpec })}
              disabled={rigRunning}
              label={rigRunning ? '绑定中...' : '开始绑定'}
            />
          )}
          {rigDone && <span className="text-xs text-emerald-400 font-medium">✓ 绑定完成</span>}
          {rigHook.status !== 'idle' && !rigDone && (
            <ResetBtn onClick={() => { rigHook.reset(); retargetHook.reset(); }} />
          )}
        </div>
        {rigRunning && <MiniProgress progress={rigHook.progress} status={rigHook.status} />}
        {rigHook.error && <p className="text-xs text-red-400">{rigHook.error}</p>}
        {rigDone && rigHook.result?.model_url && (
          <div className="flex gap-2 flex-wrap">
            <PreviewBtn url={rigHook.result.model_url} label="骨骼绑定" onPreview={onPreview} />
            <DownloadBtn url={rigHook.result.model_url} label="下载骨骼模型" />
          </div>
        )}
      </div>

      {/* Step 2: Retarget */}
      {rigDone && (
        <div className="min-w-[190px] flex-1 space-y-2">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Step 2 · 动画应用</p>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <span className="text-gray-500">动画</span>
            <select
              value={animation}
              onChange={e => setAnimation(e.target.value)}
              disabled={retargetRunning || retargetHook.status === 'success'}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {ANIMATION_PRESETS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {retargetHook.status !== 'success' && (
              <RunBtn
                onClick={() => retargetHook.run('animate_retarget', rigHook.result.task_id, {
                  spec: rigSpec,
                  animation,
                })}
                disabled={retargetRunning}
                label={retargetRunning ? '应用中...' : '应用动画'}
              />
            )}
            {retargetHook.status === 'success' && (
              <span className="text-xs text-emerald-400 font-medium">✓ 动画完成</span>
            )}
            {retargetHook.status !== 'idle' && retargetHook.status !== 'success' && (
              <ResetBtn onClick={retargetHook.reset} />
            )}
          </div>
          {retargetRunning && <MiniProgress progress={retargetHook.progress} status={retargetHook.status} />}
          {retargetHook.error && <p className="text-xs text-red-400">{retargetHook.error}</p>}
          {retargetHook.status === 'success' && retargetHook.result?.model_url && (
            <div className="flex gap-2 flex-wrap">
              <PreviewBtn url={retargetHook.result.model_url} label="动画预览" onPreview={onPreview} />
              <DownloadBtn url={retargetHook.result.model_url} label="下载动画模型" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────

const TABS = [
  { id: 'retopo',  label: '格式导出' },
  { id: 'texture', label: '纹理生成' },
  { id: 'animate', label: '动画绑定' },
];

export default function PostProcessPanel({ taskId, onPreview }) {
  const [activeTab, setActiveTab] = useState('retopo');

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/80 backdrop-blur">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800/60">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 min-h-[130px] max-h-[210px] overflow-y-auto">
        {activeTab === 'retopo'  && <RetopoTab  taskId={taskId} onPreview={onPreview} />}
        {activeTab === 'texture' && <TextureTab  taskId={taskId} onPreview={onPreview} />}
        {activeTab === 'animate' && <AnimateTab  taskId={taskId} onPreview={onPreview} />}
      </div>
    </div>
  );
}
