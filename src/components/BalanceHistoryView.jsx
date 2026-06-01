import { useMemo } from 'react';

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
  const currentMonth = new Date().toISOString().slice(0, 7);
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

export default function BalanceHistoryView({ history }) {
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

  // Derive all accounts from history (preserves accounts that may have been removed)
  const allAccounts = useMemo(() => {
    const seen = new Map();
    for (const row of history) {
      // Always keep the most recent name for an account_id
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
    // Sort: assets first, then liabilities
    return [...seen.values()].sort((a, b) => {
      const aLiab = LIABILITIES.includes(a.account_type) ? 1 : 0;
      const bLiab = LIABILITIES.includes(b.account_type) ? 1 : 0;
      if (aLiab !== bLiab) return aLiab - bLiab;
      return a.account_name.localeCompare(b.account_name);
    });
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="bh-empty-state">
        <p>No balance history yet.</p>
        <p>Balances are captured automatically each day you open or refresh the app. Check back tomorrow after your first snapshot.</p>
      </div>
    );
  }

  // Last snapshot date per month (for the "as of" label)
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

  return (
    <div className="bh-wrap">
      <div className="bh-table-wrap">
        <table className="bh-table">
          <thead>
            <tr>
              <th className="bh-account-col">Account</th>
              {months.map((m) => (
                <th key={m} className="bh-month-col">
                  <div className="bh-month-label">{monthLabel(m)}</div>
                  {lastDateByMonth[m] && (
                    <div className="bh-as-of">
                      {lastDateByMonth[m] === m + '-' + new Date(m + '-01').toISOString().slice(8, 10)
                        ? ''
                        : `as of ${lastDateByMonth[m].slice(8)}`}
                    </div>
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
                    const snap = monthData[m]?.[acct.account_id];
                    if (!snap) return (
                      <td key={m} className="bh-amount bh-no-data">—</td>
                    );
                    return (
                      <td
                        key={m}
                        className={`bh-amount ${isLiability ? 'bh-liability' : 'bh-asset'}`}
                      >
                        {fmtBalance(snap.balance, acct.account_type)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Net Worth row */}
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
                  const isLiability = LIABILITIES.includes(snap.account_type);
                  return sum + (isLiability ? -Math.abs(snap.balance) : snap.balance);
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
