export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { boyName, girlName, boyDob, girlDob, boyLat, boyLon, girlLat, girlLon } = req.body;
  const clientId     = process.env.PROKERALA_CLIENT_ID;
  const clientSecret = process.env.PROKERALA_CLIENT_SECRET;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!clientId || !clientSecret)
    return res.status(500).json({ error: 'Astrology API credentials missing. Add PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET to Vercel env vars and redeploy.', has_client_id: !!clientId, has_client_secret: !!clientSecret });
  if (!anthropicKey)
    return res.status(500).json({ error: 'AI API key missing in Vercel env vars.' });
  if (!boyDob || !girlDob || !boyLat || !girlLat)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    // ── STEP 1: Auth token ───────────────────────────────────────────────
    const tokenRes = await fetch('https://api.prokerala.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenData.access_token)
      return res.status(500).json({ error: 'Authentication failed. Check your API credentials.', detail: tokenData });
    const token = tokenData.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    // ── STEP 2: All 3 API calls in parallel ──────────────────────────────
    // Kundli Matching + Mangal Dosha for Boy + Mangal Dosha for Girl
    const [matchRes, mangalBoyRes, mangalGirlRes] = await Promise.all([
      fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${new URLSearchParams({
        girl_dob: girlDob, girl_coordinates: `${girlLat},${girlLon}`,
        boy_dob:  boyDob,  boy_coordinates:  `${boyLat},${boyLon}`,
        ayanamsa: '1'
      })}`, { headers }),
      fetch(`https://api.prokerala.com/v2/astrology/mangal-dosha?${new URLSearchParams({
        datetime:    boyDob,
        coordinates: `${boyLat},${boyLon}`,
        ayanamsa:    '1'
      })}`, { headers }),
      fetch(`https://api.prokerala.com/v2/astrology/mangal-dosha?${new URLSearchParams({
        datetime:    girlDob,
        coordinates: `${girlLat},${girlLon}`,
        ayanamsa:    '1'
      })}`, { headers })
    ]);

    const [matchData, mangalBoyData, mangalGirlData] = await Promise.all([
      matchRes.json().catch(() => ({})),
      mangalBoyRes.json().catch(() => ({})),
      mangalGirlRes.json().catch(() => ({}))
    ]);

    if (matchRes.status !== 200 || !matchData.data)
      return res.status(500).json({
        error: 'Kundali matching API error (HTTP ' + matchRes.status + ')',
        fix: matchRes.status === 401 ? 'Check credentials and redeploy'
           : matchRes.status === 403 ? 'Plan does not include this endpoint'
           : matchRes.status === 429 ? 'Rate limit hit — wait a minute'
           : 'Check API status',
        detail: matchData
      });

    // ── STEP 3: Parse kundli matching ────────────────────────────────────
    const r        = matchData.data.result || matchData.data;
    const boyInfo  = r.boy_info  || {};
    const girlInfo = r.girl_info || {};
    const bKoot    = boyInfo.koot  || {};
    const gKoot    = girlInfo.koot || {};
    const total    = Number(r.guna_milan?.total_points || 0);

    const scores = {
      'Varna':        calcVarna(bKoot.varna,        gKoot.varna),
      'Vashya':       calcVashya(bKoot.vasya,        gKoot.vasya),
      'Tara':         calcTara(bKoot.tara,           gKoot.tara),
      'Yoni':         calcYoni(bKoot.yoni,           gKoot.yoni),
      'Graha Maitri': calcMaitri(bKoot.graha_maitri, gKoot.graha_maitri),
      'Gana':         calcGana(bKoot.gana,           gKoot.gana),
      'Bhakoot':      calcBhakoot(bKoot.bhakoot,     gKoot.bhakoot),
      'Nadi':         calcNadi(bKoot.nadi,           gKoot.nadi),
    };

    const info = {
      boy_rashi:      boyInfo.rasi?.name      || '—',
      boy_nakshatra:  boyInfo.nakshatra?.name  || '—',
      girl_rashi:     girlInfo.rasi?.name     || '—',
      girl_nakshatra: girlInfo.nakshatra?.name || '—',
    };

    // Expose raw koot values for display in UI
    const boy_koot  = { Varna: bKoot.varna, Vashya: bKoot.vasya, Tara: bKoot.tara, Yoni: bKoot.yoni, 'Graha Maitri': bKoot.graha_maitri, Gana: bKoot.gana, Bhakoot: bKoot.bhakoot, Nadi: bKoot.nadi };
    const girl_koot = { Varna: gKoot.varna, Vashya: gKoot.vasya, Tara: gKoot.tara, Yoni: gKoot.yoni, 'Graha Maitri': gKoot.graha_maitri, Gana: gKoot.gana, Bhakoot: gKoot.bhakoot, Nadi: gKoot.nadi };

    // ── STEP 4: Dosha flags ──────────────────────────────────────────────
    const nadi_dosha    = scores['Nadi']    === 0 ? 'present' : scores['Nadi']    < 8 ? 'partial' : 'clear';
    const bhakoot_dosha = scores['Bhakoot'] === 0 ? 'present' : scores['Bhakoot'] < 7 ? 'partial' : 'clear';
    const gana_dosha    = scores['Gana']    === 0 ? 'present' : scores['Gana']    < 4 ? 'partial' : 'clear';

    // ── STEP 5: Mangal dosha — real calculation from API ─────────────────
    const boyMangal  = parseMangal(mangalBoyData);
    const girlMangal = parseMangal(mangalGirlData);

    let mangal_dosha, mangal_detail;
    if (!boyMangal.hasDosha && !girlMangal.hasDosha) {
      mangal_dosha  = 'clear';
      mangal_detail = 'Neither person has Mangal dosha. Mars is not placed in a sensitive house in either chart.';
    } else if (boyMangal.hasDosha && girlMangal.hasDosha) {
      mangal_dosha  = 'clear';
      mangal_detail = 'Both have Mangal dosha — this cancels out by traditional Vedic rules. The match is not adversely affected.';
    } else if (boyMangal.hasDosha || girlMangal.hasDosha) {
      mangal_dosha  = 'present';
      const who = boyMangal.hasDosha ? (boyName||'Boy') : (girlName||'Girl');
      mangal_detail = `${who} has Mangal dosha. Remedies or matching with a Mangalik partner are traditionally recommended.`;
    } else {
      mangal_dosha  = 'partial';
      mangal_detail = 'Mangal dosha status could not be fully determined. A detailed chart review is recommended.';
    }

    // ── STEP 6: AI interpretation ────────────────────────────────────────
    let interpretation = '';
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{ role: 'user', content:
`You are a warm Vedic astrology expert. Write a 3-paragraph interpretation for ${boyName||'the boy'} and ${girlName||'the girl'}.

