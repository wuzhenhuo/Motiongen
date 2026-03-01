import axios from 'axios';

const api = axios.create({ baseURL: '/api/tripo' });

export async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post('/upload-image', form);
  return data.image_token;
}

export async function createTask({ mode, prompt, negative_prompt, image_token }) {
  const { data } = await api.post('/generate', { mode, prompt, negative_prompt, image_token });
  return data.task_id;
}

export async function getTaskStatus(taskId) {
  const { data } = await api.get(`/task/${taskId}`);
  return data;
}

export function getDownloadUrl(url) {
  return `/api/tripo/download?url=${encodeURIComponent(url)}`;
}

export async function checkHealth() {
  const { data } = await api.get('/health', { baseURL: '/api' });
  return data;
}
