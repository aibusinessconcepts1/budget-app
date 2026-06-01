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

    // ── PATCH: manually update one account's balance for a given month ──
    if (req.method === 'PATCH') {
      const { account_id, account_name, month, balance, account_type, source } = req.body || {};
      if (!account_id || !month) return res.status(400).json({ error: 'account_id and month required' });

      // Read all rows to find the latest existing row for this account in this month
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `${SHEET}!A2:F`,
      });
      const rows = resp.data.values || [];

      let targetRowIndex = -1;
      let latestDate = '';
      rows.forEach((row, i) => {
        if (row[1] === account_id && (row[0] || '').startsWith(month)) {
          if (!latestDate || row[0] > latestDate) {
            latestDate = row[0];
            targetRowIndex = i;
          }
        }
      });

      if (targetRowIndex >= 0) {
        // Update the balance column (D) of the existing row in place
        const sheetRow = targetRowIndex + 2; // +1 for 0-index, +1 for header
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET}!D${sheetRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[balance]] },
        });
      } else {
        // No row exists for this account in this month — append a new one
        const [y, m] = month.split('-').map(Number);
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let date;
        if (month >= currentMonth) {
          // Current month: use today's local date
          date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        } else {
          // Past month: use the last day of that month
          const lastDay = new Date(y, m, 0).getDate();
          date = `${month}-${String(lastDay).padStart(2, '0')}`;
        }
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${SHEET}!A:F`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[date, account_id, account_name || account_id, balance, account_type || '', source || 'manual']],
          },
        });
      }

      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
