import { google } from 'googleapis';

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

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Accounts!A2:G',
    });

    const rows = response.data.values || [];

    const accounts = rows
      .map((row) => ({
        account_id: row[0] || '',
        item_id: row[1] || '',
        name: row[2] || '',
        official_name: row[3] || '',
        type: row[4] || '',
        subtype: row[5] || '',
        mask: row[6] || '',
      }))
      .filter((a) => a.account_id);

    res.status(200).json(accounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
