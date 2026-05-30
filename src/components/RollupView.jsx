import { useState } from 'react';
import { formatAmount } from '../utils';

const INCOME_CATEGORIES = ['Income - Jon', 'Income - Janette', 'Rewards', 'Other'];

const CATEGORY_COLORS = [
  '#1a2744', '#c9a84c', '#2d6a9f', '#1a7a5e',
  '#8b4c8c', '#c0392b', '#2980b9', '#16a085',
  '#d35400', '#6c5ce7',
];

function DrillDownTable({ transactions, accounts, title, onBack }) {
  const getAccountName = (accountId) => {
    const account = accounts.find((a) => a.account_id === accountId);
    return account ? (account.official_name || account.name) : accountId;
  };
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  return (
    <div>
      <div className="drilldown-header">
        <button className="drilldown-back" onClick={onBack}>← Back</button>
        <span className="drilldown-title">{title}</span>
        <span className="drilldown-subtitle">
          {transactions.length} transactions · {formatAmount(Math.abs(total))}
        </span>
      </div>
      <div className="transaction-list">
        <table className="txn-table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Date</th>
              <th>Merchant</th>
              <th style={{ width: '160px' }}>Plaid Category</th>
              <th style={{ width: '160px' }}>My Category</th>
              <th style={{ width: '150px' }}>Account</th>
              <th style={{ width: '100px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {[...transactions]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((txn) => (
                <tr key={txn.transaction_id} className={txn.pending ? 'pending' : ''}>
                  <td className="date">{txn.date}</td>
                  <td className="merchant">
                    {txn.merchant_name}
                    {txn.pending && <span className="pending-badge">Pending</span>}
                  </td>
                  <td><span className="category-tag">{txn.category}</span></td>
                  <td style={{ fontSize: '13px', color: '#7a8ba8' }}>{txn.user_category || '—'}</td>
                  <td className="account-col">{getAccountName(txn.account_id)}</td>
                  <td className="right amount" style={{ textAlign: 'right' }}>{formatAmount(txn.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RollupView({ transactions, accounts, allTransactions = [], plaidBalances = {}, manualAccounts = [], selectedMonth = 'all' }) {
  const [categoryType, setCategoryType] = useState('user');
  const [showTransfers, setShowTransfers] = useState(false);
  const [drillDown, setDrillDown] = useState(null);

  // ── Core filtering (same logic as before) ──
  const seen = new Set();
  const unique = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  const loanTxns = unique.filter((t) => (t.category || '').toLowerCase().includes('loan'));
  const matchedIds = new Set();
  const positives = loanTxns.filter((t) => t.amount > 0);
  const negatives = loanTxns.filter((t) => t.amount < 0);
  for (const pos of positives) {
    const match = negatives.find(
      (neg) =>
        Math.abs(neg.amount) === pos.amount &&
        !matchedIds.has(neg.transaction_id) &&
        Math.abs(new Date(pos.date) - new Date(neg.date)) <= 5 * 24 * 60 * 60 * 1000
    );
    if (match) {
      matchedIds.add(pos.transaction_id);
      matchedIds.add(match.transaction_id);
    }
  }
  const internalTransfers = loanTxns.filter((t) => matchedIds.has(t.transaction_id));
  const unmatchedLoans = loanTxns.filter((t) => !matchedIds.has(t.transaction_id));
  const nonTransfers = [
    ...unique.filter((t) => !(t.category || '').toLowerCase().includes('loan')),
    ...unmatchedLoans,
  ];

  const income = nonTransfers.filter((t) => t.amount < 0 && INCOME_CATEGORIES.includes(t.user_category));
  const expenseOffsets = nonTransfers.filter((t) => t.amount < 0 && !INCOME_CATEGORIES.includes(t.user_category));
  const expenses = nonTransfers.filter((t) => t.amount > 0);

  const totalIncome = Math.abs(income.reduce((sum, t) => sum + t.amount, 0));
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalOffsets = Math.abs(expenseOffsets.reduce((sum, t) => sum + t.amount, 0));
  const netExpenses = totalExpenses - totalOffsets;
  const net = totalIncome - netExpenses;

  // ── Suggestion 1: Savings rate ──
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : null;

  // ── Suggestion 2: Uncategorised count ──
  const uncategorizedCount = nonTransfers.filter((t) => t.amount > 0 && !t.user_category).length;

  // ── Suggestion 3: Average daily spend ──
  const daysInPeriod = (() => {
    if (!selectedMonth || selectedMonth === 'all') {
      if (expenses.length === 0) return 30;
      const dates = expenses.map((t) => new Date(t.date).getTime());
      return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1);
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  })();
  const avgDailySpend = netExpenses / Math.max(1, daysInPeriod);

  // ── Suggestion 4: Largest transaction ──
  const largestTxn = expenses.length > 0
    ? expenses.reduce((max, t) => (t.amount > max.amount ? t : max), expenses[0])
    : null;

  // ── Suggestion 5: Month-over-month ──
  const prevMonthStr = (() => {
    if (!selectedMonth || selectedMonth === 'all') return null;
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prevMonthNetExpenses = prevMonthStr
    ? allTransactions
        .filter((t) =>
          t.date?.startsWith(prevMonthStr) &&
          t.amount > 0 &&
          !(t.category || '').toLowerCase().includes('loan')
        )
        .reduce((sum, t) => sum + t.amount, 0)
    : null;
  const momPct =
    prevMonthNetExpenses != null && prevMonthNetExpenses > 0
      ? Math.round(((netExpenses - prevMonthNetExpenses) / prevMonthNetExpenses) * 100)
      : null;

  // ── Suggestion 6: 6-month spending trend ──
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const trendData = trendMonths.map((month) => {
    const total = allTransactions
      .filter((t) =>
        t.date?.startsWith(month) &&
        t.amount > 0 &&
        !(t.category || '').toLowerCase().includes('loan')
      )
      .reduce((sum, t) => sum + t.amount, 0);
    const [y, m] = month.split('-');
    const label = new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short' });
    return { month, total, label };
  });
  const maxTrend = Math.max(...trendData.map((d) => d.total), 1);
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // ── Suggestion 7: Net worth ──
  const plaidAssets = accounts
    .filter((a) => a.type !== 'credit')
    .reduce((sum, a) => sum + (plaidBalances[a.account_id]?.current || 0), 0);
  const plaidLiabilities = accounts
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + (plaidBalances[a.account_id]?.current || 0), 0);
  const manualAssets = manualAccounts
    .filter((a) => !['credit', 'mortgage', 'loan'].includes(a.type))
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  const manualLiabilities = manualAccounts
    .filter((a) => ['credit', 'mortgage', 'loan'].includes(a.type))
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalAssets = plaidAssets + manualAssets;
  const totalLiabilities = plaidLiabilities + manualLiabilities;
  const netWorth = totalAssets - totalLiabilities;
  const hasBalanceData =
    Object.keys(plaidBalances).length > 0 || manualAccounts.length > 0;

  // ── Category maps ──
  const categorySource =
    categoryType === 'user'
      ? [...expenses, ...expenseOffsets].filter((t) => t.user_category)
      : [...expenses, ...expenseOffsets];

  const byCategoryMap = categorySource.reduce((groups, txn) => {
    const cat = categoryType === 'user' ? txn.user_category : txn.category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0, txns: [] };
    groups[cat].total += txn.amount;
    groups[cat].count += 1;
    groups[cat].txns.push(txn);
    return groups;
  }, {});
  const categories = Object.entries(byCategoryMap)
    .filter(([, d]) => d.total > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const byIncomeCategoryMap = income.reduce((groups, txn) => {
    const cat = txn.user_category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0, txns: [] };
    groups[cat].total += Math.abs(txn.amount);
    groups[cat].count += 1;
    groups[cat].txns.push(txn);
    return groups;
  }, {});
  const incomeCategories = Object.entries(byIncomeCategoryMap).sort((a, b) => a[0].localeCompare(b[0]));

  const byAccount = [...expenses, ...expenseOffsets].reduce((groups, txn) => {
    const account = accounts.find((a) => a.account_id === txn.account_id);
    const key = account ? (account.official_name || account.name) : txn.account_id;
    if (!groups[key]) groups[key] = { total: 0, txns: [] };
    groups[key].total += txn.amount;
    groups[key].txns.push(txn);
    return groups;
  }, {});

  // ── Bar scale maximums (relative to largest category, not total) ──
  const maxCategoryTotal = categories.length > 0
    ? Math.max(...categories.map(([, d]) => d.total))
    : 1;
  const maxIncomeCategoryTotal = incomeCategories.length > 0
    ? Math.max(...incomeCategories.map(([, d]) => d.total))
    : 1;
  const maxAccountTotal = Object.values(byAccount).length > 0
    ? Math.max(...Object.values(byAccount).filter((d) => d.total > 0).map((d) => d.total))
    : 1;

  // ── Drill-down ──
  if (drillDown) {
    return (
      <div className="rollup-view">
        <DrillDownTable
          transactions={drillDown.txns}
          accounts={accounts}
          title={drillDown.title}
          onBack={() => setDrillDown(null)}
        />
      </div>
    );
  }

  return (
    <div className="rollup-view">

      {/* ── Main stats row ── */}
      <div className="rollup-header">
        <div className="rollup-stat">
          <span className="stat-label">Income</span>
          <span className="stat-value income">{formatAmount(totalIncome)}</span>
        </div>

        <div className="rollup-stat">
          <span className="stat-label">Expenses</span>
          <span className="stat-value expenses">{formatAmount(netExpenses)}</span>
          {momPct !== null && (
            <span className={`stat-mom ${momPct > 0 ? 'mom-up' : 'mom-down'}`}>
              {momPct > 0 ? '↑' : '↓'} {Math.abs(momPct)}% vs last month
            </span>
          )}
          {largestTxn && (
            <span className="stat-sub">
              Largest: {largestTxn.merchant_name} · {formatAmount(largestTxn.amount)}
            </span>
          )}
        </div>

        <div className="rollup-stat">
          <span className="stat-label">Net</span>
          <span className={`stat-value ${net >= 0 ? 'income' : 'expenses'}`}>
            {formatAmount(net)}
          </span>
          {savingsRate !== null && (
            <span className={`stat-mom ${savingsRate >= 0 ? 'mom-down' : 'mom-up'}`}>
              {savingsRate >= 0 ? '↑' : '↓'} {Math.abs(savingsRate)}% savings rate
            </span>
          )}
        </div>

        <div className="rollup-stat">
          <span className="stat-label">Transactions</span>
          <span className="stat-value">{nonTransfers.length.toLocaleString()}</span>
          {uncategorizedCount > 0 && (
            <span className="stat-warning">⚠ {uncategorizedCount} uncategorized</span>
          )}
        </div>
      </div>

      {/* ── Secondary stats row ── */}
      <div className="rollup-secondary">
        {hasBalanceData && (
          <div className="rollup-stat-sm">
            <span className="stat-label">Net Worth</span>
            <span className={`stat-value-sm ${netWorth >= 0 ? 'income' : 'expenses'}`}>
              {formatAmount(netWorth)}
            </span>
            <div className="net-worth-breakdown">
              <span className="nw-assets">Assets {formatAmount(totalAssets)}</span>
              <span className="nw-sep">·</span>
              <span className="nw-liabilities">Liabilities {formatAmount(totalLiabilities)}</span>
            </div>
          </div>
        )}
        <div className="rollup-stat-sm">
          <span className="stat-label">Avg Daily Spend</span>
          <span className="stat-value-sm">{formatAmount(avgDailySpend)}</span>
          <span className="stat-sub">over {daysInPeriod} days</span>
        </div>
        <div className="rollup-stat-sm">
          <span className="stat-label">Largest Transaction</span>
          {largestTxn ? (
            <>
              <span className="stat-value-sm expenses">{formatAmount(largestTxn.amount)}</span>
              <span className="stat-sub">{largestTxn.merchant_name}</span>
            </>
          ) : (
            <span className="stat-value-sm">—</span>
          )}
        </div>
      </div>

      {/* ── Category sections ── */}
      <div className="rollup-sections">
        <div className="rollup-section">
          <div className="rollup-section-header">
            <h3>Spend by Category</h3>
            <div className="category-toggle">
              <button
                className={`toggle-btn ${categoryType === 'user' ? 'active' : ''}`}
                onClick={() => setCategoryType('user')}
              >My Categories</button>
              <button
                className={`toggle-btn ${categoryType === 'plaid' ? 'active' : ''}`}
                onClick={() => setCategoryType('plaid')}
              >Plaid</button>
            </div>
          </div>
          <div className="category-list">
            {categories.length === 0 && (
              <p style={{ fontSize: '13px', color: '#b0bac8' }}>
                {categoryType === 'user' ? 'No transactions with My Categories assigned yet.' : 'No data.'}
              </p>
            )}
            {categories.map(([cat, data], i) => (
              <div
                key={cat}
                className="category-row"
                onClick={() => setDrillDown({ title: cat, txns: data.txns })}
                title="Click to view transactions"
              >
                <span className="category-name">{cat}</span>
                <span className="category-count">{data.count} txns</span>
                <span className="category-amount">{formatAmount(data.total)}</span>
                <div className="category-bar-cell">
                  <div className="category-bar-wrap">
                    <div
                      className="category-bar"
                      style={{
                        width: `${(data.total / maxCategoryTotal) * 100}%`,
                        background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rollup-section">
          <h3 style={{ marginBottom: '16px' }}>Spend by Account</h3>
          <div className="category-list category-list-3col">
            {Object.entries(byAccount)
              .filter(([, data]) => data.total > 0)
              .map(([name, data], i) => (
                <div
                  key={name}
                  className="category-row"
                  onClick={() => setDrillDown({ title: name, txns: data.txns })}
                  title="Click to view transactions"
                >
                  <span className="category-name">{name}</span>
                  <span className="category-amount">{formatAmount(data.total)}</span>
                  <div className="category-bar-cell">
                    <div className="category-bar-wrap">
                      <div
                        className="category-bar"
                        style={{
                          width: `${(data.total / maxAccountTotal) * 100}%`,
                          background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Income by Category ── */}
      {categoryType === 'user' && (
        <div className="rollup-section" style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Income by Category</h3>
          <div className="category-list">
            {incomeCategories.length === 0 && (
              <p style={{ fontSize: '13px', color: '#b0bac8' }}>
                No income categorised yet. Use: {INCOME_CATEGORIES.join(', ')}.
              </p>
            )}
            {incomeCategories.map(([cat, data], i) => (
              <div
                key={cat}
                className="category-row"
                onClick={() => setDrillDown({ title: cat, txns: data.txns })}
                title="Click to view transactions"
              >
                <span className="category-name">{cat}</span>
                <span className="category-count">{data.count} txns</span>
                <span className="category-amount">{formatAmount(data.total)}</span>
                <div className="category-bar-cell">
                  <div className="category-bar-wrap">
                    <div
                      className="category-bar"
                      style={{
                        width: `${(data.total / maxIncomeCategoryTotal) * 100}%`,
                        background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6-Month Spending Trend ── */}
      <div className="rollup-section trend-section" style={{ marginBottom: '16px' }}>
        <h3>6-Month Spending Trend</h3>
        <div className="trend-chart">
          {trendData.map(({ month, total, label }) => {
            const heightPct = (total / maxTrend) * 100;
            const isCurrent = month === (selectedMonth !== 'all' ? selectedMonth : currentMonthStr);
            return (
              <div key={month} className="trend-col">
                <span className="trend-amount-label">
                  {total > 0 ? formatAmount(total) : ''}
                </span>
                <div className="trend-bar-container">
                  <div
                    className={`trend-bar ${isCurrent ? 'trend-bar-current' : ''}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="trend-month-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Internal Transfers ── */}
      {internalTransfers.length > 0 && (
        <div className="transfers-section">
          <button className="transfers-toggle" onClick={() => setShowTransfers((v) => !v)}>
            {showTransfers ? '▾' : '▸'} Internal Transfers ({internalTransfers.length})
          </button>
          {showTransfers && (
            <table className="transfers-table">
              <thead>
                <tr>
                  <th>Date</th><th>Description</th><th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...internalTransfers]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((txn) => (
                    <tr key={txn.transaction_id}>
                      <td>{txn.date}</td>
                      <td>{txn.merchant_name}</td>
                      <td>{txn.category}</td>
                      <td style={{ textAlign: 'right' }}>{formatAmount(txn.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default RollupView;
