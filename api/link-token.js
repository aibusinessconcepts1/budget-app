export default async function handler(req, res) {
  try {
    const response = await fetch('https://sandbox.plaid.com/link/token/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        user: { client_user_id: 'budget-app-user' },
        client_name: 'Budget App',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.error_message });
    }

    res.status(200).json({ link_token: data.link_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
