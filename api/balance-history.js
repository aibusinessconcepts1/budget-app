import { google } from 'googleapis';

const SHEET = 'Balance_History';
const HEADERS = ['Date', 'Account ID', 'Account Name', 'Balance', 'Account Type', 'Source'];

async function ensureSheet(sheets, spreadsheetId) {
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET}!A1` });
  } catch {
    // Sheet doesn't exist — create it and add headers
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

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

    await ensureSheet(sheets, spreadsheetId);

    // ── GET: return all history rows ──
    if (req.method === 'GET') {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `${SHEET}!A2:F`,
      });
      const rows = (resp.data.values || []).filter((r) => r[0]);
      return res.status(200).json(rows.map((row) => ({
        date: row[0] || '',
        account_id: row[1] || '',
        account_name: row[2] || '',
        balance: parseFloat(row[3]) || 0,
        account_type: row[4] || '',
        source: row[5] || '',
      })));
    }

    // ── POST: save today's snapshot (skips if already saved today) ──
    if (req.method === 'POST') {
      const { date, snapshots } = req.body || {};
      if (!date || !Array.isArray(snapshots) || snapshots.length === 0) {
        return res.status(400).json({ error: 'date and snapshots required' });
      }

      // Check for an existing snapshot for this date
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `${SHEET}!A2:A`,
      });
      const existingDates = (existing.data.values || []).map((r) => r[0]);
      if (existingDates.includes(date)) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      const rows = snapshots.map((s) => [
        date, s.account_id, s.account_name, s.balance, s.account_type, s.source,
      ]);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET}!A:F`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });

      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
