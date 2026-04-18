import { useEffect, useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('wuzhen-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    localStorage.setItem('wuzhen-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}
