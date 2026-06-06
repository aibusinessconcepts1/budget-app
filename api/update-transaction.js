import { google } from 'googleapis';

// Handles two update actions in one endpoint:
//   { transaction_id, merchant_name }  → updates column E
//   { transaction_id, user_category }  → updates column H

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transaction_id, merchant_name, user_category } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ error: 'transaction_id required' });
    }
    if (merchant_name === undefined && user_category === undefined) {
      return res.status(400).json({ error: 'merchant_name or user_category required' });
    }

    const credentials  = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the transaction row by ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Transactions!A2:A',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === transaction_id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const sheetRow = rowIndex + 2;

    if (merchant_name !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Transactions!E${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[merchant_name]] },
      });
    }

    if (user_category !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Transactions!H${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[user_category]] },
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
