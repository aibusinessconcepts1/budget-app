const FETCH_TRANSACTIONS_WEBHOOK = 'https://hook.us1.make.com/qo20stbnt4iz38r1nu78y4oxlgu3plog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await fetch(FETCH_TRANSACTIONS_WEBHOOK);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
