/* Shared content: helplines, safety tips, legal rights and the chatbot
   knowledge base. Kept in English; core.js translates at runtime. */
window.SS_DATA = {
  HELPLINES: [
    { group: 'national', num: '112',   name: 'National Emergency', desc: 'Police, fire, ambulance — single number' },
    { group: 'national', num: '100',   name: 'Police',             desc: 'Direct police control room' },
    { group: 'national', num: '101',   name: 'Fire',               desc: 'Fire & rescue' },
    { group: 'national', num: '102',   name: 'Ambulance',          desc: 'Medical emergency / pregnancy' },
    { group: 'women',    num: '181',   name: 'Women Helpline',     desc: 'Distress, domestic violence, counselling' },
    { group: 'women',    num: '1091',  name: 'Women in Distress',  desc: 'Domestic abuse & assault support' },
    { group: 'women',    num: '7827170170', name: 'NCW Helpline',  desc: 'National Commission for Women' },
    { group: 'women',    num: '1098',  name: 'Childline',          desc: 'Children in need of care & protection' },
    { group: 'women',    num: '14416', name: 'Tele-MANAS',         desc: 'Free mental-health support (24×7)' },
    { group: 'women',    num: '1930',  name: 'Cyber Crime',        desc: 'Online fraud & cyber harassment' }
  ],
  TIPS: [
    'Keep your phone charged and carry a power bank on late nights.',
    'Share your live location with a trusted contact before you travel.',
    'In a cab, note the number plate and share it with someone.',
    'Trust your gut. If a person or place feels wrong, leave — you owe no explanation.',
    'Sit near the driver or in a lit, populated spot at a bus or train stop.',
    'Memorise two numbers: 112 for emergencies, 181 for women’s support.',
    'Keep the SOS button reachable — add this page to your home screen.',
    'If followed, walk into a shop, café, or any busy place and ask for help.',
    'Screenshot and save evidence of harassment or threatening messages.',
    'Practise saying a firm, loud “No” and “Stop” — your voice is a tool.',
    'Tell a friend your route and expected arrival time.',
    'Never feel obliged to keep talking to a stranger to be “polite”.'
  ],
  RIGHTS: [
    { q: 'Zero FIR — file anywhere', a: 'You can file an FIR at any police station, regardless of where the incident happened. The station must register it and forward it to the correct jurisdiction. Refusal to register a cognisable offence is itself not allowed.' },
    { q: 'Right to a woman officer & privacy', a: 'For certain offences, a woman’s statement is recorded by a woman officer, preferably at her home or a place of her choice. Victims of sexual offences have a right to privacy and cannot be named publicly.' },
    { q: 'Free legal aid', a: 'Women are entitled to free legal aid through the National/District Legal Services Authority (NALSA/DLSA) and can get a lawyer at no cost.' },
    { q: 'Protection from domestic violence', a: 'The Protection of Women from Domestic Violence Act, 2005 covers physical, sexual, verbal, emotional and economic abuse, and provides protection orders, residence orders and monetary relief.' },
    { q: 'Sexual harassment at the workplace', a: 'The POSH Act, 2013 requires workplaces with 10+ employees to have an Internal Committee. You can complain there, and there is a Local Committee for smaller workplaces.' },
    { q: 'Stalking & online harassment', a: 'Stalking, voyeurism, and sending obscene material are offences under the IPC/BNS and the IT Act. Cyber complaints can be filed at cybercrime.gov.in or on 1930.' },
    { q: 'No arrest of a woman at night', a: 'Generally, a woman cannot be arrested after sunset and before sunrise, except in exceptional cases with the prior permission of a Magistrate and in the presence of a woman police officer.' },
    { q: 'Medical examination & free treatment', a: 'A survivor of sexual violence has the right to free medical treatment and a medical examination, and hospitals cannot refuse care or insist on an FIR first.' }
  ],
  CHAT_INTENTS: [
    { k: ['follow', 'stalk', 'tail', 'chase', 'behind me'],
      a: "If you think you are being followed:\n• Do not go home. Head to a crowded, well-lit place - a shop, cafe, metro or bus stand.\n• Call 112 or 181 and stay on the line.\n• Share your live location from the Location section with someone you trust.\n• Note the person's description and any vehicle number.\n• If you are in a cab, share the trip and the number plate." },
    { k: ['fir', 'complaint', 'police station', 'register', 'zero fir'],
      a: "To file an FIR:\n• Go to any police station. You can file a Zero FIR at any station, even outside the area where it happened.\n• Give the date, time, place and facts in writing.\n• Ask for a free copy of the FIR with its number - that is your right.\n• If the station refuses, complain to the Superintendent of Police or use the state police portal.\n• Use the complaint sheet in the Report section to prepare your written complaint." },
    { k: ['emergency', 'helpline', 'number', '112', '181', 'dial', 'ambulance'],
      a: "Emergency numbers in India:\n• 112 - all emergencies\n• 181 - women's helpline\n• 1091 - women in distress\n• 100 - police\n• 102 - ambulance\n• 1098 - childline\n• 1930 - cyber crime\nAll of these are one tap away in the Helplines section." },
    { k: ['right', 'law', 'legal', 'entitled', 'justice', 'court'],
      a: "A few rights that matter:\n• You can file an FIR at any police station (Zero FIR).\n• Refusing to register a cognisable offence is not allowed.\n• You are entitled to free legal aid through NALSA or your District Legal Services Authority.\n• For workplace harassment the POSH Act requires an Internal Committee.\n• A woman generally cannot be arrested at night without special permission.\nSee the Rights section for details." },
    { k: ['online', 'cyber', 'internet', 'social media', 'whatsapp', 'morph', 'blackmail', 'threat'],
      a: "For online harassment:\n• Do not delete anything. Screenshot and save the evidence.\n• Report and block the account on the platform.\n• File a complaint at cybercrime.gov.in or call 1930.\n• You can also visit your nearest cyber cell.\n• Obscene messages and threats are offences under the IT Act and the BNS." },
    { k: ['domestic', 'husband', 'in-laws', 'home', 'family violence'],
      a: "If there is violence at home:\n• Your safety first. Get to a safe place and call 112 or 181.\n• The Protection of Women from Domestic Violence Act, 2005 covers physical, sexual, verbal, emotional and economic abuse.\n• You can ask for a protection order, a residence order and monetary relief.\n• A Protection Officer or the 181 helpline can guide you." },
    { k: ['workplace', 'office', 'boss', 'colleague', 'posh', 'at work', 'job'],
      a: "For workplace harassment:\n• The POSH Act, 2013 applies to every workplace.\n• Workplaces with 10 or more employees must have an Internal Committee.\n• You can complain to the IC. Smaller workplaces have a Local Committee.\n• Keep a written record of dates and what happened." },
    { k: ['safe', 'safety', 'tip', 'precaution', 'travel', 'night'],
      a: "Everyday safety habits:\n• Share your live location before you travel.\n• In a cab, note the number plate and send it to someone.\n• Trust your gut. Leave if something feels wrong.\n• Sit near the driver or in a lit, busy spot.\n• Keep your phone charged and the SOS button within reach." },
    { k: ['fake call', 'escape', 'uncomfortable', 'bad date', 'creepy', 'get away'],
      a: "If you need an exit:\n• Use the Fake Call tool. It rings like a real call so you can step away.\n• Say 'Sorry, I have to take this' and walk to a safe, public place.\n• You never owe a stranger politeness." },
    { k: ['sos', 'panic', 'alarm', 'siren', 'emergency button'],
      a: "The SOS button arms a 5-second countdown, then sounds the siren, vibrates, flashes the screen and shares your location. Sign in and the server will also alert your trusted contacts by SMS or email." },
    { k: ['contact', 'trusted', 'circle', 'sync'],
      a: "Add up to 8 trusted contacts in the Contacts section. They are stored only on your device unless you sign in and sync them. On SOS the server can email or text them a live-location link." },
    { k: ['hello', 'hi', 'namaste', 'who are you', 'help', 'what can you do'],
      a: "I am the Sakhi Assistant. I can explain your rights, emergency numbers, how to file a complaint, and what to do in situations like being followed or harassed. Ask me anything, or tap a suggestion below." }
  ],
  CHIPS_EN: [
    'I think I am being followed',
    'How do I file an FIR?',
    'Emergency numbers',
    'My legal rights',
    'Someone is harassing me online'
  ],
  UI_STRINGS: [
    'Thinking…',
    'Could not reach the assistant. Please try again.',
    "I am the Sakhi Assistant. Ask me about your rights, emergency numbers, filing a complaint, or what to do if you feel unsafe.",
    'Add your name and a description first',
    'Declaration signed. This complaint is ready to submit.',
    'Tip: tick the declaration box before submitting this to a police station.',
    'Complaint generated',
    'Complaint copied',
    'Complaint downloaded',
    'Complaint saved to cloud',
    'Generate the complaint first'
  ],
  FALLBACK_ANSWER: "I am not sure about that one. I can help with: emergency numbers, filing an FIR, your legal rights, online harassment, domestic violence, workplace harassment, safety tips, or using the SOS and fake-call tools."
};
