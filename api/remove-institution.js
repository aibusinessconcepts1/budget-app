import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const { item_id } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Clear matching rows in Institutions tab
    const instRes = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'Institutions!A2:D',
    });
    const instRows = instRes.data.values || [];
    await Promise.all(
      instRows.map(async (row, i) => {
        if (row[0] === item_id) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `Institutions!A${i + 2}:D${i + 2}`,
          });
        }
      })
    );

    // Clear matching rows in Accounts tab (item_id is column B)
    const acctRes = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'Accounts!A2:G',
    });
    const acctRows = acctRes.data.values || [];
    await Promise.all(
      acctRows.map(async (row, i) => {
        if (row[1] === item_id) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `Accounts!A${i + 2}:G${i + 2}`,
          });
        }
      })
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
