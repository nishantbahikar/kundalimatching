export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const d = req.body;
  if (!d) return res.status(400).json({ error: 'No data provided' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(buildHTML(d));
}

function buildHTML(d) {
  const KOOTS = [
    {name:'Varna',max:1,sub:'Spiritual compatibility'},
    {name:'Vashya',max:2,sub:'Attraction & influence'},
    {name:'Tara',max:3,sub:'Birth star compatibility'},
    {name:'Yoni',max:4,sub:'Physical harmony'},
    {name:'Graha Maitri',max:5,sub:'Planetary friendship'},
    {name:'Gana',max:6,sub:'Temperament & nature'},
    {name:'Bhakoot',max:7,sub:'Wealth & longevity'},
    {name:'Nadi',max:8,sub:'Health & progeny'},
  ];
  const total   = d.total||0;
  const scores  = d.scores||{};
  const info    = d.info||{};
  const bk      = d.boy_koot||{};
  const gk      = d.girl_koot||{};
  const vc      = total>=21?'#1D6A3E':total>=18?'#92510A':'#8B1A1A';
  const vbg     = total>=21?'#EAF3DE':total>=18?'#FAEEDA':'#FCEBEB';
  const vt      = total>=28?'Excellent Match':total>=21?'Good Match':total>=18?'Average Match':'Needs Review';
  const date    = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  const circ    = 2*Math.PI*44;
  const arc     = circ*(1-total/36);
  const ac      = total>=21?'#1D9E75':total>=18?'#e8a84a':'#e07060';

  function bar(s,m){const p=Math.round(s/m*100);const c=p>=75?'#1D9E75':p>=40?'#BA7517':'#E24B4A';return`<div style="flex:1;height:4px;background:#e5e7eb;border-radius:2px;"><div style="width:${p}%;height:4px;background:${c};border-radius:2px;"></div></div>`;}
  function tier(s,m){const p=s/m;return p>=.75?{l:'Strong',c:'#1D6A3E',bg:'#EAF3DE'}:p>=.4?{l:'Average',c:'#92510A',bg:'#FAEEDA'}:{l:'Weak',c:'#8B1A1A',bg:'#FCEBEB'};}
  function badge(v){const c=v==='clear'?'#1D6A3E':v==='present'?'#8B1A1A':'#92510A';const bg=v==='clear'?'#EAF3DE':v==='present'?'#FCEBEB':'#FAEEDA';const l=v==='clear'?'Clear':v==='present'?'Present':'Partial';return`<span style="background:${bg};color:${c};font-size:9px;font-weight:600;padding:2px 7px;border-radius:100px;">${l}</span>`;}

  const kootRows = KOOTS.map((k,i)=>{
    const sc=Number(scores[k.name]||0);
    const t=tier(sc,k.max);
    return`<tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:5px 8px;font-size:11px;color:#999;width:24px;">${i+1}</td>
      <td style="padding:5px 8px;font-size:11px;font-weight:600;color:#1a1a1a;width:110px;">${k.name}</td>
      <td style="padding:5px 8px;font-size:10px;color:#888;width:120px;">${k.sub}</td>
      <td style="padding:5px 8px;font-size:10px;color:#666;width:100px;">${bk[k.name]||'—'} / ${gk[k.name]||'—'}</td>
      <td style="padding:5px 8px;width:90px;">${bar(sc,k.max)}</td>
      <td style="padding:5px 8px;text-align:center;width:44px;font-size:12px;font-weight:600;color:#1a1a1a;">${sc}/${k.max}</td>
      <td style="padding:5px 8px;text-align:right;width:60px;"><span style="background:${t.bg};color:${t.c};font-size:9px;font-weight:600;padding:1px 6px;border-radius:100px;">${t.l}</span></td>
    </tr>`;
  }).join('');

  // Interpretation — strip bullets, make numbered list
  const points = (d.interpretation||'').split('\n').map(p=>p.replace(/^[\u2022\-\*•]\s*/,'').trim()).filter(p=>p.length>0);
  const interpHTML = points.map((p,i)=>`<div style="display:flex;gap:8px;margin-bottom:6px;"><span style="font-size:10px;font-weight:600;color:#c9a84c;min-width:16px;margin-top:1px;">${i+1}.</span><p style="font-size:11px;line-height:1.7;color:#444;margin:0;">${p}</p></div>`).join('');

  const mangalSev = d.mangal_severity ? ` · ${d.mangal_severity} severity` : '';
  const mangalDesc = d.mangal_detail || (d.mangal_dosha==='clear'?'No Mangal dosha in either chart.':'Mangal dosha present. Remedies recommended.');

  // Score scale
  const scaleItems = [{r:'0–17',l:'Not advised',a:total<18},{r:'18–20',l:'Average',a:total>=18&&total<21},{r:'21–27',l:'Good',a:total>=21&&total<28},{r:'28–36',l:'Excellent',a:total>=28}];
  const scaleHTML = scaleItems.map(s=>`<span style="font-size:9px;padding:2px 8px;border-radius:100px;background:${s.a?vbg:'#f5f5f5'};color:${s.a?vc:'#999'};font-weight:${s.a?'600':'400'};border:${s.a?'1px solid '+vc:'none'};">${s.r} ${s.l}</span>`).join('');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>Kundali Match — ${d.boyName||'Boy'} & ${d.girlName||'Girl'} | kundalimatch.ai</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;font-weight:300;background:#fff;color:#1a1a1a;font-size:12px;}
.serif{font-family:'Cormorant Garamond',serif;}
.page{width:210mm;margin:0 auto;padding:14mm 16mm;background:#fff;}
h3.sec{font-family:'Cormorant Garamond',serif;font-size:14px;color:#1a1a1a;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:8px;}
h3.sec .n{width:18px;height:18px;border-radius:50%;background:#f5f5f5;border:1px solid #e0e0e0;font-size:9px;font-weight:600;color:#888;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'DM Sans',sans-serif;}
.print-btn{position:fixed;bottom:20px;right:20px;background:#c9a84c;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;z-index:99;}
@media print{.print-btn{display:none;}@page{margin:0;size:A4;}body{margin:0;}.page{padding:10mm 14mm;}}
</style>
</head><body>

<button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>

<div class="page">

<!-- HEADER -->
<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #c9a84c;margin-bottom:14px;">
  <div>
    <div class="serif" style="font-size:22px;font-weight:300;color:#1a1a1a;line-height:1;">Kundali Match Report</div>
    <div style="font-size:10px;color:#999;margin-top:3px;letter-spacing:.05em;">kundalimatch.ai · ${date}</div>
  </div>
  <div style="text-align:center;">
    <svg width="80" height="80" viewBox="0 0 96 96" style="transform:rotate(-90deg);">
      <circle cx="48" cy="48" r="44" stroke="#f0f0f0" stroke-width="6" fill="none"/>
      <circle cx="48" cy="48" r="44" stroke="${ac}" stroke-width="6" fill="none" stroke-linecap="round"
        stroke-dasharray="${(2*Math.PI*44).toFixed(1)}" stroke-dashoffset="${(2*Math.PI*44*(1-total/36)).toFixed(1)}"/>
    </svg>
    <div style="position:relative;margin-top:-62px;text-align:center;">
      <div class="serif" style="font-size:24px;font-weight:300;line-height:1;">${total}</div>
      <div style="font-size:9px;color:#999;">of 36</div>
    </div>
    <div style="margin-top:46px;"><span style="background:${vbg};color:${vc};font-size:9px;font-weight:600;padding:2px 8px;border-radius:100px;">${vt}</span></div>
  </div>
</div>

<!-- VERDICT SCALE -->
<div style="display:flex;gap:5px;margin-bottom:14px;flex-wrap:wrap;">${scaleHTML}</div>

<!-- PROFILES -->
<h3 class="sec"><span class="n">1</span>Birth Profiles</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;">
${[{name:d.boyName||'Boy',tag:'Boy / Groom',rashi:info.boy_rashi,nak:info.boy_nakshatra,nadi:bk.Nadi,gana:bk.Gana,bhakoot:bk.Bhakoot,varna:bk.Varna,c:'#E6F1FB',tc:'#0C447C'},
   {name:d.girlName||'Girl',tag:'Girl / Bride',rashi:info.girl_rashi,nak:info.girl_nakshatra,nadi:gk.Nadi,gana:gk.Gana,bhakoot:gk.Bhakoot,varna:gk.Varna,c:'#FBEAF0',tc:'#72243E'}]
.map(p=>`<div style="background:#fafafa;border:1px solid #efefef;border-radius:8px;padding:10px 12px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    <div style="width:28px;height:28px;border-radius:50%;background:${p.c};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:${p.tc};">${p.name[0].toUpperCase()}</div>
    <div><div style="font-size:12px;font-weight:600;">${p.name}</div><div style="font-size:9px;color:#999;">${p.tag}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <tr><td style="color:#888;padding:1px 0;width:70px;">Rashi</td><td style="font-weight:500;">${p.rashi||'—'}</td><td style="color:#888;padding:1px 0;width:60px;">Nakshatra</td><td style="font-weight:500;">${p.nak||'—'}</td></tr>
    <tr><td style="color:#888;padding:1px 0;">Nadi</td><td style="font-weight:500;">${p.nadi||'—'}</td><td style="color:#888;padding:1px 0;">Gana</td><td style="font-weight:500;">${p.gana||'—'}</td></tr>
    <tr><td style="color:#888;padding:1px 0;">Bhakoot</td><td style="font-weight:500;">${p.bhakoot||'—'}</td><td style="color:#888;padding:1px 0;">Varna</td><td style="font-weight:500;">${p.varna||'—'}</td></tr>
  </table>
</div>`).join('')}
</div>

<!-- ASHTAKOOT -->
<h3 class="sec"><span class="n">2</span>Ashtakoot Scores</h3>
<table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #efefef;border-radius:8px;overflow:hidden;margin-bottom:4px;">
  <thead><tr style="background:#f0f0f0;">
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;width:20px;">#</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;">Koot</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;">What it measures</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;">Boy · Girl values</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;width:80px;">Score bar</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:center;font-weight:600;text-transform:uppercase;width:40px;">Pts</th>
    <th style="padding:5px 8px;font-size:9px;color:#888;text-align:right;font-weight:600;text-transform:uppercase;width:60px;">Rating</th>
  </tr></thead>
  <tbody>${kootRows}</tbody>
  <tfoot><tr style="background:#f5f5f5;border-top:1px solid #e8e8e8;">
    <td colspan="5" style="padding:7px 8px;font-size:10px;font-weight:600;color:#555;text-transform:uppercase;">Total score</td>
    <td style="padding:7px 8px;text-align:center;font-size:15px;font-weight:600;color:#1a1a1a;">${total}</td>
    <td style="padding:7px 8px;text-align:right;"><span style="background:${vbg};color:${vc};font-size:9px;font-weight:600;padding:2px 7px;border-radius:100px;">${vt} · ${total}/36</span></td>
  </tfoot>
</table>

<!-- DOSHA CHECK -->
<h3 class="sec"><span class="n">3</span>Dosha Analysis</h3>
<table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #efefef;border-radius:8px;overflow:hidden;margin-bottom:4px;">
  <tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:7px 10px;width:150px;font-size:11px;font-weight:600;">Mangal dosha${mangalSev}</td>
    <td style="padding:7px 10px;width:70px;">${badge(d.mangal_dosha)}</td>
    <td style="padding:7px 10px;font-size:10px;color:#555;line-height:1.6;">${mangalDesc}</td>
  </tr>
  <tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:7px 10px;font-size:11px;font-weight:600;">Nadi dosha</td>
    <td style="padding:7px 10px;">${badge(d.nadi_dosha)}</td>
    <td style="padding:7px 10px;font-size:10px;color:#555;line-height:1.6;">${d.nadi_dosha==='clear'?'Different nadis ('+( (d.boy_koot?.Nadi||'')+(d.girl_koot?.Nadi?' & '+d.girl_koot.Nadi:''))+') — no dosha. Health of children and vitality is well matched.':d.nadi_dosha==='present'?'Same nadi detected — serious concern for progeny and long-term health. Traditional remedies apply.':'Partial nadi concern. Consult a Jyotishi.'}</td>
  </tr>
  <tr style="border-bottom:1px solid #f0f0f0;">
    <td style="padding:7px 10px;font-size:11px;font-weight:600;">Bhakoot dosha</td>
    <td style="padding:7px 10px;">${badge(d.bhakoot_dosha)}</td>
    <td style="padding:7px 10px;font-size:10px;color:#555;line-height:1.6;">${d.bhakoot_dosha==='clear'?'Auspicious rashi axis — no Bhakoot dosha. Good for wealth and longevity.':d.bhakoot_dosha==='present'?'Problematic rashi axis (6–8 Shadastak or 2–12). Financial and health challenges possible.':'Partial Bhakoot concern — not the most severe combination.'}</td>
  </tr>
  <tr>
    <td style="padding:7px 10px;font-size:11px;font-weight:600;">Gana dosha</td>
    <td style="padding:7px 10px;">${badge(d.gana_dosha)}</td>
    <td style="padding:7px 10px;font-size:10px;color:#555;line-height:1.6;">${d.gana_dosha==='clear'?'Same or compatible gana — harmonious temperament in daily life.':d.gana_dosha==='present'?'Devata–Rakshasa mismatch. Significant temperament conflict between partners.':'Partial gana mismatch — some differences but manageable.'}</td>
  </tr>
</table>

<!-- SCORE INTERPRETATION GUIDE -->
<h3 class="sec"><span class="n">4</span>Score Interpretation Guide</h3>
<table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #efefef;border-radius:8px;overflow:hidden;margin-bottom:4px;">
  <tr style="border-bottom:1px solid #f0f0f0;${total<18?'background:#FCEBEB;':''}"><td style="padding:5px 10px;font-size:10px;font-weight:600;width:80px;">0–17</td><td style="padding:5px 10px;font-size:10px;font-weight:600;color:#8B1A1A;width:100px;">Not advised</td><td style="padding:5px 10px;font-size:10px;color:#555;">Below minimum threshold. Full chart analysis and pandit guidance essential before proceeding.</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;${total>=18&&total<21?'background:#FAEEDA;':''}"><td style="padding:5px 10px;font-size:10px;font-weight:600;">18–20</td><td style="padding:5px 10px;font-size:10px;font-weight:600;color:#92510A;">Average</td><td style="padding:5px 10px;font-size:10px;color:#555;">Meets minimum. Some compatibility concerns. Remedial measures and Jyotishi review advisable.</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;${total>=21&&total<28?'background:#EAF3DE;':''}"><td style="padding:5px 10px;font-size:10px;font-weight:600;">21–27</td><td style="padding:5px 10px;font-size:10px;font-weight:600;color:#1D6A3E;">Good</td><td style="padding:5px 10px;font-size:10px;color:#555;">Good compatibility across most factors. Recommended for marriage with standard precautions.</td></tr>
  <tr style="${total>=28?'background:#EAF3DE;':''}"><td style="padding:5px 10px;font-size:10px;font-weight:600;">28–36</td><td style="padding:5px 10px;font-size:10px;font-weight:600;color:#1D6A3E;">Excellent</td><td style="padding:5px 10px;font-size:10px;color:#555;">Top tier compatibility. Highly auspicious match across all key dimensions.</td></tr>
</table>

<!-- AI INTERPRETATION -->
<h3 class="sec"><span class="n">5</span>AI Interpretation</h3>
<div style="background:#fafafa;border:1px solid #efefef;border-radius:8px;padding:10px 12px;margin-bottom:4px;">
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
    <div style="width:5px;height:5px;border-radius:50%;background:#c9a84c;"></div>
    <span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#999;">AI generated · For guidance only</span>
  </div>
  ${interpHTML || '<p style="font-size:11px;color:#999;">No interpretation available.</p>'}
</div>

<!-- DISCLAIMER + FOOTER -->
<div style="background:#fffbf0;border:1px solid #f0e4c0;border-radius:6px;padding:8px 12px;margin-bottom:12px;">
  <p style="font-size:9px;color:#888;line-height:1.6;"><strong style="color:#666;">Disclaimer:</strong> This report is generated using Vedic astrology principles and AI interpretation. It is for informational and guidance purposes only, and should not be the sole basis for any marriage decision. Please consult a certified Jyotish practitioner for authoritative guidance.</p>
</div>

<!-- SITE FOOTER -->
<div style="text-align:center;padding:10px 0 0;border-top:1px solid #f0f0f0;">
  <div class="serif" style="font-size:16px;color:#c9a84c;font-weight:400;margin-bottom:4px;">kundalimatch.ai</div>
  <p style="font-size:10px;color:#999;line-height:1.6;">Generate your own free kundali match report at <a href="https://kundalimatch.ai" style="color:#c9a84c;text-decoration:none;font-weight:500;">kundalimatch.ai</a> · Vedic astrology · AI interpreted</p>
</div>

</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},800);});</script>
</body></html>`;
}
