import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transaction_id, merchant_name } = req.body;

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get all transactions to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Transactions!A2:G',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === transaction_id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update merchant_name (column E, index 4) — row 2 + rowIndex in sheet
    const sheetRow = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Transactions!E${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[merchant_name]] },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
