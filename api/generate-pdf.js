import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const data = req.body;
  if (!data) return res.status(400).json({ error: 'No data provided' });

  try {
    const html = buildReportHTML(data);

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kundali-match-${(data.boyName||'boy').toLowerCase()}-${(data.girlName||'girl').toLowerCase()}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.status(200).end(pdf);

  } catch (e) {
    console.error('PDF generation error:', e);
    res.status(500).json({ error: 'PDF generation failed: ' + e.message });
  }
}

// ── HTML TEMPLATE ─────────────────────────────────────────────────────────────
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

  const total   = d.total || 0;
  const scores  = d.scores || {};
  const info    = d.info   || {};
  const boyKoot = d.boy_koot  || {};
  const girlKoot= d.girl_koot || {};

  const verdictColor = total >= 21 ? '#1D6A3E' : total >= 18 ? '#92510A' : '#8B1A1A';
  const verdictBg    = total >= 21 ? '#EAF3DE' : total >= 18 ? '#FAEEDA' : '#FCEBEB';
  const verdictText  = total >= 28 ? 'Excellent Match' : total >= 21 ? 'Good Match' : total >= 18 ? 'Average Match' : 'Needs Review';
  const verdictSub   = total >= 28 ? 'An auspicious union — top tier compatibility'
                     : total >= 21 ? 'Recommended for marriage — proceed with confidence'
                     : total >= 18 ? 'Acceptable match — some areas need attention'
                     : 'Below minimum threshold — consult a Jyotishi before proceeding';

  function scoreBar(score, max) {
    const pct   = Math.round(score / max * 100);
    const color = pct >= 75 ? '#1D9E75' : pct >= 40 ? '#BA7517' : '#E24B4A';
    return `<div style="flex:1;height:4px;background:#e5e7eb;border-radius:2px;">
      <div style="width:${pct}%;height:4px;background:${color};border-radius:2px;"></div>
    </div>`;
  }

  function doshaRow(label, val, desc) {
    const color = val === 'clear' ? '#1D6A3E' : val === 'present' ? '#8B1A1A' : '#92510A';
    const bg    = val === 'clear' ? '#EAF3DE' : val === 'present' ? '#FCEBEB' : '#FAEEDA';
    const lbl   = val === 'clear' ? 'Clear' : val === 'present' ? 'Present' : 'Partial';
    return `<div style="padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;gap:12px;align-items:flex-start;">
      <div style="min-width:140px;font-size:12px;font-weight:600;color:#1a1a1a;">${label}</div>
      <span style="background:${bg};color:${color};font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;white-space:nowrap;margin-top:1px;">${lbl}</span>
      <div style="font-size:11px;color:#555;line-height:1.6;flex:1;">${desc||''}</div>
    </div>`;
  }

  const mangalSeverityStr = d.mangal_severity ? ` — ${d.mangal_severity} severity` : '';
  const date = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; font-weight: 300; color: #1a1a1a; background: #fff; }
  .serif { font-family: 'Cormorant Garamond', serif; }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div style="width:210mm;min-height:297mm;background:linear-gradient(160deg,#0c0a08 0%,#1c1710 60%,#0c0a08 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px;position:relative;overflow:hidden;">

  <!-- decorative circle -->
  <div style="position:absolute;width:400px;height:400px;border-radius:50%;border:0.5px solid rgba(201,168,76,0.15);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
  <div style="position:absolute;width:300px;height:300px;border-radius:50%;border:0.5px solid rgba(201,168,76,0.1);top:50%;left:50%;transform:translate(-50%,-50%);"></div>

  <div style="text-align:center;position:relative;z-index:1;">
    <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a84c;margin-bottom:20px;">Ashtakoot Guna Milan</div>
    <div class="serif" style="font-size:42px;font-weight:300;color:#f5efe6;line-height:1.1;margin-bottom:8px;">Kundali Match</div>
    <div class="serif" style="font-size:22px;font-weight:300;font-style:italic;color:#e8c97a;margin-bottom:40px;">Compatibility Report</div>

    <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:40px;">
      <div style="text-align:center;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(124,184,212,0.15);border:1px solid rgba(124,184,212,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
          <span style="font-size:22px;color:#7eb8d4;font-weight:500;">${(d.boyName||'B')[0].toUpperCase()}</span>
        </div>
        <div style="font-size:16px;color:#f5efe6;font-weight:400;">${d.boyName||'Boy'}</div>
        <div style="font-size:11px;color:rgba(245,239,230,0.45);margin-top:2px;">${info.boy_rashi||''} · ${info.boy_nakshatra||''}</div>
      </div>
      <div class="serif" style="font-size:28px;color:rgba(201,168,76,0.4);">✦</div>
      <div style="text-align:center;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(212,160,176,0.15);border:1px solid rgba(212,160,176,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
          <span style="font-size:22px;color:#d4a0b0;font-weight:500;">${(d.girlName||'G')[0].toUpperCase()}</span>
        </div>
        <div style="font-size:16px;color:#f5efe6;font-weight:400;">${d.girlName||'Girl'}</div>
        <div style="font-size:11px;color:rgba(245,239,230,0.45);margin-top:2px;">${info.girl_rashi||''} · ${info.girl_nakshatra||''}</div>
      </div>
    </div>

    <!-- Score ring -->
    <div style="width:120px;height:120px;position:relative;margin:0 auto 20px;">
      <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg);">
        <circle cx="60" cy="60" r="52" stroke="rgba(201,168,76,0.2)" stroke-width="7" fill="none"/>
        <circle cx="60" cy="60" r="52" stroke="${total>=21?'#1D9E75':total>=18?'#e8a84a':'#e07060'}" stroke-width="7" fill="none"
          stroke-linecap="round"
          stroke-dasharray="${2*Math.PI*52}"
          stroke-dashoffset="${2*Math.PI*52*(1-total/36)}"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div class="serif" style="font-size:32px;font-weight:300;color:#f5efe6;line-height:1;">${total}</div>
        <div style="font-size:11px;color:rgba(245,239,230,0.5);">of 36</div>
      </div>
    </div>

    <div style="display:inline-block;background:${verdictBg};color:${verdictColor};font-size:11px;font-weight:600;padding:5px 18px;border-radius:100px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">${verdictText}</div>
    <div style="font-size:13px;color:rgba(245,239,230,0.55);">${verdictSub}</div>
  </div>

  <div style="position:absolute;bottom:32px;left:0;right:0;text-align:center;">
    <div style="font-size:11px;color:rgba(201,168,76,0.5);letter-spacing:0.1em;">kundalimatch.ai · ${date}</div>
  </div>
