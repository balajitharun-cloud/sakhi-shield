'use strict';

/**
 * Public live-location viewer.
 *
 * Rendered server-side as a plain HTML string so a trusted contact can open a
 * share link in any browser with no app install. It polls the public JSON
 * endpoint every 15s and refreshes the map.
 */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sharePage(meta) {
  // meta === null  -> link invalid / expired
  if (!meta) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link not valid - Sakhi Shield</title>
<style>body{font-family:system-ui,sans-serif;background:#15100f;color:#f6ecec;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
h1{font-size:1.4rem}p{color:#b3a2a4}</style></head>
<body><div><h1>This share link isn't valid</h1>
<p>It may have expired or been mistyped. Ask the sender for a fresh link.</p></div></body></html>`;
  }

  const token = esc(meta.token);
  const owner = esc(meta.owner);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#c81e4a">
<title>${owner} - live location | Sakhi Shield</title>
<style>
  :root{--bg:#15100f;--surface:#1f1817;--border:rgba(255,255,255,.1);--text:#f6ecec;--dim:#b3a2a4;--sos:#ff4d78;--safe:#3ecf9a}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
  .wrap{width:min(760px,100%);margin:0 auto;padding:18px}
  header{display:flex;align-items:center;gap:12px;padding:14px 0}
  .dot{width:10px;height:10px;border-radius:50%;background:var(--sos);animation:p 1.4s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.25}}
  h1{font-size:1.15rem;margin:0}
  .sub{color:var(--dim);font-size:.85rem}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:14px}
  .status{font-weight:700}
  .status.active{color:var(--sos)}
  .status.resolved{color:var(--safe)}
  .map{border-radius:14px;overflow:hidden;border:1px solid var(--border);aspect-ratio:16/11;background:#0d0a0a}
  .map iframe{width:100%;height:100%;border:0;display:block}
  .coords{font-family:ui-monospace,Menlo,monospace;font-size:.82rem;color:var(--dim);word-break:break-all}
  a.btn{display:inline-block;margin-top:10px;background:var(--sos);color:#fff;text-decoration:none;padding:9px 14px;border-radius:10px;font-weight:600;font-size:.88rem}
  .foot{color:var(--dim);font-size:.78rem;text-align:center;padding:10px 0 30px}
</style></head>
<body>
<div class="wrap">
  <header>
    <span class="dot" aria-hidden="true"></span>
    <div><h1>${owner}'s live location</h1>
      <div class="sub" id="updated">Loading…</div></div>
  </header>

  <div class="card">
    <div>Status: <span class="status" id="status">…</span></div>
    <p class="coords" id="coords">Fetching…</p>
    <a class="btn" id="maps" href="#" target="_blank" rel="noopener">Open in Google Maps</a>
  </div>

  <div class="map" id="map"><div style="padding:40px;text-align:center;color:#b3a2a4">Waiting for a location…</div></div>

  <p class="foot">Shared via Sakhi Shield. This page refreshes automatically. If this is an emergency, call 112.</p>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
let rendered = false;

function renderMap(lat, lng){
  const d = 0.006;
  const bbox = [lng-d, lat-d, lng+d, lat+d].join('%2C');
  document.getElementById('map').innerHTML =
    '<iframe title="Live map" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' +
    bbox + '&layer=mapnik&marker=' + lat + '%2C' + lng + '"></iframe>';
  rendered = true;
}

async function refresh(){
  try{
    const r = await fetch('/api/public/share/' + TOKEN, { cache:'no-store' });
    if(!r.ok){ document.getElementById('updated').textContent = 'Share link no longer available.'; return; }
    const d = await r.json();
    const a = d.alert;
    const st = document.getElementById('status');
    st.textContent = a.status === 'active' ? 'SOS ACTIVE' : 'Resolved / safe';
    st.className = 'status ' + a.status;

    if(a.lat != null && a.lng != null){
      document.getElementById('coords').textContent =
        a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + (a.accuracy ? '  (±' + Math.round(a.accuracy) + ' m)' : '');
      document.getElementById('maps').href =
        'https://www.google.com/maps?q=' + a.lat.toFixed(6) + ',' + a.lng.toFixed(6);
      if(!rendered) renderMap(a.lat, a.lng);
    } else {
      document.getElementById('coords').textContent = 'No GPS fix yet.';
    }
    const t = new Date(a.createdAt).toLocaleString();
    document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString() + ' · started ' + t;
  }catch(e){
    document.getElementById('updated').textContent = 'Connection problem - retrying…';
  }
}
refresh();
setInterval(refresh, 15000);
</script>
</body></html>`;
}

module.exports = { sharePage };
