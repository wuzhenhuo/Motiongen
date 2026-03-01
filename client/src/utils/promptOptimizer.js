const STYLE_KEYWORDS = [
  'realistic', 'cartoon', 'low-poly', 'voxel', 'stylized',
  'photorealistic', 'anime', 'sci-fi', 'fantasy', 'minimalist',
];

const QUALITY_BOOSTERS = [
  'high quality', 'detailed', 'sharp edges', 'clean topology',
  'well-defined shape', 'smooth surfaces',
];

export function optimizePrompt(rawPrompt) {
  if (!rawPrompt || rawPrompt.trim().length === 0) return '';

  let prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();

  // Check if user already included style/quality keywords
  const hasStyle = STYLE_KEYWORDS.some(k => lower.includes(k));
  const hasQuality = QUALITY_BOOSTERS.some(k => lower.includes(k));

  const additions = [];
  if (!hasQuality) additions.push('high quality, detailed');
  if (!hasStyle) additions.push('realistic');

  if (additions.length > 0) {
    prompt = `${prompt}, ${additions.join(', ')}`;
  }

  return prompt;
}

export function analyzePrompt(prompt) {
  const issues = [];
  if (!prompt || prompt.trim().length === 0) {
    return { score: 0, issues: ['Prompt is empty'], suggestions: ['Describe the 3D object you want to generate'] };
  }

  const words = prompt.trim().split(/\s+/);

  if (words.length < 3) {
    issues.push('Prompt is too short');
  }
  if (words.length > 50) {
    issues.push('Prompt might be too long — keep it focused');
  }

  const lower = prompt.toLowerCase();
  const hasObject = /\b(a|an|the)\s+\w+/.test(lower) || /\b(model|object|figure|character|scene|building|vehicle|weapon|tool|furniture)\b/.test(lower);
  if (!hasObject) {
    issues.push('Consider specifying what object type to generate');
  }

  const suggestions = [];
  if (!STYLE_KEYWORDS.some(k => lower.includes(k))) {
    suggestions.push('Add a style (e.g., realistic, low-poly, cartoon)');
  }
  if (!/\b(color|colou?red|blue|red|green|white|black|gold|silver|wooden|metal|glass)\b/.test(lower)) {
    suggestions.push('Add material or color details');
  }

  const score = Math.max(0, Math.min(100, 100 - issues.length * 25 - (suggestions.length * 10)));

  return { score, issues, suggestions };
}

export const TEMPLATE_PROMPTS = [
  { label: 'Character',     prompt: 'A stylized fantasy warrior character with armor and a sword, detailed, high quality' },
  { label: 'Vehicle',       prompt: 'A futuristic sci-fi spaceship with glowing engines, sleek design, high quality' },
  { label: 'Architecture',  prompt: 'A medieval stone castle with towers and a drawbridge, detailed, realistic' },
  { label: 'Furniture',     prompt: 'A modern minimalist wooden chair with clean lines, smooth surfaces, high quality' },
  { label: 'Animal',        prompt: 'A cute low-poly fox sitting, stylized, colorful, clean topology' },
  { label: 'Weapon',        prompt: 'A detailed fantasy sword with ornate handle and glowing runes, high quality' },
  { label: 'Food',          prompt: 'A realistic hamburger with lettuce, tomato, and cheese, detailed textures' },
  { label: 'Plant',         prompt: 'A potted succulent plant in a ceramic vase, realistic, detailed' },
];
