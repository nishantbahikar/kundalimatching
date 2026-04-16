export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { boyName, girlName, boyDob, girlDob, boyLat, boyLon, girlLat, girlLon } = req.body;

  if (!boyDob || !girlDob || !boyLat || !girlLat) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // ── STEP 1: Get Prokerala OAuth2 token ──────────────────────────────
    const tokenRes = await fetch('https://api.prokerala.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.PROKERALA_CLIENT_ID,
        client_secret: process.env.PROKERALA_CLIENT_SECRET,
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'Prokerala auth failed. Check your Client ID and Secret in Vercel environment variables.', details: tokenData });
    }
    const token = tokenData.access_token;

    // ── STEP 2: Call Prokerala Kundli Matching API ───────────────────────
    // Prokerala expects: girl_dob, girl_coordinates, boy_dob, boy_coordinates, ayanamsa
    const params = new URLSearchParams({
      girl_dob: girlDob,
      girl_coordinates: `${girlLat},${girlLon}`,
      boy_dob: boyDob,
      boy_coordinates: `${boyLat},${boyLon}`,
      ayanamsa: '1'  // 1 = Lahiri (standard for North Indian)
    });

    const matchRes = await fetch(`https://api.prokerala.com/v2/astrology/kundli-matching?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const matchData = await matchRes.json();

    // Prokerala wraps response in data.data.result
    if (!matchData.data || !matchData.data.result) {
      return res.status(500).json({
        error: 'Prokerala returned an unexpected response. The API may be down or your credentials may be wrong.',
        raw: matchData
      });
    }

    const result = matchData.data.result;
    const input  = matchData.data.input || {};

    // ── STEP 3: Parse Prokerala scores ───────────────────────────────────
    // Prokerala returns scores inside result.koot_scores or similar
    // Map them into our standard format
    const raw = result.koot_match_score || result;

    const scores = {
      'Varna':        Number(raw.varna        || raw.varna_score        || 0),
      'Vashya':       Number(raw.vashya       || raw.vashya_score       || 0),
      'Tara':         Number(raw.tara         || raw.tara_score         || 0),
      'Yoni':         Number(raw.yoni         || raw.yoni_score         || 0),
      'Graha Maitri': Number(raw.graha_maitri || raw.graha_maitri_score || raw.maitri || 0),
      'Gana':         Number(raw.gana         || raw.gana_score         || 0),
      'Bhakoot':      Number(raw.bhakoot      || raw.bhakoot_score      || raw.bhakut || 0),
      'Nadi':         Number(raw.nadi         || raw.nadi_score         || 0),
    };

    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    // Profile info
    const boyInfo  = result.boy_info  || result.bridegroom_details || {};
    const girlInfo = result.girl_info || result.bride_details       || {};

    const info = {
      boy_rashi:     boyInfo.rashi  || boyInfo.moon_sign    || boyInfo.rasi  || '—',
      boy_nakshatra: boyInfo.nakshatra || boyInfo.birth_star  || '—',
      boy_lagna:     boyInfo.lagna  || boyInfo.ascendant     || '—',
      girl_rashi:    girlInfo.rashi || girlInfo.moon_sign   || girlInfo.rasi || '—',
      girl_nakshatra:girlInfo.nakshatra || girlInfo.birth_star || '—',
      girl_lagna:    girlInfo.lagna || girlInfo.ascendant    || '—',
    };

    // Dosha flags
    const doshaData = result.dosha_details || result.doshas || {};
    const nadi_dosha    = parseDoshaFlag(doshaData.nadi    || raw.nadi_dosha    || scores['Nadi']    < 8 ? (scores['Nadi'] === 0 ? 'present' : 'partial') : 'clear');
    const bhakoot_dosha = parseDoshaFlag(doshaData.bhakoot || raw.bhakoot_dosha || scores['Bhakoot'] < 7 ? (scores['Bhakoot'] === 0 ? 'present' : 'partial') : 'clear');
    const gana_dosha    = parseDoshaFlag(doshaData.gana    || raw.gana_dosha    || scores['Gana']    < 4 ? (scores['Gana']    === 0 ? 'present' : 'partial') : 'clear');
    const mangal_dosha  = parseDoshaFlag(doshaData.mangal  || result.mangal_dosha || 'partial');

    // ── STEP 4: Get Claude AI interpretation ─────────────────────────────
    const prompt = `You are a warm, experienced Vedic astrology expert. Based on this kundali matching result, write a 3-paragraph interpretation for ${boyName || 'the boy'} and ${girlName || 'the girl'}.

Ashtakoot scores:
${Object.entries(scores).map(([k,v])=>`- ${k}: ${v}`).join('\n')}
Total: ${total}/36

Rashis: ${info.boy_rashi} (boy) and ${info.girl_rashi} (girl)
Nakshatras: ${info.boy_nakshatra} (boy) and ${info.girl_nakshatra} (girl)

Dosha summary:
- Nadi dosha: ${nadi_dosha}
- Bhakoot dosha: ${bhakoot_dosha}  
- Gana dosha: ${gana_dosha}
- Mangal dosha: ${mangal_dosha}

Write 3 paragraphs in plain, warm language:
1. What the overall score means and the general compatibility picture
2. The key strengths from high-scoring koots, and the specific concerns from low scores or doshas (be honest — if Bhakoot is 0 due to Shadastak, say so clearly)
3. Practical, compassionate advice — remedies if needed, what to discuss, whether to see a pandit

No headers, no bullet points. Flowing prose only.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const claudeData = await claudeRes.json();
    const interpretation = claudeData.content?.[0]?.text || 'Interpretation unavailable at this time.';

    // ── STEP 5: Return everything ─────────────────────────────────────────
    res.status(200).json({
      scores,
      total,
      info,
      nadi_dosha,
      bhakoot_dosha,
      gana_dosha,
      mangal_dosha,
      interpretation,
      raw_prokerala: matchData.data  // include for debugging
    });

  } catch (e) {
    console.error('Match API error:', e);
    res.status(500).json({ error: e.message || 'An unexpected error occurred' });
  }
}

function parseDoshaFlag(val) {
  if (!val) return 'clear';
  const v = String(val).toLowerCase();
  if (v === 'present' || v === 'true' || v === '1' || v === 'yes') return 'present';
  if (v === 'partial') return 'partial';
  if (v === 'clear' || v === 'false' || v === '0' || v === 'no') return 'clear';
  return 'partial'; // default unknown to partial (show amber)
}
