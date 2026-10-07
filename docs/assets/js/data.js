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
};
