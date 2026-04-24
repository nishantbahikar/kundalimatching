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
    return res.status(500).json({ error: 'API credentials missing.', has_client_id: !!clientId, has_client_secret: !!clientSecret });
  if (!anthropicKey)
    return res.status(500).json({ error: 'AI API key missing.' });
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
      return res.status(500).json({ error: 'Authentication failed. Check API credentials.', detail: tokenData });
    const token = tokenData.access_token;
    const authHeader = { Authorization: `Bearer ${token}` };

    // ── STEP 2: 5 parallel API calls ─────────────────────────────────────
    // Kundli Matching + Planet Position for Boy (Lagna) + Planet Position for Girl (Lagna)
    // + Mangal Dosha Boy + Mangal Dosha Girl (for cross-check)
    const [matchRes, planetBoyRes, planetGirlRes, mangalBoyRes, mangalGirlRes] = await Promise.all([
      fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${new URLSearchParams({
        girl_dob: girlDob, girl_coordinates: `${girlLat},${girlLon}`,
        boy_dob:  boyDob,  boy_coordinates:  `${boyLat},${boyLon}`,
        ayanamsa: '1'
      })}`, { headers: authHeader }),

      fetch(`https://api.prokerala.com/v2/astrology/planet-position?${new URLSearchParams({
        datetime: boyDob, coordinates: `${boyLat},${boyLon}`, ayanamsa: '1'
      })}`, { headers: authHeader }),

      fetch(`https://api.prokerala.com/v2/astrology/planet-position?${new URLSearchParams({
        datetime: girlDob, coordinates: `${girlLat},${girlLon}`, ayanamsa: '1'
      })}`, { headers: authHeader }),

      fetch(`https://api.prokerala.com/v2/astrology/mangal-dosha?${new URLSearchParams({
        datetime: boyDob, coordinates: `${boyLat},${boyLon}`, ayanamsa: '1'
      })}`, { headers: authHeader }),

      fetch(`https://api.prokerala.com/v2/astrology/mangal-dosha?${new URLSearchParams({
        datetime: girlDob, coordinates: `${girlLat},${girlLon}`, ayanamsa: '1'
      })}`, { headers: authHeader })
    ]);

    const [matchData, planetBoyData, planetGirlData, mangalBoyData, mangalGirlData] = await Promise.all([
      matchRes.json().catch(() => ({})),
      planetBoyRes.json().catch(() => ({})),
      planetGirlRes.json().catch(() => ({})),
      mangalBoyRes.json().catch(() => ({})),
      mangalGirlRes.json().catch(() => ({}))
    ]);

    if (matchRes.status !== 200 || !matchData.data)
      return res.status(500).json({
        error: 'Kundali matching API error (HTTP ' + matchRes.status + ')',
        fix: matchRes.status === 401 ? 'Check credentials and redeploy'
           : matchRes.status === 403 ? 'Plan does not include this endpoint'
           : matchRes.status === 429 ? 'Rate limit — wait a minute'
           : 'Unexpected error',
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

    const boy_koot  = { Varna:bKoot.varna, Vashya:bKoot.vasya, Tara:bKoot.tara, Yoni:bKoot.yoni, 'Graha Maitri':bKoot.graha_maitri, Gana:bKoot.gana, Bhakoot:bKoot.bhakoot, Nadi:bKoot.nadi };
    const girl_koot = { Varna:gKoot.varna, Vashya:gKoot.vasya, Tara:gKoot.tara, Yoni:gKoot.yoni, 'Graha Maitri':gKoot.graha_maitri, Gana:gKoot.gana, Bhakoot:gKoot.bhakoot, Nadi:gKoot.nadi };

    // ── STEP 4: Other dosha flags ─────────────────────────────────────────
    const nadi_dosha    = scores['Nadi']    === 0 ? 'present' : scores['Nadi']    < 8 ? 'partial' : 'clear';
    const bhakoot_dosha = scores['Bhakoot'] === 0 ? 'present' : scores['Bhakoot'] < 7 ? 'partial' : 'clear';
    const gana_dosha    = scores['Gana']    === 0 ? 'present' : scores['Gana']    < 4 ? 'partial' : 'clear';

    // ── STEP 5: Mangal Dosha — severity from planet positions ─────────────
    const boyMars  = getMars(planetBoyData);
    const girlMars = getMars(planetGirlData);

    // Also read the direct Mangal Dosha API for cross-check
    const mangalBoyDirect  = parseMangalDirect(mangalBoyData);
    const mangalGirlDirect = parseMangalDirect(mangalGirlData);

    // Use planet position for severity, mangal API as fallback for has_dosha
    const boyHas  = boyMars  ? isMangalik(boyMars.house)  : mangalBoyDirect.hasDosha;
    const girlHas = girlMars ? isMangalik(girlMars.house) : mangalGirlDirect.hasDosha;

    const boySeverity  = boyMars  ? getMangalSeverity(boyMars)  : null;
    const girlSeverity = girlMars ? getMangalSeverity(girlMars) : null;

    const mangalResult = buildMangalResult(
      boyHas, girlHas, boySeverity, girlSeverity,
      boyMars, girlMars, boyName||'Boy', girlName||'Girl'
    );

    // ── STEP 6: AI interpretation ─────────────────────────────────────────
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
Mangal dosha: ${mangalResult.summary}

Para 1: What the total score means.
Para 2: Strengths from high koots; honest concerns from weak ones. If Bhakoot=0, explain clearly.
Para 3: Practical compassionate advice — remedies if needed, next steps.

Flowing prose only. No bullets or headers.` }]
        })
      });
      const cd = await claudeRes.json();
      interpretation = cd.content?.[0]?.text || '';
    } catch(e) { console.error('AI error:', e.message); }

    if (!interpretation) {
      interpretation = `This match scores ${total} out of 36. ${total>=24?'A good match by Vedic standards.':total>=18?'An average match — some areas need attention.':'Significant challenges present — consult a qualified Jyotishi.'} ${r.message?.description||''}`;
    }

    return res.status(200).json({
      scores, total, info, boy_koot, girl_koot,
      nadi_dosha, bhakoot_dosha, gana_dosha,
      mangal_dosha:   mangalResult.status,
      mangal_detail:  mangalResult.detail,
      mangal_severity:mangalResult.severity,
      mangal_boy:  { has: boyHas,  severity: boySeverity,  house: boyMars?.house,  sign: boyMars?.sign  },
      mangal_girl: { has: girlHas, severity: girlSeverity, house: girlMars?.house, sign: girlMars?.sign },
      interpretation
    });

  } catch(e) {
    console.error('Unhandled error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

// ── PLANET POSITION HELPERS ───────────────────────────────────────────────────

function getMars(data) {
  // Prokerala planet-position response: data.data.planet_position (array)
  const planets = data?.data?.planet_position
    || data?.data?.result?.planet_position
    || data?.data?.planets
    || [];
  if (!Array.isArray(planets)) return null;
  const mars = planets.find(p => (p.name||'').toLowerCase() === 'mars');
  return mars || null;
}

const MANGAL_HOUSES = [1, 2, 4, 7, 8, 12];

function isMangalik(house) {
  return MANGAL_HOUSES.includes(Number(house));
}

function getMangalSeverity(mars) {
  if (!mars) return null;
  const house  = Number(mars.house);
  const sign   = (mars.sign || '').toLowerCase();
  const isRetro = String(mars.isRetro) === 'true';

  if (!isMangalik(house)) return null; // no dosha

  // Cancellation checks
  // Mars in own signs (Aries/Scorpio) or exalted (Capricorn) greatly reduces severity
  const ownSigns    = ['aries', 'scorpio'];
  const exaltedSign = 'capricorn';
  const isOwnSign   = ownSigns.includes(sign);
  const isExalted   = sign === exaltedSign;

  if (isOwnSign || isExalted) {
    return {
      level: 'low',
      label: 'Low',
      reason: isOwnSign
        ? `Mars is in its own sign (${mars.sign}) in house ${house} — strength reduces dosha severity significantly.`
        : `Mars is exalted in ${mars.sign} in house ${house} — exaltation cancels most of the dosha's ill effects.`
    };
  }

  // House 7 or 8 = High (directly affects marriage and longevity)
  if (house === 7 || house === 8) {
    return {
      level: 'high',
      label: 'High',
      reason: `Mars in the ${house === 7 ? '7th house (marriage house)' : '8th house (longevity house)'} creates a high-severity Mangal dosha. This directly affects married life and requires serious attention.`
    };
  }

  // House 1 = Medium-High (affects temperament, conflicts in relationship)
  if (house === 1) {
    return {
      level: 'medium',
      label: 'Medium',
      reason: `Mars in the 1st house (Lagna) creates medium-severity Mangal dosha. It can cause an aggressive temperament and conflicts in marriage but is manageable with remedies.`
    };
  }

  // House 4 = Medium (domestic peace)
  if (house === 4) {
    return {
      level: 'medium',
      label: 'Medium',
      reason: `Mars in the 4th house creates medium-severity Mangal dosha, disturbing domestic peace and comfort. Remedies and mutual understanding can significantly reduce the effects.`
    };
  }

  // House 12 = Low-Medium (mental stress, but least harmful)
  if (house === 12) {
    return {
      level: 'low',
      label: 'Low',
      reason: `Mars in the 12th house is considered the mildest Mangal dosha placement. Effects on marriage are limited and it is generally manageable without major intervention.`
    };
  }

  // House 2 (South Indian system) = Low
  if (house === 2) {
    return {
      level: 'low',
      label: 'Low',
      reason: `Mars in the 2nd house creates a mild Mangal dosha (more significant in South Indian tradition). Financial and family harmony may need attention, but effects on marriage are mild.`
    };
  }

  return { level: 'medium', label: 'Medium', reason: `Mars in house ${house} creates Mangal dosha.` };
}

function buildMangalResult(boyHas, girlHas, boySev, girlSev, boyMars, girlMars, boyName, girlName) {
  // Both clear
  if (!boyHas && !girlHas) {
    return {
      status: 'clear',
      severity: null,
      summary: 'No Mangal dosha in either chart.',
      detail: `Neither ${boyName} nor ${girlName} has Mangal dosha. Mars is not placed in any of the sensitive houses (1, 2, 4, 7, 8, 12) in either birth chart. This is an auspicious sign for marital harmony.`
    };
  }

  // Both Mangalik — cancel each other
  if (boyHas && girlHas) {
    const highestLevel = (boySev?.level === 'high' || girlSev?.level === 'high') ? 'medium' : 'low';
    return {
      status: 'clear',
      severity: 'cancelled',
      summary: 'Both are Mangalik — doshas cancel each other.',
      detail: `Both ${boyName} and ${girlName} have Mangal dosha. By traditional Vedic rules, when both partners are Mangalik the doshas cancel each other and the marriage is not adversely affected. ${boySev ? boyName+': '+boySev.reason : ''} ${girlSev ? girlName+': '+girlSev.reason : ''}`
    };
  }

  // Only one has it
  const who     = boyHas ? boyName  : girlName;
  const sev     = boyHas ? boySev   : girlSev;
  const mars    = boyHas ? boyMars  : girlMars;
  const level   = sev?.level || 'medium';
  const label   = sev?.label || 'Medium';
  const reason  = sev?.reason || `Mars in house ${mars?.house||'?'}.`;

  const statusMap = { high: 'present', medium: 'present', low: 'partial' };
  const adviceMap = {
    high:   'This is a serious dosha that needs to be addressed. Consulting a Jyotishi for Mangal shanti puja and choosing a Mangalik partner or performing remedies is strongly recommended before proceeding.',
    medium: 'Remedies such as Mangal puja on Tuesdays, wearing a red coral gemstone, or Kumbh Vivah can help mitigate the effects. A Jyotishi consultation is advisable.',
    low:    'The effects are mild and generally manageable. Simple remedies like Hanuman Chalisa recitation on Tuesdays are usually sufficient. A pandit consultation can confirm.'
  };

  return {
    status:   statusMap[level] || 'present',
    severity: label,
    summary:  `${who} has ${label}-severity Mangal dosha (Mars in house ${mars?.house||'?'}).`,
    detail:   `${who} has Mangal dosha — Mars is in the ${mars?.house||'?'}${ordinal(mars?.house)} house${mars?.sign ? ' in '+mars.sign : ''}. ${reason} ${adviceMap[level]}`
  };
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n%100;
  return (s[(v-20)%10]||s[v]||s[0]);
}

function parseMangalDirect(data) {
  if (!data?.data) return { hasDosha: false };
  const result = data.data.result || data.data;
  const has = result.has_mangal_dosha ?? result.manglik_status ?? result.has_dosha ?? false;
  return { hasDosha: Boolean(has) };
}

// ── KOOT CALCULATORS ─────────────────────────────────────────────────────────
function calcVarna(b, g) {
  const rank={brahmin:4,kshatriya:3,vaishya:2,shudra:1};
  return (rank[(b||'').toLowerCase()]||0) >= (rank[(g||'').toLowerCase()]||0) ? 1 : 0;
}
function calcVashya(b, g) {
  const groups={manava:['manava','vanachara'],chatushpada:['chatushpada','vanachara'],jalachara:['jalachara','kita'],vanachara:['vanachara','manava','chatushpada'],kita:['kita','jalachara']};
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
  if(!b||!g) return 2; if(b===g) return 4;
  if(enemies[b]===g||enemies[g]===b) return 0;
  return 2;
}
function calcMaitri(b, g) {
  const f={Sun:['Moon','Mars','Jupiter'],Moon:['Sun','Mercury'],Mars:['Sun','Moon','Jupiter'],Mercury:['Sun','Venus'],Jupiter:['Sun','Moon','Mars'],Venus:['Mercury','Saturn'],Saturn:['Mercury','Venus']};
  if(!b||!g) return 3; if(b===g) return 5;
  if(f[b]?.includes(g)&&f[g]?.includes(b)) return 5;
  if(f[b]?.includes(g)||f[g]?.includes(b)) return 4;
  return 3;
}
function calcGana(b, g) {
  const bg=(b||'').toLowerCase(), gg=(g||'').toLowerCase();
  const isDeva=s=>s.includes('dev'), isManav=s=>s.includes('manav')||s.includes('human'), isRaksh=s=>s.includes('rakshas');
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
  if(bi<0||gi<0) return 3; if(bi===gi) return 7;
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
