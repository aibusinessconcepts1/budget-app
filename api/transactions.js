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
      range: 'Transactions!A2:I',
    });

    const rows = response.data.values || [];

    const transactions = rows.map((row) => ({
      transaction_id: row[0] || '',
      account_id: row[1] || '',
      date: row[2] || '',
      amount: parseFloat(row[3]) || 0,
      merchant_name: row[4] || '',
      category: row[5] || '',
      pending: row[6] === 'true' || row[6] === 'TRUE',
      user_category: row[7] || '',
      date_loaded: row[8] || '',
    }));

    res.status(200).json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
