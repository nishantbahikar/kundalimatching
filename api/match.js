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
    return res.status(500).json({ error: 'Prokerala credentials missing. Add PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET to Vercel env vars and redeploy.', has_client_id: !!clientId, has_client_secret: !!clientSecret });
  if (!anthropicKey)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing in Vercel env vars.' });
  if (!boyDob || !girlDob || !boyLat || !girlLat)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    // ── STEP 1: Prokerala token ──────────────────────────────────────────
    const tokenRes = await fetch('https://api.prokerala.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenData.access_token)
      return res.status(500).json({ error: 'Prokerala auth failed. Check your Client ID and Secret.', prokerala_response: tokenData });

    // ── STEP 2: Kundli Matching ──────────────────────────────────────────
    const params = new URLSearchParams({
      girl_dob: girlDob, girl_coordinates: `${girlLat},${girlLon}`,
      boy_dob: boyDob,   boy_coordinates:  `${boyLat},${boyLon}`,
      ayanamsa: '1'
    });
    const matchRes  = await fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${params}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const matchData = await matchRes.json().catch(() => ({}));
    if (matchRes.status !== 200 || !matchData.data)
      return res.status(500).json({ error: 'Prokerala API error (HTTP ' + matchRes.status + ')', prokerala_response: matchData });

    // ── STEP 3: Parse Prokerala response ────────────────────────────────
    // Prokerala returns koot *names* per person + total in guna_milan
    // Structure: { boy_info: { koot:{}, nakshatra:{}, rasi:{} }, girl_info: {...}, guna_milan: { total_points } }
    const r        = matchData.data.result || matchData.data;
    const boyInfo  = r.boy_info  || {};
    const girlInfo = r.girl_info || {};
    const bKoot    = boyInfo.koot  || {};
    const gKoot    = girlInfo.koot || {};

    // Total from Prokerala directly
    const total = Number(r.guna_milan?.total_points || 0);

    // Calculate individual koot scores from boy/girl koot names using standard rules
    const scores = {
      'Varna':        calcVarna(bKoot.varna,       gKoot.varna),
      'Vashya':       calcVashya(bKoot.vasya,       gKoot.vasya),
      'Tara':         calcTara(bKoot.tara,          gKoot.tara),
      'Yoni':         calcYoni(bKoot.yoni,          gKoot.yoni),
      'Graha Maitri': calcMaitri(bKoot.graha_maitri,gKoot.graha_maitri),
      'Gana':         calcGana(bKoot.gana,          gKoot.gana),
      'Bhakoot':      calcBhakoot(bKoot.bhakoot,    gKoot.bhakoot),
      'Nadi':         calcNadi(bKoot.nadi,          gKoot.nadi),
    };

    // Profile info — rasi and nakshatra are nested objects { id, name, lord }
    const info = {
      boy_rashi:      boyInfo.rasi?.name      || '—',
      boy_nakshatra:  boyInfo.nakshatra?.name  || '—',
      boy_lagna:      '—', // not returned by this endpoint
      girl_rashi:     girlInfo.rasi?.name     || '—',
      girl_nakshatra: girlInfo.nakshatra?.name || '—',
      girl_lagna:     '—',
    };

    // Dosha from scores
    const nadi_dosha    = scores['Nadi']    === 0 ? 'present' : scores['Nadi']    < 8 ? 'partial' : 'clear';
    const bhakoot_dosha = scores['Bhakoot'] === 0 ? 'present' : scores['Bhakoot'] < 7 ? 'partial' : 'clear';
    const gana_dosha    = scores['Gana']    === 0 ? 'present' : scores['Gana']    < 4 ? 'partial' : 'clear';
    // Mangal: read from message if available
    const msgDesc       = (r.message?.description || '').toLowerCase();
    const mangal_dosha  = msgDesc.includes('not affected') ? 'clear' : msgDesc.includes('mangal') ? 'present' : 'partial';

    // ── STEP 4: Claude interpretation ───────────────────────────────────
    let interpretation = '';
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{ role: 'user', content:
`You are a warm Vedic astrology expert. Write a 3-paragraph interpretation for ${boyName||'the boy'} and ${girlName||'the girl'} based on these Prokerala-verified kundali matching results:

Individual scores: ${Object.entries(scores).map(([k,v])=>`${k}=${v}`).join(', ')}
Total: ${total}/36
Boy — Rashi: ${info.boy_rashi}, Nakshatra: ${info.boy_nakshatra}, Nadi: ${bKoot.nadi||'?'}
Girl — Rashi: ${info.girl_rashi}, Nakshatra: ${info.girl_nakshatra}, Nadi: ${gKoot.nadi||'?'}
Mangal dosha: ${mangal_dosha}
Prokerala verdict: ${r.message?.description || 'N/A'}

Para 1: Overall score meaning and general picture.
Para 2: Specific strengths from high-scoring koots; honest concerns from low scores or doshas. If Bhakoot=0, explain Shadastak dosha clearly.
Para 3: Practical compassionate advice — remedies if needed, whether to see a pandit.

Flowing prose only. No bullet points or headers.` }]
        })
      });
      const cd = await claudeRes.json();
      interpretation = cd.content?.[0]?.text || '';
    } catch(e) { console.error('Claude error:', e.message); }

    if (!interpretation) {
      interpretation = `This match scores ${total} out of 36. ${total>=24?'A good match by Vedic standards — most key koots align well.':total>=18?'An average match. Some areas need careful attention before proceeding.':'This pairing has notable astrological challenges. Please consult a qualified Jyotishi.'} ${r.message?.description||''}`;
    }

    return res.status(200).json({ scores, total, info, nadi_dosha, bhakoot_dosha, gana_dosha, mangal_dosha, interpretation });

  } catch(e) {
    console.error('Unhandled error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

// ══════════════════════════════════════════════════════════
//  KOOT SCORE CALCULATORS  (standard Vedic rules)
// ══════════════════════════════════════════════════════════

function calcVarna(b, g) {
  // Order: Brahmin=4, Kshatriya=3, Vaishya=2, Shudra=1
  const rank = { brahmin:4, kshatriya:3, vaishya:2, shudra:1 };
  const br = rank[(b||'').toLowerCase()] || 0;
  const gr = rank[(g||'').toLowerCase()] || 0;
  return br >= gr ? 1 : 0;
}

function calcVashya(b, g) {
  // Vasya groups — full match=2, friendly=1, no match=0
  const groups = {
    manava:    ['manava','vanachara'],
    chatushpada:['chatushpada','vanachara'],
    jalachara: ['jalachara','kita'],
    vanachara: ['vanachara','manava','chatushpada'],
    kita:      ['kita','jalachara'],
  };
  const bk = (b||'').toLowerCase();
  const gk = (g||'').toLowerCase();
  if (bk === gk) return 2;
  if (groups[bk]?.includes(gk)) return 1;
  return 0;
}

function calcTara(b, g) {
  // Tara (nakshatra birth stars) — count positions, check auspiciousness
  const nakshatras = ['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha',
    'Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
    'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
  const bi = nakshatras.findIndex(n => n.toLowerCase() === (b||'').toLowerCase());
  const gi = nakshatras.findIndex(n => n.toLowerCase() === (g||'').toLowerCase());
  if (bi < 0 || gi < 0) return 1; // default partial
  const tara = ((gi - bi + 27) % 27) % 9 + 1;
  const good = [1,3,5,7]; // Janma, Vipat check — odd taras 1,3,5,7 auspicious simplified
  return good.includes(tara) ? 3 : tara === 2 || tara === 4 || tara === 6 ? 1 : 0;
}

function calcYoni(b, g) {
  // Yoni animals — same=4, friendly=3, neutral=2, enemy=0
  const friendly = {
    Ashwa:['Ashwa'], Gaja:['Gaja'], Mesha:['Mesha'], Sarpa:['Sarpa'],
    Shwana:['Shwana'], Marjara:['Vyaghra'], Mushaka:['Mushaka'],
    Gau:['Gau'], Mahisha:['Mahisha'], Vyaghra:['Marjara'],
    Mriga:['Mriga'], Vanara:['Vanara'], Nakula:['Nakula'], Shasha:['Shasha'],
  };
  const enemies = {
    Ashwa:'Mahisha', Mahisha:'Ashwa', Gaja:'Simha', Simha:'Gaja',
    Mesha:'Vanara', Vanara:'Mesha', Sarpa:'Nakula', Nakula:'Sarpa',
    Shwana:'Mriga', Mriga:'Shwana', Marjara:'Mushaka', Mushaka:'Marjara',
    Gau:'Vyaghra', Vyaghra:'Gau', Shasha:'Shwana',
  };
  if (!b || !g) return 2;
  if (b === g) return 4;
  if (enemies[b] === g || enemies[g] === b) return 0;
  if (friendly[b]?.includes(g)) return 3;
  return 2;
}

function calcMaitri(b, g) {
  // Planet lords friendship
  const friends = {
    Sun:    ['Moon','Mars','Jupiter'],
    Moon:   ['Sun','Mercury'],
    Mars:   ['Sun','Moon','Jupiter'],
    Mercury:['Sun','Venus'],
    Jupiter:['Sun','Moon','Mars'],
    Venus:  ['Mercury','Saturn'],
    Saturn: ['Mercury','Venus'],
  };
  const neutral = {
    Sun:['Mercury'], Moon:['Mars','Jupiter','Venus','Saturn'],
    Mars:['Venus','Saturn'], Mercury:['Mars','Jupiter','Saturn'],
    Jupiter:['Saturn'], Venus:['Mars','Jupiter'], Saturn:['Jupiter'],
  };
  if (!b || !g) return 3;
  if (b === g) return 5;
  if (friends[b]?.includes(g) && friends[g]?.includes(b)) return 5;
  if (friends[b]?.includes(g) || friends[g]?.includes(b)) return 4;
  if (neutral[b]?.includes(g) || neutral[g]?.includes(b)) return 3;
  return 1;
}

function calcGana(b, g) {
  // Deva=good, Manava=neutral, Rakshasa=bad
  const norm = s => (s||'').toLowerCase().replace('ta','').replace('ta','').trim();
  const bg = norm(b); const gg = norm(g);
  const isDeva  = s => s.includes('dev');
  const isManav = s => s.includes('manav') || s.includes('human') || s.includes('manush');
  const isRaksh = s => s.includes('rakshas') || s.includes('raksha');
  if (bg === gg) return 6;
  if ((isDeva(bg) && isManav(gg)) || (isManav(bg) && isDeva(gg))) return 5;
  if ((isManav(bg) && isRaksh(gg)) || (isRaksh(bg) && isManav(gg))) return 1;
  if ((isDeva(bg) && isRaksh(gg)) || (isRaksh(bg) && isDeva(gg))) return 0;
  return 3;
}

function calcBhakoot(b, g) {
  // Rashi positions — 7/7=7, 1/7 or other good=7, 6/8 or 2/12=0, 3/11=4, 4/10=0, 5/9=7
  const rashis = ['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya',
                  'Tula','Vrischika','Dhanu','Makara','Kumbha','Meena'];
  const bi = rashis.findIndex(r => r.toLowerCase() === (b||'').toLowerCase());
  const gi = rashis.findIndex(r => r.toLowerCase() === (g||'').toLowerCase());
  if (bi < 0 || gi < 0) return 3;
  if (bi === gi) return 7;
  const diff = ((gi - bi + 12) % 12) + 1;
  const rdiff = ((bi - gi + 12) % 12) + 1;
  // Shadastak (6-8) = 0 points — most serious
  if ((diff === 6 && rdiff === 8) || (diff === 8 && rdiff === 6)) return 0;
  // 2-12 = 0 points
  if ((diff === 2 && rdiff === 12) || (diff === 12 && rdiff === 2)) return 0;
  // 5-9 = full marks (best)
  if ((diff === 5 && rdiff === 9) || (diff === 9 && rdiff === 5)) return 7;
  // 3-11 = partial
  if ((diff === 3 && rdiff === 11) || (diff === 11 && rdiff === 3)) return 4;
  // 4-10 = 0
  if ((diff === 4 && rdiff === 10) || (diff === 10 && rdiff === 4)) return 0;
  // 1-7 (opposite) = 7 in some schools
  if ((diff === 1 && rdiff === 7) || (diff === 7 && rdiff === 1)) return 7;
  return 7;
}

function calcNadi(b, g) {
  // Adi, Madhya, Antya — same nadi = 0 (Nadi dosha), different = 8
  if (!b || !g) return 4;
  return (b.toLowerCase() === g.toLowerCase()) ? 0 : 8;
}
