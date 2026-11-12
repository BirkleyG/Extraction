// Server-side AI calls. Keys stay on the server (ANTHROPIC_API_KEY, OPENAI_API_KEY);
// players never see them. Every call returns parsed JSON, as the game expects.
// The model is chosen in the game's Settings by the owner; the provider follows the model ID.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Game tiers -> Claude effort. 'quick' is tribe chat, 'complex' is building a planet.
const EFFORT = { quick: 'low', default: 'medium', complex: 'medium' };
// Shown before the live model lists load, or if a provider's list can't be fetched.
const FALLBACK_CLAUDE = [
  ['claude-opus-5-5', 'Claude Opus 5.5'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5'],
];
// Chat-capable OpenAI models only; skip audio, image, embedding and other special-purpose IDs.
const OPENAI_CHAT = /^(gpt-|chatgpt|chat-|o\d)/;
const OPENAI_SKIP = /(audio|realtime|image|tts|transcribe|embedding|search|moderation|instruct|codex|cyber|computer|dall-e|whisper)/;

export const providerOf = model => (/^claude/.test(model) ? 'anthropic' : 'openai');

export function createAi(env) {
  const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 }) : null;
  const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 }) : null;
  const providers = { anthropic: !!anthropic, openai: !!openai };
  let modelsCache = null, modelsAt = 0;

  function defaultModel() {
    if (env.AI_MODEL) return env.AI_MODEL;
    return anthropic ? 'claude-opus-5-5' : '';
  }

  async function listModels() {
    if (modelsCache && Date.now() - modelsAt < 3600_000) return modelsCache;
    const out = [];
    if (anthropic) {
      try {
        for await (const m of anthropic.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id, provider: 'anthropic' });
      } catch (e) { console.error('Claude model list failed', e.status || '', e.message); }
      if (!out.some(m => m.provider === 'anthropic')) FALLBACK_CLAUDE.forEach(([id, label]) => out.push({ id, label, provider: 'anthropic' }));
    }
    if (openai) {
      try {
        const ids = [];
        for await (const m of openai.models.list()) if (OPENAI_CHAT.test(m.id) && !OPENAI_SKIP.test(m.id)) ids.push(m.id);
        ids.sort().reverse().forEach(id => out.push({ id, label: 'ChatGPT · ' + id, provider: 'openai' }));
      } catch (e) { console.error('OpenAI model list failed', e.status || '', e.message); }
    }
    modelsCache = out; modelsAt = Date.now();
    return out;
  }

  async function claudeJson(model, prompt, tier) {
    const response = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT[tier] || 'medium' },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { userMessage: 'Claude declined that one. Try different wording.' });
    return parseJSON(response.content.filter(b => b.type === 'text').map(b => b.text).join(''));
  }

  async function openaiJson(model, prompt) {
    const r = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const choice = r.choices[0];
    if (choice.message.refusal) throw Object.assign(new Error('refused'), { userMessage: 'ChatGPT declined that one. Try different wording.' });
    return parseJSON(choice.message.content || '');
  }

  return {
    get enabled() { return providers.anthropic || providers.openai; },
    providers,
    defaultModel,
    listModels,
    dailyLimit: Number(env.AI_DAILY_LIMIT || 300),
    perPlayerLimit: Number(env.AI_PLAYER_DAILY_LIMIT || 60),
    canUse(model) { return !!model && providers[providerOf(model)]; },
    async json(model, prompt, tier) {
      return providerOf(model) === 'anthropic' ? claudeJson(model, prompt, tier) : openaiJson(model, prompt);
    },
  };
}

export function parseJSON(t) {
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw Object.assign(new Error('non-JSON reply'), { userMessage: 'The AI replied with something that was not JSON' });
}
