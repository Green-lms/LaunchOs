const router = require('express').Router();
const { auth } = require('../middleware/auth');

const AI_ENDPOINTS = {
  claude:  'https://api.anthropic.com/v1/messages',
  openai:  'https://api.openai.com/v1/chat/completions',
  gemini:  'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
};

// POST /api/ai/generate — proxy AI calls with server-side API keys
router.post('/generate', auth, async (req, res) => {
  try {
    const { prompt, system, provider = process.env.DEFAULT_AI_PROVIDER || 'claude', maxTokens = 1500 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    let text = '';
    if (provider === 'claude' || provider === 'anthropic') {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) return res.status(500).json({ error: 'Claude API key not configured on server' });
      const r = await fetch(AI_ENDPOINTS.claude, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages: [{ role:'user', content: prompt }]
        })
      });
      const d = await r.json();
      text = d.content?.[0]?.text || d.error?.message || 'No response';

    } else if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(500).json({ error: 'OpenAI API key not configured' });
      const msgs = [];
      if (system) msgs.push({ role:'system', content: system });
      msgs.push({ role:'user', content: prompt });
      const r = await fetch(AI_ENDPOINTS.openai, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+key },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: maxTokens, messages: msgs })
      });
      const d = await r.json();
      text = d.choices?.[0]?.message?.content || d.error?.message || 'No response';
    }

    res.json({ text, provider });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/survey-analysis — dedicated survey analysis endpoint
router.post('/survey-analysis', auth, async (req, res) => {
  try {
    const { founderId, context } = req.body;
    const Programme = require('../models/Programme');
    const prog = await Programme.findOne({ founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    if (prog.survey.responses.length < 30)
      return res.status(400).json({ error: 'Minimum 30 responses required for analysis' });

    // Build summary from responses
    const agg = {};
    prog.survey.questions.forEach(q => {
      agg[q.id] = { q: q.text, type: q.type, counts: {}, scores: [], texts: [] };
      prog.survey.responses.forEach(r => {
        const ans = r.answers?.[q.id];
        if (!ans) return;
        if (Array.isArray(ans)) ans.forEach(a => { agg[q.id].counts[a] = (agg[q.id].counts[a]||0)+1; });
        else if (typeof ans === 'number') agg[q.id].scores.push(ans);
        else agg[q.id].counts[ans] = (agg[q.id].counts[ans]||0)+1;
      });
    });

    const summaryLines = prog.survey.questions.map((q,i) => {
      const d = agg[q.id];
      let s = 'Q'+(i+1)+': '+q.text+'\n';
      if (d.scores.length) s += '  Avg: '+(d.scores.reduce((a,b)=>a+b,0)/d.scores.length).toFixed(1)+'/10\n';
      if (Object.keys(d.counts).length) {
        const tot = Object.values(d.counts).reduce((a,b)=>a+b,0);
        s += Object.entries(d.counts).sort((a,b)=>b[1]-a[1]).map(([o,c])=>'  '+o+': '+c+' ('+Math.round(c/tot*100)+'%)').join('\n')+'\n';
      }
      return s;
    }).join('\n');

    const prompt = `Startup programme advisor. Analyse these survey results.\n\nContext: ${context||''}\nResponses: ${prog.survey.responses.length}\nTarget: ${prog.survey.targetGroup||'Not specified'}\n\n${summaryLines}\n\nProvide:\n1. VALIDATION VERDICT (Strong/Moderate/Weak/Pivot)\n2. KEY FINDINGS (top 5)\n3. WHO IS YOUR EARLY ADOPTER\n4. PRICE SIGNAL\n5. WHAT TO CHANGE\n6. RED FLAGS\n7. NEXT 3 ACTIONS\n\nPlain text. Specific. Use the actual numbers.`;

    const key = process.env.CLAUDE_API_KEY;
    const r = await fetch(AI_ENDPOINTS.claude, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role:'user', content: prompt }] })
    });
    const d = await r.json();
    const analysis = d.content?.[0]?.text || 'Analysis failed';

    await Programme.findOneAndUpdate({ founderId }, { 'survey.analysis': analysis, 'survey.lastUpdated': new Date() });
    res.json({ analysis, responseCount: prog.survey.responses.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;