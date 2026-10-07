'use strict';

/**
 * Chat backend for the Sakhi Assistant.
 *
 * The assistant is AI-only - there is no local keyword knowledge base. Pick a
 * provider with LLM_PROVIDER:
 *
 *   pollinations  (DEFAULT) free public endpoint - no API key required
 *   openai        needs LLM_API_KEY
 *   groq          needs LLM_API_KEY
 *   openrouter    needs LLM_API_KEY
 *   anthropic     needs LLM_API_KEY
 *   gemini        needs LLM_API_KEY
 *   off           no AI call at all (the assistant will report it is unavailable)
 *
 * If the provider is unreachable, rate-limited or slow, the endpoint says so
 * plainly rather than inventing an answer.
 *
 * PRIVACY: with any external provider the user's question leaves this server and
 * goes to that provider. Set LLM_PROVIDER=off to disable the assistant entirely.
 */

const PROVIDER = String(process.env.LLM_PROVIDER || 'pollinations').toLowerCase();
const KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || '';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 12000);

const SYSTEM_PROMPT =
  'You are Sakhi Assistant, a calm, practical safety assistant for women in India. ' +
  'Give short, concrete, actionable steps. Never blame the user. Mention the relevant ' +
  'Indian helpline or law when useful (112 emergency, 181 women helpline, 1091, 1930 cyber). ' +
  'You are not a lawyer or a doctor: for serious matters, advise contacting the police, ' +
  'a lawyer, or a doctor. Keep answers under 120 words.';

/* ---------- provider registry ---------- */
const PROVIDERS = {
  pollinations: {
    keyless: true,
    model: () => MODEL || 'openai',
    // Two ways in. The OpenAI-compatible POST is tried first; when it is
    // rate-limited (it returns 402/500 quite often) we fall back to the
    // simple path endpoint, which folds the system prompt into the URL.
    async call(system, user, signal) {
      const model = MODEL || 'openai';
      try {
        const res = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: 0.3
          }),
          signal
        });
        if (res.ok) {
          const d = await res.json();
          const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          if (t) return String(t).trim();
        } else {
          console.error('[chat] pollinations POST HTTP ' + res.status);
        }
      } catch (e) {
        console.error('[chat] pollinations POST failed: ' + e.message);
      }
      const url = 'https://text.pollinations.ai/' +
        encodeURIComponent(system + '\n\n' + user) + '?model=' + encodeURIComponent(model);
      const res2 = await fetch(url, { signal });
      if (!res2.ok) { console.error('[chat] pollinations GET HTTP ' + res2.status); return null; }
      const txt = await res2.text();
      return txt ? txt.trim() : null;
    }
  },

  openai: {
    model: () => MODEL || 'gpt-4o-mini',
    request: (model, system, user) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 400
      }
    }),
    parse: (d) => d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
  },

  groq: {
    model: () => MODEL || 'llama-3.1-8b-instant',
    request: (model, system, user) => ({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 400
      }
    }),
    parse: (d) => d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
  },

  openrouter: {
    model: () => MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    request: (model, system, user) => ({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + KEY,
        'HTTP-Referer': 'https://github.com/balajitharun-cloud/sakhi-shield',
        'X-Title': 'Sakhi Shield'
      },
      body: {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 400
      }
    }),
    parse: (d) => d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
  },

  anthropic: {
    model: () => MODEL || 'claude-3-5-haiku-latest',
    request: (model, system, user) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: { model, system, max_tokens: 400, messages: [{ role: 'user', content: user }] }
    }),
    parse: (d) => d && d.content && d.content[0] && d.content[0].text
  },

  gemini: {
    model: () => MODEL || 'gemini-1.5-flash',
    request: (model, system, user) => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model +
           ':generateContent?key=' + encodeURIComponent(KEY),
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
      }
    }),
    parse: (d) => d && d.candidates && d.candidates[0] && d.candidates[0].content &&
                   d.candidates[0].content.parts && d.candidates[0].content.parts[0].text
  }
};

function providerReady() {
  if (PROVIDER === 'off') return false;
  const p = PROVIDERS[PROVIDER];
  if (!p) return false;
  return p.keyless ? true : Boolean(KEY);
}

const llmConfigured = providerReady();

const UNAVAILABLE =
  'The assistant could not reach its AI service just now. Please try again in a moment.';

/* ---------- AI call ---------- */
async function askAI(message, lang) {
  if (!providerReady()) return null;
  const p = PROVIDERS[PROVIDER];
  const langName = { en: 'English', hi: 'Hindi', kn: 'Kannada' }[lang] || 'English';
  const system = SYSTEM_PROMPT + ' Reply in ' + langName + '.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // A provider may implement its own call(); otherwise use request + parse.
    if (typeof p.call === 'function') {
      return await p.call(system, message, controller.signal);
    }
    const req = p.request(p.model(), system, message);
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    if (!res.ok) {
      console.error('[chat] ' + PROVIDER + ' HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    const text = p.parse(data);
    return text ? String(text).trim() : null;
  } catch (e) {
    console.error('[chat] ' + PROVIDER + ' failed: ' + e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function answer(message, lang) {
  const ai = await askAI(message, lang);
  if (ai) return { reply: ai, source: 'ai', provider: PROVIDER };
  return { reply: UNAVAILABLE, source: 'unavailable', provider: PROVIDER };
}

module.exports = { answer, llmConfigured, provider: PROVIDER, PROVIDERS };
