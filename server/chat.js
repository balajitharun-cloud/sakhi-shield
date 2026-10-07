'use strict';

/**
 * Chat backend for the Sakhi Assistant.
 *
 * If an LLM is configured (LLM_API_KEY) the question is answered by the model,
 * told to reply in the requested language. Otherwise it falls back to a small
 * built-in knowledge base, so the endpoint always returns something useful and
 * the app works with no paid key.
 *
 * The browser also ships its own localised knowledge base (English/Hindi/Kannada)
 * and prefers it first - it is instant and already translated. This endpoint is
 * the fallback for questions the local base cannot match.
 */

const { LLM_API_KEY, LLM_PROVIDER = 'openai', LLM_MODEL } = process.env;

const KB = [
  { k: ['follow', 'stalk', 'tail', 'chase'],
    a: "If you think you are being followed:\n• Do not go home. Head to a crowded, well-lit place - a shop, cafe, metro or bus stand.\n• Call 112 or 181 and stay on the line.\n• Share your live location from the Location section with someone you trust.\n• Note the person's description and any vehicle number.\n• If you are in a cab, share the trip and the number plate." },
  { k: ['fir', 'complaint', 'police station', 'register'],
    a: "To file an FIR:\n• Go to any police station. You can file a Zero FIR at any station, even outside the area where it happened.\n• Give the date, time, place and facts in writing.\n• Ask for a free copy of the FIR with its number - that is your right.\n• If the station refuses, complain to the Superintendent of Police.\n• Use the complaint sheet in the Report section to prepare your written complaint." },
  { k: ['emergency', 'helpline', 'number', '112', '181', 'dial'],
    a: "Emergency numbers in India:\n• 112 - all emergencies\n• 181 - women's helpline\n• 1091 - women in distress\n• 100 - police\n• 102 - ambulance\n• 1098 - childline\n• 1930 - cyber crime" },
  { k: ['right', 'law', 'legal', 'entitled', 'justice'],
    a: "A few rights that matter:\n• You can file an FIR at any police station (Zero FIR).\n• Refusing to register a cognisable offence is not allowed.\n• You are entitled to free legal aid through NALSA or your DLSA.\n• For workplace harassment the POSH Act requires an Internal Committee.\n• A woman generally cannot be arrested at night without special permission." },
  { k: ['online', 'cyber', 'internet', 'social media', 'whatsapp', 'blackmail', 'threat'],
    a: "For online harassment:\n• Do not delete anything. Screenshot and save the evidence.\n• Report and block the account on the platform.\n• File a complaint at cybercrime.gov.in or call 1930.\n• You can also visit your nearest cyber cell." },
  { k: ['domestic', 'husband', 'in-laws', 'home'],
    a: "If there is violence at home:\n• Your safety first. Get to a safe place and call 112 or 181.\n• The Protection of Women from Domestic Violence Act, 2005 covers physical, sexual, verbal, emotional and economic abuse.\n• You can ask for a protection order, a residence order and monetary relief.\n• A Protection Officer or the 181 helpline can guide you." },
  { k: ['workplace', 'office', 'boss', 'colleague', 'posh', 'at work', 'job'],
    a: "For workplace harassment:\n• The POSH Act, 2013 applies to every workplace.\n• Workplaces with 10 or more employees must have an Internal Committee.\n• You can complain to the IC. Smaller workplaces have a Local Committee.\n• Keep a written record of dates and what happened." },
  { k: ['safe', 'safety', 'tip', 'precaution', 'travel', 'night'],
    a: "Everyday safety habits:\n• Share your live location before you travel.\n• In a cab, note the number plate and send it to someone.\n• Trust your gut. Leave if something feels wrong.\n• Keep your phone charged and the SOS button within reach." },
  { k: ['fake call', 'escape', 'uncomfortable', 'creepy'],
    a: "If you need an exit:\n• Use the Fake Call tool. It rings like a real call so you can step away.\n• Say 'Sorry, I have to take this' and walk to a safe, public place.\n• You never owe a stranger politeness." },
  { k: ['sos', 'panic', 'alarm', 'siren'],
    a: "The SOS button arms a 5-second countdown, then sounds the siren, vibrates, flashes the screen and shares your location. Sign in and the server also alerts your trusted contacts by SMS or email." },
  { k: ['contact', 'trusted', 'circle', 'sync'],
    a: "Add up to 8 trusted contacts in the Contacts section. They stay on your device unless you sign in and sync them. On SOS the server can email or text them a live-location link." },
  { k: ['hello', 'hi', 'namaste', 'who are you', 'help'],
    a: "I am the Sakhi Assistant. I can explain your rights, emergency numbers, how to file a complaint, and what to do in situations like being followed or harassed." }
];

const FALLBACK = "I am not sure about that one. I can help with: emergency numbers, filing an FIR, your legal rights, online harassment, domestic violence, workplace harassment, safety tips, or using the SOS and fake-call tools.";

const SYSTEM_PROMPT =
  'You are Sakhi Assistant, a calm, practical safety assistant for women in India. ' +
  'Give short, concrete, actionable steps. Never blame the user. Mention the relevant ' +
  'Indian helpline or law when useful (112 emergency, 181 women helpline, 1091, 1930 cyber). ' +
  'You are not a lawyer or a doctor: for serious matters, advise contacting the police, ' +
  'a lawyer, or a doctor. Keep answers under 120 words.';

function llmEndpoint() {
  return LLM_PROVIDER === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
}

async function askLLM(message, lang) {
  if (!LLM_API_KEY) return null;
  const model = LLM_MODEL || (LLM_PROVIDER === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');
  const langName = { en: 'English', hi: 'Hindi', kn: 'Kannada' }[lang] || 'English';
  try {
    const res = await fetch(llmEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LLM_API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + ' Reply in ' + langName + '.' },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 400
      })
    });
    if (!res.ok) { console.error('[chat] LLM HTTP ' + res.status); return null; }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] &&
                 data.choices[0].message && data.choices[0].message.content;
    return text ? String(text).trim() : null;
  } catch (e) {
    console.error('[chat] LLM failed:', e.message);
    return null;
  }
}

function kbAnswer(message) {
  const q = String(message).toLowerCase();
  const hit = KB.find((i) => i.k.some((k) => q.indexOf(k) >= 0));
  return hit ? hit.a : null;
}

async function answer(message, lang) {
  const llm = await askLLM(message, lang);
  if (llm) return { reply: llm, source: 'llm' };
  const kb = kbAnswer(message);
  if (kb) return { reply: kb, source: 'kb' };
  return { reply: FALLBACK, source: 'fallback' };
}

module.exports = { answer, llmConfigured: Boolean(LLM_API_KEY), KB };
