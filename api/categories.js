import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  if (req.method === 'GET') {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Categories!A2:A',
      });
      const rows = response.data.values || [];
      const categories = rows.map((row) => row[0]).filter(Boolean);
      res.status(200).json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { category_name } = req.body;
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Categories!A:A',
        valueInputOption: 'RAW',
        requestBody: { values: [[category_name]] },
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
