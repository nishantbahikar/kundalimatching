export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const d = req.body;
  if (!d) return res.status(400).json({ error: 'No data provided' });

  const html = buildReportHTML(d);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

function buildReportHTML(d) {
  const KOOTS = [
    { name:'Varna',        max:1,  sub:'Spiritual compatibility'  },
    { name:'Vashya',       max:2,  sub:'Attraction & influence'   },
    { name:'Tara',         max:3,  sub:'Birth star compatibility' },
    { name:'Yoni',         max:4,  sub:'Physical harmony'         },
    { name:'Graha Maitri', max:5,  sub:'Planetary friendship'     },
    { name:'Gana',         max:6,  sub:'Temperament & nature'     },
    { name:'Bhakoot',      max:7,  sub:'Wealth & longevity'       },
    { name:'Nadi',         max:8,  sub:'Health & progeny'         },
  ];

  const total    = d.total || 0;
  const scores   = d.scores || {};
  const info     = d.info   || {};
  const boyKoot  = d.boy_koot  || {};
  const girlKoot = d.girl_koot || {};

  const verdictColor = total >= 21 ? '#1D6A3E' : total >= 18 ? '#92510A' : '#8B1A1A';
  const verdictBg    = total >= 21 ? '#EAF3DE' : total >= 18 ? '#FAEEDA' : '#FCEBEB';
  const verdictText  = total >= 28 ? 'Excellent Match'
                     : total >= 21 ? 'Good Match'
                     : total >= 18 ? 'Average Match'
                     : 'Needs Review';
  const verdictSub   = total >= 28 ? 'An auspicious union — top tier compatibility'
                     : total >= 21 ? 'Recommended for marriage — proceed with confidence'
                     : total >= 18 ? 'Acceptable match — some areas need attention'
                     : 'Below minimum threshold — consult a Jyotishi before proceeding';

  const date = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const circ = 2 * Math.PI * 52;
  const dashOffset = circ * (1 - total / 36);
  const arcColor = total >= 21 ? '#1D9E75' : total >= 18 ? '#e8a84a' : '#e07060';

  function bar(score, max) {
    const pct   = Math.round(score / max * 100);
    const color = pct >= 75 ? '#1D9E75' : pct >= 40 ? '#BA7517' : '#E24B4A';
    return `<div style="flex:1;height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
      <div style="width:${pct}%;height:5px;background:${color};border-radius:3px;"></div>
    </div>`;
  }

  function tier(s, m) {
    const p = s / m;
    if (p >= .75) return { l:'Strong',  c:'#1D6A3E', bg:'#EAF3DE' };
    if (p >= .4)  return { l:'Average', c:'#92510A', bg:'#FAEEDA' };
    return              { l:'Weak',    c:'#8B1A1A', bg:'#FCEBEB' };
  }

  function doshaRow(label, val, clearTxt, presentTxt, partialTxt) {
    const color = val === 'clear' ? '#1D6A3E' : val === 'present' ? '#8B1A1A' : '#92510A';
    const bg    = val === 'clear' ? '#EAF3DE' : val === 'present' ? '#FCEBEB' : '#FAEEDA';
    const lbl   = val === 'clear' ? 'Clear'   : val === 'present' ? 'Present' : 'Partial';
    const desc  = val === 'clear' ? clearTxt : val === 'present' ? presentTxt : partialTxt;
    return `<tr>
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#1a1a1a;border-bottom:1px solid #f0f0f0;width:140px;">${label}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;width:80px;">
        <span style="background:${bg};color:${color};font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;">${lbl}</span>
      </td>
      <td style="padding:9px 12px;font-size:11px;color:#555;line-height:1.6;border-bottom:1px solid #f0f0f0;">${desc}</td>
    </tr>`;
  }

  const kootRows = KOOTS.map(k => {
    const sc = Number(scores[k.name] || 0);
    const t  = tier(sc, k.max);
    return `<tr>
      <td style="padding:8px 12px;font-size:12px;color:#1a1a1a;border-bottom:1px solid #f5f5f5;">
        <div style="font-weight:600;">${k.name}</div>
        <div style="font-size:10px;color:#999;margin-top:1px;">${k.sub}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f5f5f5;min-width:120px;">
        <div style="display:flex;align-items:center;gap:8px;">${bar(sc, k.max)}</div>
      </td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5;">
        <div style="font-size:15px;font-weight:300;color:#1a1a1a;">${sc}<span style="font-size:10px;color:#999;">/${k.max}</span></div>
        <span style="background:${t.bg};color:${t.c};font-size:9px;font-weight:600;padding:1px 6px;border-radius:100px;">${t.l}</span>
      </td>
    </tr>`;
  }).join('');

  const mangalSev = d.mangal_severity ? ` · ${d.mangal_severity} severity` : '';
  const mangalDesc = (d.mangal_detail || '') + (d.mangal_severity ? ` Severity: ${d.mangal_severity}.` : '');

  const paragraphs = (d.interpretation || '').split('\n').filter(p => p.trim())
    .map(p => `<p style="margin-bottom:10px;font-size:12px;line-height:1.8;color:#444;">${p}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kundali Match — ${d.boyName || 'Boy'} & ${d.girlName || 'Girl'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; font-weight: 300; background: #fff; color: #1a1a1a; }
  .serif { font-family: 'Cormorant Garamond', serif; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm 18mm; background: #fff; }
  .page-break { page-break-after: always; }
  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
    .page { padding: 12mm 16mm; }
    @page { margin: 0; size: A4; }
  }
  .print-btn {
    position: fixed; bottom: 24px; right: 24px;
    background: #c9a84c; color: #fff; border: none;
    border-radius: 10px; padding: 12px 24px;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; box-shadow: 0 4px 20px rgba(201,168,76,.4);
    display: flex; align-items: center; gap: 8px;
    z-index: 999;
  }
  .print-btn:hover { background: #e8c97a; }
  .section-title {
    display: flex; align-items: center; gap: 10px; margin: 20px 0 12px;
  }
  .section-title .num {
    width: 20px; height: 20px; border-radius: 50%;
    background: #f5f5f5; border: 1px solid #e0e0e0;
    font-size: 10px; font-weight: 600; color: #888;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .section-title .label {
    font-family: 'Cormorant Garamond', serif; font-size: 16px; color: #1a1a1a;
  }
  .section-title .line { flex: 1; height: 0.5px; background: #e8e8e8; }
</style>
</head>
<body>

<!-- Print button -->
<button class="print-btn no-print" onclick="window.print()">
  ⬇ Save as PDF
</button>

<!-- PAGE 1: COVER -->
<div class="page page-break" style="background:linear-gradient(160deg,#0c0a08 0%,#1c1710 60%,#0c0a08 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;">

  <div style="position:absolute;width:380px;height:380px;border-radius:50%;border:0.5px solid rgba(201,168,76,.15);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
  <div style="position:absolute;width:280px;height:280px;border-radius:50%;border:0.5px solid rgba(201,168,76,.1);top:50%;left:50%;transform:translate(-50%,-50%);"></div>

  <div style="text-align:center;position:relative;z-index:1;">
    <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#c9a84c;margin-bottom:16px;">Ashtakoot Guna Milan</div>
    <div class="serif" style="font-size:38px;font-weight:300;color:#f5efe6;line-height:1.1;margin-bottom:6px;">Kundali Match</div>
    <div class="serif" style="font-size:20px;font-weight:300;font-style:italic;color:#e8c97a;margin-bottom:36px;">Compatibility Report</div>

    <div style="display:flex;align-items:center;justify-content:center;gap:28px;margin-bottom:36px;">
      <div style="text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(124,184,212,.15);border:1px solid rgba(124,184,212,.3);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
          <span style="font-size:20px;color:#7eb8d4;font-weight:500;">${(d.boyName||'B')[0].toUpperCase()}</span>
        </div>
        <div style="font-size:15px;color:#f5efe6;">${d.boyName || 'Boy'}</div>
        <div style="font-size:10px;color:rgba(245,239,230,.45);margin-top:2px;">${info.boy_rashi||''} · ${info.boy_nakshatra||''}</div>
      </div>
      <div class="serif" style="font-size:24px;color:rgba(201,168,76,.4);">✦</div>
      <div style="text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(212,160,176,.15);border:1px solid rgba(212,160,176,.3);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
          <span style="font-size:20px;color:#d4a0b0;font-weight:500;">${(d.girlName||'G')[0].toUpperCase()}</span>
        </div>
        <div style="font-size:15px;color:#f5efe6;">${d.girlName || 'Girl'}</div>
        <div style="font-size:10px;color:rgba(245,239,230,.45);margin-top:2px;">${info.girl_rashi||''} · ${info.girl_nakshatra||''}</div>
      </div>
    </div>

    <div style="position:relative;width:110px;height:110px;margin:0 auto 18px;">
      <svg width="110" height="110" viewBox="0 0 110 110" style="transform:rotate(-90deg);">
        <circle cx="55" cy="55" r="52" stroke="rgba(201,168,76,0.2)" stroke-width="7" fill="none"/>
        <circle cx="55" cy="55" r="52" stroke="${arcColor}" stroke-width="7" fill="none"
          stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${dashOffset.toFixed(1)}"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div class="serif" style="font-size:30px;font-weight:300;color:#f5efe6;line-height:1;">${total}</div>
        <div style="font-size:10px;color:rgba(245,239,230,.5);">of 36</div>
      </div>
    </div>

    <div style="display:inline-block;background:${verdictBg};color:${verdictColor};font-size:11px;font-weight:600;padding:4px 16px;border-radius:100px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;">${verdictText}</div>
    <div style="font-size:12px;color:rgba(245,239,230,.55);">${verdictSub}</div>
  </div>

  <div style="position:absolute;bottom:28px;left:0;right:0;text-align:center;">
    <div style="font-size:10px;color:rgba(201,168,76,.5);letter-spacing:.1em;">kundalimatch.ai · ${date}</div>
  </div>
</div>

<!-- PAGE 2: REPORT -->
<div class="page">

  <!-- Birth Profiles -->
  <div class="section-title"><div class="num">1</div><div class="label">Birth Profiles</div><div class="line"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px;">
    ${[
      { name:d.boyName||'Boy',  tag:'Boy / Groom',  rashi:info.boy_rashi,  nak:info.boy_nakshatra,  nadi:boyKoot.Nadi,  gana:boyKoot.Gana,  color:'#E6F1FB', tc:'#0C447C' },
      { name:d.girlName||'Girl',tag:'Girl / Bride', rashi:info.girl_rashi, nak:info.girl_nakshatra, nadi:girlKoot.Nadi, gana:girlKoot.Gana, color:'#FBEAF0', tc:'#72243E' }
    ].map(p => `
      <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${p.color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:${p.tc};">${p.name[0].toUpperCase()}</div>
          <div><div style="font-size:13px;font-weight:500;">${p.name}</div><div style="font-size:10px;color:#999;">${p.tag}</div></div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Rashi</td><td style="font-size:11px;font-weight:500;text-align:right;">${p.rashi||'—'}</td></tr>
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Nakshatra</td><td style="font-size:11px;font-weight:500;text-align:right;">${p.nak||'—'}</td></tr>
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Nadi</td><td style="font-size:11px;font-weight:500;text-align:right;">${p.nadi||'—'}</td></tr>
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Gana</td><td style="font-size:11px;font-weight:500;text-align:right;">${p.gana||'—'}</td></tr>
        </table>
      </div>`).join('')}
  </div>

  <!-- Ashtakoot Scores -->
  <div class="section-title"><div class="num">2</div><div class="label">Ashtakoot Scores</div><div class="line"></div></div>
  <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;overflow:hidden;margin-bottom:4px;">
    <table style="width:100%;border-collapse:collapse;">
      ${kootRows}
      <tr>
        <td colspan="2" style="padding:10px 12px;background:#f5f5f5;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #e8e8e8;">Total Score</td>
        <td style="padding:10px 12px;background:#f5f5f5;text-align:right;border-top:1px solid #e8e8e8;">
          <span style="background:${verdictBg};color:${verdictColor};font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;margin-right:8px;">${verdictText}</span>
          <span style="font-size:20px;font-weight:300;color:#1a1a1a;">${total}</span>
          <span style="font-size:11px;color:#999;">/ 36</span>
        </td>
      </tr>
    </table>
  </div>

  <!-- Dosha Check -->
  <div class="section-title"><div class="num">3</div><div class="label">Dosha Check</div><div class="line"></div></div>
  <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;overflow:hidden;margin-bottom:4px;">
    <table style="width:100%;border-collapse:collapse;">
      ${doshaRow('Nadi Dosha',    d.nadi_dosha,    'Different nadis — no dosha. Health of children and vitality is well matched.', 'Same nadi detected. Serious concern for progeny and long-term health.', 'Partial concern. Worth discussing with a Jyotishi.')}
      ${doshaRow('Bhakoot Dosha', d.bhakoot_dosha, 'Auspicious rashi axis. Good for wealth and longevity.', 'Problematic rashi axis (6–8 Shadastak or 2–12). Financial challenges possible.', 'Partial concern — not the most severe combination.')}
      ${doshaRow('Gana Dosha',    d.gana_dosha,    'Compatible gana. Harmonious temperament in daily life.', 'Gana mismatch — temperament differences may cause friction.', 'Partial gana mismatch. Some differences but manageable.')}
      ${doshaRow('Mangal Dosha',  d.mangal_dosha,  mangalDesc||'No Mangal dosha in either chart.', mangalDesc||'Mangal dosha present. Remedies should be explored.', mangalDesc||'Possible Mangal influence. Chart review recommended.')}
    </table>
  </div>

  <!-- Interpretation -->
  <div class="section-title"><div class="num">4</div><div class="label">Interpretation</div><div class="line"></div></div>
  <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
    ${paragraphs || '<p style="font-size:12px;color:#999;">No interpretation available.</p>'}
  </div>

  <!-- Disclaimer + Footer -->
  <div style="background:#fffbf0;border:1px solid #f0e4c0;border-radius:8px;padding:10px 14px;margin-bottom:16px;">
    <div style="font-size:10px;color:#888;line-height:1.6;"><strong style="color:#666;">Disclaimer:</strong> This report is generated using Vedic astrology principles and AI interpretation, for informational purposes only. It should not be the sole basis for any marriage decision. Please consult a certified Jyotish practitioner for authoritative guidance.</div>
  </div>
  <div style="text-align:center;padding-top:12px;border-top:1px solid #f0f0f0;">
    <div style="font-size:10px;color:#ccc;letter-spacing:.08em;">kundalimatch.ai · Vedic astrology · AI interpreted · ${date}</div>
  </div>

</div>

<script>
  // Auto-open print dialog after fonts load
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 800);
  });
</script>
</body>
</html>`;
}
