// ── TOKEN CACHE — reuse token for up to 55 minutes ──────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;

async function getToken(clientId, clientSecret) {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const res  = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret })
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error('Auth failed — check API credentials');

  _cachedToken = data.access_token;
  _tokenExpiry = now + 55 * 60 * 1000; // cache for 55 mins (token lasts 60)
  return _cachedToken;
}

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

  if (!clientId || !clientSecret) return res.status(500).json({ error: 'API credentials missing.', has_client_id: !!clientId, has_client_secret: !!clientSecret });
  if (!anthropicKey)               return res.status(500).json({ error: 'AI API key missing.' });
  if (!boyDob || !girlDob || !boyLat || !girlLat) return res.status(400).json({ error: 'Missing required fields' });

  try {
    // ── STEP 1: Token (cached) ───────────────────────────────────────────
    const token = await getToken(clientId, clientSecret);
    const authHeader = { Authorization: `Bearer ${token}` };

    // ── STEP 2: Kundli Matching + Planet Position (parallel, 3 calls) ────
    // We derive Mangal dosha from planet-position ourselves — no separate
    // mangal-dosha API call needed, saving 2 credits per match.
    // Also check kundali message first — if it clearly states no Mangal dosha,
    // skip planet-position calls entirely.
    const matchRes = await fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${new URLSearchParams({
      girl_dob: girlDob, girl_coordinates: `${girlLat},${girlLon}`,
      boy_dob:  boyDob,  boy_coordinates:  `${boyLat},${boyLon}`,
      ayanamsa: '1'
    })}`, { headers: authHeader });

    const matchData = await matchRes.json().catch(() => ({}));
    if (matchRes.status !== 200 || !matchData.data)
      return res.status(500).json({
        error: 'Kundali matching API error (HTTP ' + matchRes.status + ')',
        fix: matchRes.status === 401 ? 'Check credentials' : matchRes.status === 429 ? 'Rate limit — wait a minute' : 'Unexpected error',
        detail: matchData
      });

    const r        = matchData.data.result || matchData.data;
    const msgDesc  = (r.message?.description || '').toLowerCase();
    const mangalClearFromMsg = msgDesc.includes('not affected') && msgDesc.includes('mangal');

    // Only call planet-position if kundali message is ambiguous about Mangal
    let planetBoyData = {}, planetGirlData = {};
    if (!mangalClearFromMsg) {
      [planetBoyData, planetGirlData] = await Promise.all([
        fetch(`https://api.prokerala.com/v2/astrology/planet-position?${new URLSearchParams({
          datetime: boyDob, coordinates: `${boyLat},${boyLon}`, ayanamsa: '1'
        })}`, { headers: authHeader }).then(r => r.json()).catch(() => ({})),
        fetch(`https://api.prokerala.com/v2/astrology/planet-position?${new URLSearchParams({
          datetime: girlDob, coordinates: `${girlLat},${girlLon}`, ayanamsa: '1'
        })}`, { headers: authHeader }).then(r => r.json()).catch(() => ({}))
      ]);
    }

    // ── STEP 3: Parse kundli matching ────────────────────────────────────
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

    // ── STEP 4: Dosha flags ──────────────────────────────────────────────
    const nadi_dosha    = scores['Nadi']    === 0 ? 'present' : scores['Nadi']    < 8 ? 'partial' : 'clear';
    const bhakoot_dosha = scores['Bhakoot'] === 0 ? 'present' : scores['Bhakoot'] < 7 ? 'partial' : 'clear';
    const gana_dosha    = scores['Gana']    === 0 ? 'present' : scores['Gana']    < 4 ? 'partial' : 'clear';

    // ── STEP 5: Mangal — from planet-position or kundali message ─────────
    let mangal_dosha, mangal_detail, mangal_severity, mangal_boy, mangal_girl;

    if (mangalClearFromMsg) {
      // Kundali API already confirmed no Mangal dosha — skip planet calls
      mangal_dosha   = 'clear';
      mangal_detail  = `Neither ${boyName||'the boy'} nor ${girlName||'the girl'} has Mangal dosha. Mars is not placed in any of the sensitive houses in either birth chart.`;
      mangal_severity= null;
      mangal_boy     = { has: false };
      mangal_girl    = { has: false };
    } else {
      const boyMars  = getMars(planetBoyData);
      const girlMars = getMars(planetGirlData);
      const boyHas   = boyMars  ? isMangalik(boyMars.house)  : false;
      const girlHas  = girlMars ? isMangalik(girlMars.house) : false;
      const boySev   = boyHas  && boyMars  ? getMangalSeverity(boyMars)  : null;
      const girlSev  = girlHas && girlMars ? getMangalSeverity(girlMars) : null;
      const result   = buildMangalResult(boyHas, girlHas, boySev, girlSev, boyMars, girlMars, boyName||'Boy', girlName||'Girl');
      mangal_dosha   = result.status;
      mangal_detail  = result.detail;
      mangal_severity= result.severity;
      mangal_boy     = { has: boyHas,  severity: boySev,  house: boyMars?.house,  sign: boyMars?.sign  };
      mangal_girl    = { has: girlHas, severity: girlSev, house: girlMars?.house, sign: girlMars?.sign };
    }

    // ── STEP 6: AI interpretation (Haiku — 20x cheaper than Sonnet) ──────
    let interpretation = '';
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', // Haiku — same quality for this task, ~20x cheaper
          max_tokens: 600,
          messages: [{ role: 'user', content:
`Vedic astrology expert. Write a 2-paragraph kundali match interpretation for ${boyName||'the boy'} and ${girlName||'the girl'}.

