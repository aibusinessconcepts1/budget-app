import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // GET — list all manual accounts
    if (req.method === 'GET') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Manual_Accounts!A2:E',
      });
      const rows = response.data.values || [];
      const accounts = rows.map((row) => ({
        account_id: row[0] || '',
        name: row[1] || '',
        balance: parseFloat(row[2]) || 0,
        type: row[3] || '',
        last_updated: row[4] || '',
      })).filter((a) => a.account_id);
      return res.status(200).json(accounts);
    }

    // POST — add a new manual account
    if (req.method === 'POST') {
      const { name, balance, type } = req.body;
      const account_id = `manual_${Date.now()}`;
      const last_updated = new Date().toISOString().slice(0, 10);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Manual_Accounts!A:E',
        valueInputOption: 'RAW',
        resource: {
          values: [[account_id, name, balance ?? 0, type || '', last_updated]],
        },
      });
      return res.status(200).json({ ok: true, account_id });
    }

    // PATCH — update balance of an existing manual account
    if (req.method === 'PATCH') {
      const { account_id, balance } = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Manual_Accounts!A2:E',
      });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row) => row[0] === account_id);
      if (rowIndex === -1) return res.status(404).json({ error: 'Account not found' });

      const sheetRow = rowIndex + 2;
      const last_updated = new Date().toISOString().slice(0, 10);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Manual_Accounts!C${sheetRow}:E${sheetRow}`,
        valueInputOption: 'RAW',
        resource: { values: [[balance, rows[rowIndex][3] || '', last_updated]] },
      });
      return res.status(200).json({ ok: true });
    }

    // DELETE — remove a manual account
    if (req.method === 'DELETE') {
      const { account_id } = req.body;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Manual_Accounts!A2:E',
      });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row) => row[0] === account_id);
      if (rowIndex === -1) return res.status(404).json({ error: 'Account not found' });

      const sheetRow = rowIndex + 2;
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `Manual_Accounts!A${sheetRow}:E${sheetRow}`,
      });
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
