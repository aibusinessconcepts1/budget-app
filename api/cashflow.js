import { google } from 'googleapis';

const ROWS_SHEET = 'CashFlowRows';
const DATA_SHEET = 'CashFlowData';

const ROWS_HEADERS = ['RowID', 'Label', 'Section', 'SortOrder', 'Keyword', 'Active'];
const DATA_HEADERS = ['WeekEnding', 'RowID', 'Amount', 'Source'];

// Default row definitions (seeded on first use)
const DEFAULT_ROWS = [
  ['income_jon',       'Jon',               'income',      '1',  'Income - Jon',                          'TRUE'],
  ['income_janette',   'Janette',           'income',      '2',  'Income - Janette',                      'TRUE'],
  ['income_other',     'Other',             'income',      '3',  '',                                       'TRUE'],
  ['cc_citi',          'Citi',              'credit_card', '10', 'CITI,CITIBANK',                         'TRUE'],
  ['cc_chase',         'Chase',             'credit_card', '11', 'CHASE',                                 'TRUE'],
  ['cc_amex',          'Amex',              'credit_card', '12', 'AMEX,AMERICAN EXPRESS',                 'TRUE'],
  ['cc_capital_one',   'Capital One',       'credit_card', '13', 'CAPITAL ONE,CAPITALONE',                'TRUE'],
  ['cc_discover',      'Discover',          'credit_card', '14', 'DISCOVER',                              'TRUE'],
  ['cc_home_depot',    'Home Depot',        'credit_card', '15', 'HOME DEPOT,HOMEDEPOT',                  'TRUE'],
  ['cc_lowes',         "Lowe's",            'credit_card', '16', "LOWES,LOWE'S",                         'TRUE'],
  ['cc_target',        'Target',            'credit_card', '17', 'TARGET',                                'TRUE'],
  ['cc_other',         'Other Credit Cards','credit_card', '18', '',                                       'TRUE'],
  ['expense_mortgage', 'Mortgage',          'expense',     '30', 'MORTGAGE',                              'TRUE'],
  ['expense_power',    'Power',             'expense',     '31', 'POWER,ELECTRIC,DUKE,FPL,PROGRESS',      'TRUE'],
  ['expense_gas',      'Gas',               'expense',     '32', 'GAS,NATURAL GAS',                       'TRUE'],
  ['expense_cable',    'Cable',             'expense',     '33', 'CABLE,COMCAST,SPECTRUM,XFINITY',        'TRUE'],
  ['expense_phone',    'Phone',             'expense',     '34', 'PHONE,AT&T,VERIZON,T-MOBILE,SPRINT',    'TRUE'],
  ['expense_insurance','Insurance',         'expense',     '35', 'INSURANCE',                             'TRUE'],
  ['expense_taxes',    'Taxes',             'expense',     '36', 'TAX,IRS',                               'TRUE'],
  ['expense_other',    'Other Expense',     'expense',     '37', '',                                       'TRUE'],
  ['transfer_savings', 'Savings',           'transfer',    '50', 'SAVINGS',                               'TRUE'],
  ['transfer_other',   'Other',             'transfer',    '51', '',                                       'TRUE'],
  // Config rows: section = _config, label = value
  ['_cfg_opening_balance', '8745',       '_config', '0', '', 'TRUE'],
  ['_cfg_opening_date',    '2026-05-01', '_config', '0', '', 'TRUE'],
  ['_cfg_threshold',       '1000',       '_config', '0', '', 'TRUE'],
];

