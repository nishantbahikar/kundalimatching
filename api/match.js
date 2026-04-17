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

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Prokerala credentials missing',
      fix: 'Add PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET to Vercel env vars, then redeploy.',
      has_client_id: !!clientId,
      has_client_secret: !!clientSecret
    });
  }
  if (!anthropicKey) {
    return res.status(500).json({
      error: 'Anthropic API key missing',
      fix: 'Add ANTHROPIC_API_KEY to Vercel env vars, then redeploy.'
    });
  }
  if (!boyDob || !girlDob || !boyLat || !girlLat) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // STEP 1: Prokerala OAuth token
    const tokenRes = await fetch('https://api.prokerala.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      })
    });
    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch(e) {
      return res.status(500).json({ error: 'Prokerala token endpoint returned non-JSON', raw: tokenText.slice(0,300) });
    }
    if (!tokenData.access_token) {
      return res.status(500).json({
        error: 'Prokerala authentication failed. Check your Client ID and Secret.',
        prokerala_response: tokenData
      });
    }
    const token = tokenData.access_token;

    // STEP 2: Kundli Matching
    const params = new URLSearchParams({
      girl_dob:         girlDob,
      girl_coordinates: `${girlLat},${girlLon}`,
      boy_dob:          boyDob,
      boy_coordinates:  `${boyLat},${boyLon}`,
      ayanamsa:         '1'
    });
    const matchRes = await fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    const matchText = await matchRes.text();
    let matchData;
    try { matchData = JSON.parse(matchText); } catch(e) {
      return res.status(500).json({ error: 'Prokerala API returned non-JSON', raw: matchText.slice(0,500) });
    }
    if (matchRes.status !== 200 || !matchData.data) {
      return res.status(500).json({
        error: 'Prokerala API error (status ' + matchRes.status + ')',
        fix: matchRes.status === 401 ? 'Invalid token — check credentials and redeploy'
           : matchRes.status === 403 ? 'Plan does not include this endpoint — check api.prokerala.com'
           : matchRes.status === 429 ? 'Rate limit exceeded — wait a minute and retry'
           : 'Unexpected error from Prokerala',
        prokerala_response: matchData
      });
    }

    const result = matchData.data.result || matchData.data;
    // TEMP DEBUG - remove after fixing
    return res.status(200).json({ debug_raw: result });
    const raw    = result.koot_match_score || result.koot_details || result;

    // STEP 3: Parse scores
    const scores = {
      'Varna':        safeNum(raw, ['varna','varna_koot','varna_score']),
      'Vashya':       safeNum(raw, ['vashya','vashya_koot','vashya_score']),
      'Tara':         safeNum(raw, ['tara','tara_koot','tara_score']),
      'Yoni':         safeNum(raw, ['yoni','yoni_koot','yoni_score']),
      'Graha Maitri': safeNum(raw, ['graha_maitri','graha_maitri_koot','maitri','planet_friendship']),
      'Gana':         safeNum(raw, ['gana','gana_koot','gana_score']),
      'Bhakoot':      safeNum(raw, ['bhakoot','bhakoot_koot','bhakut','bhakoot_score']),
      'Nadi':         safeNum(raw, ['nadi','nadi_koot','nadi_score']),
    };
    const total = Object.values(scores).reduce((a,b) => a+b, 0);

    // STEP 4: Profile info
    const boyInfo  = result.boy_info  || result.bridegroom_details || result.boy  || {};
    const girlInfo = result.girl_info || result.bride_details      || result.girl || {};
    const info = {
      boy_rashi:      pick(boyInfo,  ['rashi','moon_sign','rasi','zodiac_sign']) || '—',
      boy_nakshatra:  pick(boyInfo,  ['nakshatra','birth_star','star'])          || '—',
      boy_lagna:      pick(boyInfo,  ['lagna','ascendant','rising_sign'])        || '—',
      girl_rashi:     pick(girlInfo, ['rashi','moon_sign','rasi','zodiac_sign']) || '—',
      girl_nakshatra: pick(girlInfo, ['nakshatra','birth_star','star'])          || '—',
      girl_lagna:     pick(girlInfo, ['lagna','ascendant','rising_sign'])        || '—',
    };

    // STEP 5: Dosha flags
    const nadi_dosha    = scores['Nadi']    === 0 ? 'present' : scores['Nadi']    < 8 ? 'partial' : 'clear';
    const bhakoot_dosha = scores['Bhakoot'] === 0 ? 'present' : scores['Bhakoot'] < 7 ? 'partial' : 'clear';
    const gana_dosha    = scores['Gana']    === 0 ? 'present' : scores['Gana']    < 4 ? 'partial' : 'clear';
    const mangal_dosha  = pick(result, ['mangal_dosha','kuja_dosha','manglik']) || 'partial';

    // STEP 6: Claude interpretation
    let interpretation = '';
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{ role: 'user', content: `You are a warm Vedic astrology expert. Write a 3-paragraph interpretation for ${boyName||'the boy'} and ${girlName||'the girl'} based on these Prokerala-calculated kundali matching results:

Scores: ${Object.entries(scores).map(([k,v])=>`${k}=${v}`).join(', ')}
Total: ${total}/36
Rashis: ${info.boy_rashi} (boy), ${info.girl_rashi} (girl)
Nakshatras: ${info.boy_nakshatra} (boy), ${info.girl_nakshatra} (girl)
Doshas: Nadi=${nadi_dosha}, Bhakoot=${bhakoot_dosha}, Gana=${gana_dosha}

Para 1: Overall score meaning. Para 2: Specific strengths and honest concerns. Para 3: Practical compassionate advice. Flowing prose only, no bullets or headers.` }]
        })
      });
      const cd = await claudeRes.json();
      interpretation = cd.content?.[0]?.text || '';
    } catch(e) { console.error('Claude error:', e.message); }

    if (!interpretation) {
      interpretation = `This match scores ${total} out of 36. ${total>=24?'A good match by Vedic standards.':total>=18?'An average match — some areas need attention.':'Significant astrological challenges present.'} Please consult a qualified Jyotishi for a complete reading.`;
    }

    return res.status(200).json({ scores, total, info, nadi_dosha, bhakoot_dosha, gana_dosha, mangal_dosha, interpretation });

  } catch(e) {
    console.error('Unhandled error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

function safeNum(obj, keys) {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null) {
      const n = Number(obj[k]);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}
function pick(obj, keys) {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null && obj[k] !== '') return String(obj[k]);
  }
  return null;
}