Scores: ${Object.entries(scores).map(([k,v])=>`${k}=${v}`).join(', ')} | Total: ${total}/36
${info.boy_rashi} (boy) · ${info.girl_rashi} (girl) | Nadi:${nadi_dosha} Bhakoot:${bhakoot_dosha} Gana:${gana_dosha} Mangal:${mangal_dosha}${mangal_severity?' ('+mangal_severity+')':''}

Para 1: Overall score and key strengths. Para 2: Honest concerns and practical advice.
Warm, plain language. No bullets or headers.` }]
        })
      });
      const cd = await claudeRes.json();
      interpretation = cd.content?.[0]?.text || '';
    } catch(e) { console.error('AI error:', e.message); }

    if (!interpretation) {
      interpretation = `This match scores ${total} out of 36. ${total>=24?'A good match by Vedic standards.':total>=18?'An average match — some areas need attention.':'Significant challenges present — please consult a qualified Jyotishi.'}`;
    }

    return res.status(200).json({
      scores, total, info, boy_koot, girl_koot,
      nadi_dosha, bhakoot_dosha, gana_dosha,
      mangal_dosha, mangal_detail, mangal_severity,
      mangal_boy, mangal_girl,
      interpretation
    });

  } catch(e) {
    console.error('Unhandled error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

// ── PLANET HELPERS ────────────────────────────────────────────────────────────
function getMars(data) {
  const planets = data?.data?.planet_position || data?.data?.result?.planet_position || data?.data?.planets || [];
  if (!Array.isArray(planets)) return null;
  return planets.find(p => (p.name||'').toLowerCase() === 'mars') || null;
}
const MANGAL_HOUSES = [1, 2, 4, 7, 8, 12];
function isMangalik(house) { return MANGAL_HOUSES.includes(Number(house)); }

function getMangalSeverity(mars) {
  if (!mars) return null;
  const house = Number(mars.house);
  const sign  = (mars.sign || '').toLowerCase();
  if (!isMangalik(house)) return null;
  if (['aries','scorpio'].includes(sign) || sign === 'capricorn')
    return { level:'low', label:'Low', reason:`Mars in ${mars.sign} in house ${house} — strength reduces dosha severity significantly.` };
  if (house === 7 || house === 8)
    return { level:'high', label:'High', reason:`Mars in the ${house===7?'7th (marriage)':'8th (longevity)'} house — high severity. Serious attention required.` };
  if (house === 1)
    return { level:'medium', label:'Medium', reason:`Mars in the 1st house — medium severity. Can cause temperament conflicts in marriage.` };
  if (house === 4)
    return { level:'medium', label:'Medium', reason:`Mars in the 4th house — medium severity. Affects domestic peace and comfort.` };
  if (house === 12)
    return { level:'low', label:'Low', reason:`Mars in the 12th house — mildest Mangal placement. Limited effects on marriage.` };
  if (house === 2)
    return { level:'low', label:'Low', reason:`Mars in the 2nd house — mild dosha. Financial and family harmony may need attention.` };
  return { level:'medium', label:'Medium', reason:`Mars in house ${house}.` };
}

function buildMangalResult(boyHas, girlHas, boySev, girlSev, boyMars, girlMars, boyName, girlName) {
  if (!boyHas && !girlHas) return { status:'clear', severity:null, detail:`Neither ${boyName} nor ${girlName} has Mangal dosha. Mars is not in a sensitive house in either chart.` };
  if (boyHas && girlHas)   return { status:'clear', severity:'cancelled', detail:`Both are Mangalik — the doshas cancel each other by traditional Vedic rules. ${boySev?.reason||''} ${girlSev?.reason||''}`.trim() };
  const who = boyHas ? boyName : girlName;
  const sev = boyHas ? boySev  : girlSev;
  const m   = boyHas ? boyMars : girlMars;
  const advice = { high:'Consulting a Jyotishi for Mangal shanti puja is strongly recommended.', medium:'Remedies such as Mangal puja on Tuesdays or red coral gemstone can help.', low:'Simple remedies like Hanuman Chalisa on Tuesdays are usually sufficient.' };
  return {
    status:   sev?.level === 'low' ? 'partial' : 'present',
    severity: sev?.label || 'Medium',
    detail:   `${who} has Mangal dosha — Mars in house ${m?.house||'?'}${m?.sign?' ('+m.sign+')':''}. ${sev?.reason||''} ${advice[sev?.level||'medium']}`
  };
}

function ordinal(n) { const s=['th','st','nd','rd'],v=n%100; return s[(v-20)%10]||s[v]||s[0]; }

// ── KOOT CALCULATORS ─────────────────────────────────────────────────────────
function calcVarna(b,g){const r={brahmin:4,kshatriya:3,vaishya:2,shudra:1};return(r[(b||'').toLowerCase()]||0)>=(r[(g||'').toLowerCase()]||0)?1:0;}
function calcVashya(b,g){const gr={manava:['manava','vanachara'],chatushpada:['chatushpada','vanachara'],jalachara:['jalachara','kita'],vanachara:['vanachara','manava','chatushpada'],kita:['kita','jalachara']};const bk=(b||'').toLowerCase(),gk=(g||'').toLowerCase();if(bk===gk)return 2;if(gr[bk]?.includes(gk))return 1;return 0;}
function calcTara(b,g){const n=['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];const bi=n.findIndex(x=>x.toLowerCase()===(b||'').toLowerCase());const gi=n.findIndex(x=>x.toLowerCase()===(g||'').toLowerCase());if(bi<0||gi<0)return 1;const t=((gi-bi+27)%27)%9+1;return[1,3,5,7].includes(t)?3:t===2||t===4||t===6?1:0;}
function calcYoni(b,g){const e={Ashwa:'Mahisha',Mahisha:'Ashwa',Gaja:'Simha',Simha:'Gaja',Mesha:'Vanara',Vanara:'Mesha',Sarpa:'Nakula',Nakula:'Sarpa',Shwana:'Mriga',Mriga:'Shwana',Marjara:'Mushaka',Mushaka:'Marjara',Gau:'Vyaghra',Vyaghra:'Gau'};if(!b||!g)return 2;if(b===g)return 4;if(e[b]===g||e[g]===b)return 0;return 2;}
function calcMaitri(b,g){const f={Sun:['Moon','Mars','Jupiter'],Moon:['Sun','Mercury'],Mars:['Sun','Moon','Jupiter'],Mercury:['Sun','Venus'],Jupiter:['Sun','Moon','Mars'],Venus:['Mercury','Saturn'],Saturn:['Mercury','Venus']};if(!b||!g)return 3;if(b===g)return 5;if(f[b]?.includes(g)&&f[g]?.includes(b))return 5;if(f[b]?.includes(g)||f[g]?.includes(b))return 4;return 3;}
function calcGana(b,g){const bg=(b||'').toLowerCase(),gg=(g||'').toLowerCase();const isDeva=s=>s.includes('dev'),isManav=s=>s.includes('manav')||s.includes('human'),isRaksh=s=>s.includes('rakshas');if(bg===gg)return 6;if((isDeva(bg)&&isManav(gg))||(isManav(bg)&&isDeva(gg)))return 5;if((isManav(bg)&&isRaksh(gg))||(isRaksh(bg)&&isManav(gg)))return 1;if((isDeva(bg)&&isRaksh(gg))||(isRaksh(bg)&&isDeva(gg)))return 0;return 3;}
function calcBhakoot(b,g){const r=['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya','Tula','Vrischika','Dhanu','Makara','Kumbha','Meena'];const bi=r.findIndex(x=>x.toLowerCase()===(b||'').toLowerCase());const gi=r.findIndex(x=>x.toLowerCase()===(g||'').toLowerCase());if(bi<0||gi<0)return 3;if(bi===gi)return 7;const d=((gi-bi+12)%12)+1,rd=((bi-gi+12)%12)+1;if((d===6&&rd===8)||(d===8&&rd===6))return 0;if((d===2&&rd===12)||(d===12&&rd===2))return 0;if((d===4&&rd===10)||(d===10&&rd===4))return 0;if((d===5&&rd===9)||(d===9&&rd===5))return 7;return 7;}
function calcNadi(b,g){if(!b||!g)return 4;return b.toLowerCase()===g.toLowerCase()?0:8;}