async function ensureSheet(sheets, spreadsheetId, sheetName, headers, defaultRows) {
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1` });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers, ...(defaultRows || [])] },
    });
  }
}

function parseRows(rawRows) {
  return (rawRows || [])
    .filter((r) => r[0])
    .map((r) => ({
      row_id:     r[0] || '',
      label:      r[1] || '',
      section:    r[2] || '',
      sort_order: parseInt(r[3]) || 0,
      keyword:    r[4] || '',
      active:     r[5] !== 'FALSE',
    }));
}

function parseData(rawRows) {
  return (rawRows || [])
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      week_ending: r[0] || '',
      row_id:      r[1] || '',
      amount:      parseFloat(r[2]) || 0,
      source:      r[3] || 'manual',
    }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const credentials  = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const auth = new google.auth.GoogleAuth({
      credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureSheet(sheets, spreadsheetId, ROWS_SHEET, ROWS_HEADERS, DEFAULT_ROWS);
    await ensureSheet(sheets, spreadsheetId, DATA_SHEET, DATA_HEADERS, []);

    // ── GET: return rows + data ──────────────────────────────────────────
    if (req.method === 'GET') {
      const [rowsRes, dataRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${ROWS_SHEET}!A2:F` }),
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${DATA_SHEET}!A2:D` }),
      ]);
      return res.status(200).json({
        rows: parseRows(rowsRes.data.values),
        data: parseData(dataRes.data.values),
      });
    }

    // ── POST: actions ────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const { action } = body;

      // Save a single cell value for a week + row
      if (action === 'save_cell') {
        const { week_ending, row_id, amount, source } = body;
        const dataRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${DATA_SHEET}!A2:D`,
        });
        const rows = dataRes.data.values || [];
        let found = -1;
        rows.forEach((r, i) => { if (r[0] === week_ending && r[1] === row_id) found = i; });

        if (found >= 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId, range: `${DATA_SHEET}!C${found + 2}:D${found + 2}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[amount, source || 'manual']] },
          });
        } else {
          await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${DATA_SHEET}!A:D`,
            valueInputOption: 'RAW',
            requestBody: { values: [[week_ending, row_id, amount, source || 'manual']] },
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Lock or unlock a week
      if (action === 'lock_week') {
        const { week_ending, locked } = body;
        const lockRowId = '_LOCKED';
        const dataRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${DATA_SHEET}!A2:D`,
        });
        const rows = dataRes.data.values || [];
        let found = -1;
        rows.forEach((r, i) => { if (r[0] === week_ending && r[1] === lockRowId) found = i; });

        if (locked) {
          if (found >= 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId, range: `${DATA_SHEET}!C${found + 2}`,
              valueInputOption: 'RAW', requestBody: { values: [['1']] },
            });
          } else {
            await sheets.spreadsheets.values.append({
              spreadsheetId, range: `${DATA_SHEET}!A:D`,
              valueInputOption: 'RAW',
              requestBody: { values: [[week_ending, lockRowId, '1', 'system']] },
            });
          }
        } else if (found >= 0) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `${DATA_SHEET}!A${found + 2}:D${found + 2}`,
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Save config value (opening_balance, opening_date, threshold)
      if (action === 'save_config') {
        const { key, value } = body; // key = _cfg_opening_balance etc.
        const rowsRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${ROWS_SHEET}!A2:F`,
        });
        const rows = rowsRes.data.values || [];
        let found = -1;
        rows.forEach((r, i) => { if (r[0] === key) found = i; });

        if (found >= 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId, range: `${ROWS_SHEET}!B${found + 2}`,
            valueInputOption: 'RAW', requestBody: { values: [[value]] },
          });
        } else {
          await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${ROWS_SHEET}!A:F`,
            valueInputOption: 'RAW',
            requestBody: { values: [[key, value, '_config', '0', '', 'TRUE']] },
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Add a new row definition
      if (action === 'add_row') {
        const { row_id, label, section, sort_order, keyword } = body;
        await sheets.spreadsheets.values.append({
          spreadsheetId, range: `${ROWS_SHEET}!A:F`,
          valueInputOption: 'RAW',
          requestBody: { values: [[row_id, label, section, sort_order, keyword || '', 'TRUE']] },
        });
        return res.status(200).json({ ok: true });
      }

      // Update row sort orders (reorder)
      if (action === 'reorder_rows') {
        const { updates } = body; // [{ row_id, sort_order }]
        const rowsRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${ROWS_SHEET}!A2:F`,
        });
        const rows = rowsRes.data.values || [];
        await Promise.all(updates.map(async ({ row_id, sort_order }) => {
          const idx = rows.findIndex((r) => r[0] === row_id);
          if (idx >= 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId, range: `${ROWS_SHEET}!D${idx + 2}`,
              valueInputOption: 'RAW', requestBody: { values: [[sort_order]] },
            });
          }
        }));
        return res.status(200).json({ ok: true });
      }

      // Delete a row definition (clear the row)
      if (action === 'delete_row') {
        const { row_id } = body;
        const rowsRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${ROWS_SHEET}!A2:F`,
        });
        const rows = rowsRes.data.values || [];
        const idx = rows.findIndex((r) => r[0] === row_id);
        if (idx >= 0) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId, range: `${ROWS_SHEET}!A${idx + 2}:F${idx + 2}`,
          });
        }
        return res.status(200).json({ ok: true });
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
