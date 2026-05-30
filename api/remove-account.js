import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const { account_id } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the account row, capture its item_id, then clear it
    const acctRes = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'Accounts!A2:G',
    });
    const acctRows = acctRes.data.values || [];
    let removedItemId = null;

    await Promise.all(
      acctRows.map(async (row, i) => {
        if (row[0] === account_id) {
          removedItemId = row[1]; // item_id is column B
          await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `Accounts!A${i + 2}:G${i + 2}`,
          });
        }
      })
    );

    // If no other accounts remain for this institution, remove the institution entry too
    if (removedItemId) {
      const remainingAccounts = acctRows.filter(
        (row) => row[0] && row[0] !== account_id && row[1] === removedItemId
      );

      if (remainingAccounts.length === 0) {
        const instRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: 'Institutions!A2:D',
        });
        const instRows = instRes.data.values || [];
        await Promise.all(
          instRows.map(async (row, i) => {
            if (row[0] === removedItemId) {
              await sheets.spreadsheets.values.clear({
                spreadsheetId, range: `Institutions!A${i + 2}:D${i + 2}`,
              });
            }
          })
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
