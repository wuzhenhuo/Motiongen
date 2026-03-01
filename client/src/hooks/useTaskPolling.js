import { useState, useRef, useCallback } from 'react';
import { createTask, getTaskStatus, uploadImage } from '../utils/api.js';

const POLL_INTERVAL = 2000; // 2 seconds

export function useTaskPolling() {
  const [status, setStatus] = useState('idle'); // idle | uploading | queued | running | success | failed
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pollTask = useCallback((taskId) => {
    timerRef.current = setInterval(async () => {
      try {
        const data = await getTaskStatus(taskId);
        setStatus(data.status);
        setProgress(data.progress || 0);

        if (data.status === 'success') {
          stopPolling();
          setResult(data);
          setProgress(100);
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          stopPolling();
          setError('Generation failed. Please try a different prompt.');
        }
      } catch (err) {
        stopPolling();
        setError(err.response?.data?.error || 'Connection error while checking status');
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  const generate = useCallback(async ({ mode, prompt, negative_prompt, imageFile }) => {
    setStatus(mode === 'image' ? 'uploading' : 'queued');
    setProgress(0);
    setResult(null);
    setError(null);
    stopPolling();

    try {
      let image_token = null;
      if (mode === 'image' && imageFile) {
        setStatus('uploading');
        image_token = await uploadImage(imageFile);
      }

      setStatus('queued');
      const taskId = await createTask({ mode, prompt, negative_prompt, image_token });

      pollTask(taskId);
    } catch (err) {
      setStatus('failed');
      setError(err.response?.data?.error || 'Failed to start generation');
    }
  }, [stopPolling, pollTask]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, [stopPolling]);

  return { status, progress, result, error, generate, reset };
}
