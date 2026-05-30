import { google } from 'googleapis';

const PLAID_URL = 'https://production.plaid.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Read access tokens from Institutions tab
    const instRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Institutions!A2:C',
    });
    const institutions = (instRes.data.values || []).map((row) => ({
      item_id: row[0] || '',
      access_token: row[1] || '',
      institution_name: row[2] || '',
    })).filter((i) => i.access_token);

    // Fetch balances from Plaid for each institution
    const balances = {};
    await Promise.all(
      institutions.map(async (inst) => {
        try {
          const plaidRes = await fetch(`${PLAID_URL}/accounts/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: process.env.PLAID_CLIENT_ID,
              secret: process.env.PLAID_SECRET,
              access_token: inst.access_token,
            }),
          });
          const data = await plaidRes.json();
          if (data.accounts) {
            data.accounts.forEach((acct) => {
              balances[acct.account_id] = {
                current: acct.balances.current,
                available: acct.balances.available,
                limit: acct.balances.limit,
                iso_currency_code: acct.balances.iso_currency_code,
              };
            });
          }
        } catch (err) {
          console.error(`Balance fetch failed for ${inst.institution_name}:`, err.message);
        }
      })
    );

    res.status(200).json(balances);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
