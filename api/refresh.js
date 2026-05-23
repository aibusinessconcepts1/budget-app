const FETCH_TRANSACTIONS_WEBHOOK = 'https://hook.us1.make.com/qo20stbnt4iz38r1nu78y4oxlgu3plog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const makeRes = await fetch(FETCH_TRANSACTIONS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const text = await makeRes.text();
    console.log('Make response:', makeRes.status, text);
    res.status(200).json({ ok: true, makeStatus: makeRes.status });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: err.message });
  }
}
