// Server-side Claude calls. The key stays on the server (ANTHROPIC_API_KEY);
// players never see it. Every call returns parsed JSON, as the game expects.
import Anthropic from '@anthropic-ai/sdk';

// Game tiers -> effort. 'quick' is tribe chat, 'complex' is building a planet.
const EFFORT = { quick: 'low', default: 'medium', complex: 'medium' };

export function createAi(env) {
  const enabled = !!env.ANTHROPIC_API_KEY;
  const model = env.AI_MODEL || 'claude-opus-5-5';
  const client = enabled ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 }) : null;
  return {
    enabled, model,
    dailyLimit: Number(env.AI_DAILY_LIMIT || 300),
    perPlayerLimit: Number(env.AI_PLAYER_DAILY_LIMIT || 60),
    async json(prompt, tier) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: EFFORT[tier] || 'medium' },
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { userMessage: 'Claude declined that one. Try different wording.' });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      return parseJSON(text);
    },
  };
}

export function parseJSON(t) {
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw Object.assign(new Error('non-JSON reply'), { userMessage: 'The AI replied with something that was not JSON' });
}
