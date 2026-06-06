import { useState, useMemo } from 'react';

const LIABILITIES = ['credit', 'mortgage', 'loan'];
const HISTORY_START = '2026-05';

function fmtBalance(balance, accountType) {
  const isLiability = LIABILITIES.includes(accountType);
  const displayNum = isLiability ? -Math.abs(balance) : balance;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(displayNum);
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('default', {
    month: 'short', year: 'numeric',
  });
}

function generateMonths(from) {
  const months = [];
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let m = from;
  while (m <= currentMonth) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    const next = mo === 12
      ? `${y + 1}-01`
      : `${y}-${String(mo + 1).padStart(2, '0')}`;
    m = next;
  }
  return months;
}

export default function BalanceHistoryView({ history, onSave, accounts = [], manualAccounts = [] }) {
  const [editingCell, setEditingCell] = useState(null); // { account_id, month }
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const months = useMemo(() => generateMonths(HISTORY_START), []);

  // Latest snapshot per account per month
  const monthData = useMemo(() => {
    const result = {};
    for (const month of months) {
      const monthRows = history.filter((r) => r.date.startsWith(month));
      const latest = {};
      for (const row of monthRows) {
        if (!latest[row.account_id] || row.date > latest[row.account_id].date) {
          latest[row.account_id] = row;
        }
      }
      result[month] = latest;
    }
    return result;
  }, [history, months]);

  // Derive all unique accounts: history rows + any current accounts not yet in history
  const allAccounts = useMemo(() => {
    const seen = new Map();
    // Seed from history first (most recent name wins)
    for (const row of history) {
      if (!seen.has(row.account_id) || row.date > seen.get(row.account_id).date) {
        seen.set(row.account_id, {
          account_id: row.account_id,
          account_name: row.account_name,
          account_type: row.account_type,
          source: row.source,
          date: row.date,
        });
      }
    }
    // Add any current Plaid accounts not yet in history
    for (const a of accounts) {
      if (!seen.has(a.account_id)) {
        seen.set(a.account_id, {
          account_id: a.account_id,
          account_name: a.official_name || a.name,
          account_type: a.type,
          source: 'plaid',
          date: '',
        });
      }
    }
    // Add any current manual accounts not yet in history
    for (const a of manualAccounts) {
      if (!seen.has(a.account_id)) {
        seen.set(a.account_id, {
          account_id: a.account_id,
          account_name: a.name,
          account_type: a.type,
          source: 'manual',
          date: '',
        });
      }
    }
    // Assets first, then liabilities, alphabetical within each group
    return [...seen.values()].sort((a, b) => {
      const aLiab = LIABILITIES.includes(a.account_type) ? 1 : 0;
      const bLiab = LIABILITIES.includes(b.account_type) ? 1 : 0;
      if (aLiab !== bLiab) return aLiab - bLiab;
      return a.account_name.localeCompare(b.account_name);
    });
  }, [history, accounts, manualAccounts]);

  // Last snapshot date per month (for header subtitle)
  const lastDateByMonth = useMemo(() => {
    const result = {};
    for (const month of months) {
      const dates = history
        .filter((r) => r.date.startsWith(month))
        .map((r) => r.date);
      result[month] = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    }
    return result;
  }, [history, months]);

  const startEdit = (account_id, month, currentBalance) => {
    setEditingCell({ account_id, month });
    setEditValue(currentBalance != null ? String(Math.abs(currentBalance)) : '');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell || saving) return;
    const { account_id, month } = editingCell;
    const acct = allAccounts.find((a) => a.account_id === account_id);
    const balance = parseFloat(editValue) || 0;
    setSaving(true);
    try {
      await onSave(
        account_id,
        acct?.account_name || account_id,
        month,
        balance,
        acct?.account_type || '',
        acct?.source || 'manual',
      );
    } finally {
      setSaving(false);
      setEditingCell(null);
      setEditValue('');
    }
  };

  if (history.length === 0) {
    return (
      <div className="bh-empty-state">
        <p>No balance history yet.</p>
        <p>Balances are captured automatically each day you open or refresh the app. Check back after your first snapshot.</p>
      </div>
    );
  }

  return (
    <div className="bh-wrap">
      <p className="bh-hint">Click any balance to edit it.</p>
      <div className="bh-table-wrap">
        <table className="bh-table">
          <thead>
            <tr>
              <th className="bh-account-col">Account</th>
              {months.map((m) => (
                <th key={m} className="bh-month-col">
                  <div className="bh-month-label">{monthLabel(m)}</div>
                  {lastDateByMonth[m] && (
                    <div className="bh-as-of">as of {lastDateByMonth[m].slice(8)}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAccounts.map((acct) => {
              const isLiability = LIABILITIES.includes(acct.account_type);
              return (
                <tr key={acct.account_id}>
                  <td className="bh-name-cell">
                    <span className="bh-acct-name">{acct.account_name}</span>
                    <span className="bh-acct-type">{acct.account_type}</span>
                  </td>
                  {months.map((m) => {
                    const isEditing = editingCell?.account_id === acct.account_id && editingCell?.month === m;
                    const snap = monthData[m]?.[acct.account_id];

                    if (isEditing) {
                      return (
                        <td key={m} className="bh-editing-cell">
                          <div className="bh-edit-row">
                            <input
                              className="bh-edit-input"
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                              disabled={saving}
                            />
                            <button className="bh-edit-save" onClick={saveEdit} disabled={saving}>✓</button>
                            <button className="bh-edit-cancel" onClick={cancelEdit} disabled={saving}>✕</button>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={m}
                        className={`bh-amount bh-editable ${snap ? (isLiability ? 'bh-liability' : 'bh-asset') : 'bh-no-data'}`}
                        onClick={() => startEdit(acct.account_id, m, snap?.balance)}
                        title="Click to edit"
                      >
                        {snap ? fmtBalance(snap.balance, acct.account_type) : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Net Worth row — read-only */}
            <tr className="bh-net-worth-row">
              <td className="bh-name-cell">
                <span className="bh-acct-name">Net Worth</span>
              </td>
              {months.map((m) => {
                const snaps = monthData[m];
                if (!snaps || Object.keys(snaps).length === 0) {
                  return <td key={m} className="bh-amount bh-no-data">—</td>;
                }
                const netWorth = Object.values(snaps).reduce((sum, snap) => {
                  const isLiab = LIABILITIES.includes(snap.account_type);
                  return sum + (isLiab ? -Math.abs(snap.balance) : snap.balance);
                }, 0);
                return (
                  <td
                    key={m}
                    className={`bh-amount bh-net-worth-val ${netWorth >= 0 ? 'bh-asset' : 'bh-liability'}`}
                  >
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency', currency: 'USD',
                      minimumFractionDigits: 0, maximumFractionDigits: 0,
                    }).format(netWorth)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