</div>

<!-- PAGE 2 — MAIN REPORT -->
<div style="width:210mm;min-height:297mm;padding:40px 44px;background:#fff;">

  <!-- Section: Birth Profiles -->
  <div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:20px;height:20px;border-radius:50%;background:#f5f5f5;border:1px solid #e0e0e0;font-size:10px;font-weight:600;color:#888;display:flex;align-items:center;justify-content:center;">1</div>
      <div class="serif" style="font-size:17px;color:#1a1a1a;">Birth Profiles</div>
      <div style="flex:1;height:0.5px;background:#e8e8e8;"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${[
        {name:d.boyName||'Boy', tag:'Boy / Groom', rashi:info.boy_rashi, nak:info.boy_nakshatra, nadi:boyKoot.Nadi, gana:boyKoot.Gana, color:'#E6F1FB', textColor:'#0C447C'},
        {name:d.girlName||'Girl', tag:'Girl / Bride', rashi:info.girl_rashi, nak:info.girl_nakshatra, nadi:girlKoot.Nadi, gana:girlKoot.Gana, color:'#FBEAF0', textColor:'#72243E'}
      ].map(p=>`
        <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;padding:14px 16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:${p.color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:${p.textColor};">${p.name[0].toUpperCase()}</div>
            <div>
              <div style="font-size:14px;font-weight:500;color:#1a1a1a;">${p.name}</div>
              <div style="font-size:10px;color:#999;">${p.tag}</div>
            </div>
          </div>
          <div style="font-size:11px;color:#666;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;">Rashi <span style="color:#1a1a1a;font-weight:500;">${p.rashi||'—'}</span></div>
          <div style="font-size:11px;color:#666;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;">Nakshatra <span style="color:#1a1a1a;font-weight:500;">${p.nak||'—'}</span></div>
          <div style="font-size:11px;color:#666;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;">Nadi <span style="color:#1a1a1a;font-weight:500;">${p.nadi||'—'}</span></div>
          <div style="font-size:11px;color:#666;display:flex;justify-content:space-between;padding:3px 0;">Gana <span style="color:#1a1a1a;font-weight:500;">${p.gana||'—'}</span></div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Section: Ashtakoot Scores -->
  <div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:20px;height:20px;border-radius:50%;background:#f5f5f5;border:1px solid #e0e0e0;font-size:10px;font-weight:600;color:#888;display:flex;align-items:center;justify-content:center;">2</div>
      <div class="serif" style="font-size:17px;color:#1a1a1a;">Ashtakoot Scores</div>
      <div style="flex:1;height:0.5px;background:#e8e8e8;"></div>
    </div>
    <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;overflow:hidden;">
      ${KOOTS.map(k => {
        const sc  = Number(scores[k.name]||0);
        const pct = Math.round(sc/k.max*100);
        const tier= pct>=75?{l:'Strong',c:'#1D6A3E',bg:'#EAF3DE'}:pct>=40?{l:'Average',c:'#92510A',bg:'#FAEEDA'}:{l:'Weak',c:'#8B1A1A',bg:'#FCEBEB'};
        return `<div style="display:grid;grid-template-columns:130px 1fr 60px;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #f0f0f0;">
          <div>
            <div style="font-size:12px;font-weight:500;color:#1a1a1a;">${k.name}</div>
            <div style="font-size:10px;color:#999;">${k.sub}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${scoreBar(sc, k.max)}
          </div>
          <div style="text-align:right;">
            <div class="serif" style="font-size:15px;color:#1a1a1a;line-height:1;">${sc}<span style="font-size:10px;color:#999;">/${k.max}</span></div>
            <span style="background:${tier.bg};color:${tier.c};font-size:9px;font-weight:600;padding:1px 6px;border-radius:100px;">${tier.l}</span>
          </div>
        </div>`;
      }).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f5f5f5;border-top:1px solid #e8e8e8;">
        <div style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Total Score</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:${verdictBg};color:${verdictColor};font-size:10px;font-weight:600;padding:2px 10px;border-radius:100px;">${verdictText}</span>
          <span class="serif" style="font-size:22px;font-weight:300;color:#1a1a1a;">${total}</span>
          <span style="font-size:12px;color:#999;">/ 36</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Section: Dosha Check -->
  <div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:20px;height:20px;border-radius:50%;background:#f5f5f5;border:1px solid #e0e0e0;font-size:10px;font-weight:600;color:#888;display:flex;align-items:center;justify-content:center;">3</div>
      <div class="serif" style="font-size:17px;color:#1a1a1a;">Dosha Check</div>
      <div style="flex:1;height:0.5px;background:#e8e8e8;"></div>
    </div>
    <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;padding:4px 14px;">
      ${doshaRow('Nadi Dosha',    d.nadi_dosha,    d.nadi_dosha==='clear'?'Different nadis — no dosha. Health of children and vitality is well matched.':'Same nadi detected — serious concern for progeny and long-term health.')}
      ${doshaRow('Bhakoot Dosha', d.bhakoot_dosha, d.bhakoot_dosha==='clear'?'Auspicious rashi axis — no Bhakoot dosha.':d.bhakoot_dosha==='present'?'Problematic rashi axis (6–8 Shadastak or 2–12). Financial challenges possible.':'Partial Bhakoot concern — not the most severe combination.')}
      ${doshaRow('Gana Dosha',    d.gana_dosha,    d.gana_dosha==='clear'?'Same or compatible gana. Harmonious temperament in daily life.':'Gana mismatch — temperament differences may cause friction.')}
      ${doshaRow('Mangal Dosha',  d.mangal_dosha,  (d.mangal_detail||'') + (d.mangal_severity?' Severity: '+d.mangal_severity+'.':''))}
    </div>
  </div>

  <!-- Section: Interpretation -->
  <div style="margin-bottom:24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:20px;height:20px;border-radius:50%;background:#f5f5f5;border:1px solid #e0e0e0;font-size:10px;font-weight:600;color:#888;display:flex;align-items:center;justify-content:center;">4</div>
      <div class="serif" style="font-size:17px;color:#1a1a1a;">Interpretation</div>
      <div style="flex:1;height:0.5px;background:#e8e8e8;"></div>
    </div>
    <div style="background:#fafafa;border:1px solid #efefef;border-radius:10px;padding:16px 18px;">
      <div style="font-size:12px;line-height:1.8;color:#444;">
        ${(d.interpretation||'').split('\n').filter(p=>p.trim()).map(p=>`<p style="margin-bottom:10px;">${p}</p>`).join('')}
      </div>
    </div>
  </div>

  <!-- Disclaimer -->
  <div style="background:#fffbf0;border:1px solid #f0e4c0;border-radius:8px;padding:12px 16px;">
    <div style="font-size:10px;color:#888;line-height:1.6;"><strong style="color:#666;">Disclaimer:</strong> This report is generated using Vedic astrology principles and AI interpretation. It is for informational and guidance purposes only. Results should not be the sole basis for any marriage decision. Please consult a certified Jyotish practitioner for authoritative guidance.</div>
  </div>

  <!-- Footer -->
  <div style="margin-top:24px;text-align:center;padding-top:16px;border-top:1px solid #f0f0f0;">
    <div style="font-size:11px;color:#bbb;letter-spacing:0.08em;">kundalimatch.ai · Vedic astrology · AI interpreted · ${date}</div>
  </div>

</div>
</body>
</html>`;
}