Ashtakoot scores: ${Object.entries(scores).map(([k,v])=>`${k}=${v}`).join(', ')}
Total: ${total}/36
Boy — Rashi: ${info.boy_rashi}, Nakshatra: ${info.boy_nakshatra}, Nadi: ${bKoot.nadi||'?'}, Gana: ${bKoot.gana||'?'}
Girl — Rashi: ${info.girl_rashi}, Nakshatra: ${info.girl_nakshatra}, Nadi: ${gKoot.nadi||'?'}, Gana: ${gKoot.gana||'?'}
Nadi dosha: ${nadi_dosha}, Bhakoot dosha: ${bhakoot_dosha}, Gana dosha: ${gana_dosha}
Mangal dosha: ${mangal_detail}

Para 1: What the total score means and the overall compatibility picture.
Para 2: Key strengths from high-scoring koots, honest concerns from weak scores or doshas. If Bhakoot=0, explain clearly.
Para 3: Practical, compassionate advice — remedies if needed, next steps.

Flowing prose only. No bullets or headers.` }]
        })
      });
      const cd = await claudeRes.json();
      interpretation = cd.content?.[0]?.text || '';
    } catch(e) { console.error('AI error:', e.message); }

    if (!interpretation) {
      interpretation = `This match scores ${total} out of 36. ${total>=24?'A good match — most key compatibility factors align well.':total>=18?'An average match — some areas need careful attention.':'This pairing has notable challenges. A qualified Jyotishi should review the full charts.'} ${r.message?.description||''}`;
    }

    return res.status(200).json({
      scores, total, info, boy_koot, girl_koot,
      nadi_dosha, bhakoot_dosha, gana_dosha,
      mangal_dosha, mangal_detail,
      interpretation
    });

  } catch(e) {
    console.error('Unhandled error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

// ── MANGAL DOSHA PARSER ───────────────────────────────────────────────────────
function parseMangal(data) {
  // Prokerala returns data.data.result.has_mangal_dosha (bool) or manglik_status
  if (!data?.data) return { hasDosha: false, desc: '' };
  const result = data.data.result || data.data;
  const has = result.has_mangal_dosha ?? result.manglik_status ?? result.has_dosha ?? false;
  const desc = result.description || result.mangal_dosha_description || '';
  return { hasDosha: Boolean(has), desc };
}

// ── KOOT CALCULATORS ─────────────────────────────────────────────────────────
function calcVarna(b, g) {
  const rank = { brahmin:4, kshatriya:3, vaishya:2, shudra:1 };
  const br = rank[(b||'').toLowerCase()] || 0;
  const gr = rank[(g||'').toLowerCase()] || 0;
  return br >= gr ? 1 : 0;
}
function calcVashya(b, g) {
  const groups = { manava:['manava','vanachara'], chatushpada:['chatushpada','vanachara'], jalachara:['jalachara','kita'], vanachara:['vanachara','manava','chatushpada'], kita:['kita','jalachara'] };
  const bk=(b||'').toLowerCase(), gk=(g||'').toLowerCase();
  if(bk===gk) return 2;
  if(groups[bk]?.includes(gk)) return 1;
  return 0;
}
function calcTara(b, g) {
  const naks=['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
  const bi=naks.findIndex(n=>n.toLowerCase()===(b||'').toLowerCase());
  const gi=naks.findIndex(n=>n.toLowerCase()===(g||'').toLowerCase());
  if(bi<0||gi<0) return 1;
  const tara=((gi-bi+27)%27)%9+1;
  return [1,3,5,7].includes(tara)?3:tara===2||tara===4||tara===6?1:0;
}
function calcYoni(b, g) {
  const enemies={Ashwa:'Mahisha',Mahisha:'Ashwa',Gaja:'Simha',Simha:'Gaja',Mesha:'Vanara',Vanara:'Mesha',Sarpa:'Nakula',Nakula:'Sarpa',Shwana:'Mriga',Mriga:'Shwana',Marjara:'Mushaka',Mushaka:'Marjara',Gau:'Vyaghra',Vyaghra:'Gau'};
  if(!b||!g) return 2;
  if(b===g) return 4;
  if(enemies[b]===g||enemies[g]===b) return 0;
  return 2;
}
function calcMaitri(b, g) {
  const friends={Sun:['Moon','Mars','Jupiter'],Moon:['Sun','Mercury'],Mars:['Sun','Moon','Jupiter'],Mercury:['Sun','Venus'],Jupiter:['Sun','Moon','Mars'],Venus:['Mercury','Saturn'],Saturn:['Mercury','Venus']};
  if(!b||!g) return 3;
  if(b===g) return 5;
  if(friends[b]?.includes(g)&&friends[g]?.includes(b)) return 5;
  if(friends[b]?.includes(g)||friends[g]?.includes(b)) return 4;
  return 3;
}
function calcGana(b, g) {
  const norm=s=>(s||'').toLowerCase().trim();
  const bg=norm(b), gg=norm(g);
  const isDeva=s=>s.includes('dev'), isManav=s=>s.includes('manav')||s.includes('human')||s.includes('manush'), isRaksh=s=>s.includes('rakshas');
  if(bg===gg) return 6;
  if((isDeva(bg)&&isManav(gg))||(isManav(bg)&&isDeva(gg))) return 5;
  if((isManav(bg)&&isRaksh(gg))||(isRaksh(bg)&&isManav(gg))) return 1;
  if((isDeva(bg)&&isRaksh(gg))||(isRaksh(bg)&&isDeva(gg))) return 0;
  return 3;
}
function calcBhakoot(b, g) {
  const rashis=['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya','Tula','Vrischika','Dhanu','Makara','Kumbha','Meena'];
  const bi=rashis.findIndex(r=>r.toLowerCase()===(b||'').toLowerCase());
  const gi=rashis.findIndex(r=>r.toLowerCase()===(g||'').toLowerCase());
  if(bi<0||gi<0) return 3;
  if(bi===gi) return 7;
  const diff=((gi-bi+12)%12)+1, rdiff=((bi-gi+12)%12)+1;
  if((diff===6&&rdiff===8)||(diff===8&&rdiff===6)) return 0;
  if((diff===2&&rdiff===12)||(diff===12&&rdiff===2)) return 0;
  if((diff===4&&rdiff===10)||(diff===10&&rdiff===4)) return 0;
  if((diff===5&&rdiff===9)||(diff===9&&rdiff===5)) return 7;
  return 7;
}
function calcNadi(b, g) {
  if(!b||!g) return 4;
  return b.toLowerCase()===g.toLowerCase()?0:8;
}
