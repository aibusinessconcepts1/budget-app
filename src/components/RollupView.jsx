import { useState } from 'react';
import { formatAmount } from '../utils';

const INCOME_CATEGORIES = ['Income - Jon', 'Income - Janette', 'Rewards', 'Other'];

function RollupView({ transactions, accounts }) {
  const [categoryType, setCategoryType] = useState('user');
  const [showTransfers, setShowTransfers] = useState(false);

  // Deduplicate
  const seen = new Set();
  const unique = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  // Match internal transfer pairs (loan transactions that offset each other)
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

  // All non-transfer transactions (includes unmatched loans)
  const nonTransfers = [
    ...unique.filter((t) => !(t.category || '').toLowerCase().includes('loan')),
    ...unmatchedLoans,
  ];

  // Income: negative amount with a predefined income user_category
  const income = nonTransfers.filter(
    (t) => t.amount < 0 && INCOME_CATEGORIES.includes(t.user_category)
  );

  // Expense offsets: negative amount NOT in income categories (e.g. refunds)
  const expenseOffsets = nonTransfers.filter(
    (t) => t.amount < 0 && !INCOME_CATEGORIES.includes(t.user_category)
  );

  // Expenses: positive amounts
  const expenses = nonTransfers.filter((t) => t.amount > 0);

  const totalIncome = Math.abs(income.reduce((sum, t) => sum + t.amount, 0));
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalOffsets = Math.abs(expenseOffsets.reduce((sum, t) => sum + t.amount, 0));
  const netExpenses = totalExpenses - totalOffsets;
  const net = totalIncome - netExpenses;

  // Spend by category (expenses + offsets combined per category)
  const categorySource = categoryType === 'user'
    ? [...expenses, ...expenseOffsets].filter((t) => t.user_category)
    : [...expenses, ...expenseOffsets];

  const byCategory = categorySource.reduce((groups, txn) => {
    const cat = categoryType === 'user'
      ? txn.user_category
      : txn.category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0 };
    groups[cat].total += txn.amount; // negative offsets reduce the total
    groups[cat].count += 1;
    return groups;
  }, {});

  // Filter out zero or negative totals and sort alphabetically
  const categories = Object.entries(byCategory)
    .filter(([, data]) => data.total > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Income by category (only in user mode)
  const byIncomeCategory = income.reduce((groups, txn) => {
    const cat = txn.user_category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0 };
    groups[cat].total += Math.abs(txn.amount);
    groups[cat].count += 1;
    return groups;
  }, {});

  const incomeCategories = Object.entries(byIncomeCategory).sort((a, b) => a[0].localeCompare(b[0]));

  // Spend by account (expenses only, net of offsets)
  const byAccount = [...expenses, ...expenseOffsets].reduce((groups, txn) => {
    const account = accounts.find((a) => a.account_id === txn.account_id);
    const key = account ? (account.official_name || account.name) : txn.account_id;
    if (!groups[key]) groups[key] = 0;
    groups[key] += txn.amount;
    return groups;
  }, {});

  const CATEGORY_COLORS = [
    '#7c3aed', '#f97316', '#06b6d4', '#10b981',
    '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899',
    '#14b8a6', '#6366f1',
  ];

  return (
    <div className="rollup-view">
      <div className="rollup-header">
        <div className="rollup-stat">
          <span className="stat-label">Income</span>
          <span className="stat-value income">{formatAmount(totalIncome)}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Expenses</span>
          <span className="stat-value expenses">{formatAmount(netExpenses)}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Net</span>
          <span className={`stat-value ${net >= 0 ? 'income' : 'expenses'}`}>
            {formatAmount(net)}
          </span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Transactions</span>
          <span className="stat-value">{nonTransfers.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="rollup-sections">
        <div className="rollup-section">
          <div className="rollup-section-header">
            <h3>Spend by Category</h3>
            <div className="category-toggle">
              <button
                className={`toggle-btn ${categoryType === 'user' ? 'active' : ''}`}
                onClick={() => setCategoryType('user')}
              >
                My Categories
              </button>
              <button
                className={`toggle-btn ${categoryType === 'plaid' ? 'active' : ''}`}
                onClick={() => setCategoryType('plaid')}
              >
                Plaid
              </button>
            </div>
          </div>
          <div className="category-list">
            {categories.length === 0 && (
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                {categoryType === 'user' ? 'No transactions with My Categories assigned yet.' : 'No data.'}
              </p>
            )}
            {categories.map(([cat, data], i) => (
              <div key={cat} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(data.total / netExpenses) * 100}%`,
                      background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    }}
                  />
                </div>
                <span className="category-name">{cat}</span>
                <span className="category-count">{data.count} txns</span>
                <span className="category-amount">{formatAmount(data.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rollup-section">
          <h3>Spend by Account</h3>
          <div className="category-list">
            {Object.entries(byAccount)
              .filter(([, total]) => total > 0)
              .map(([name, total], i) => (
                <div key={name} className="category-row">
                  <div className="category-bar-wrap">
                    <div
                      className="category-bar"
                      style={{
                        width: `${(total / netExpenses) * 100}%`,
                        background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="category-name">{name}</span>
                  <span className="category-amount">{formatAmount(total)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Income by Category — only in My Categories mode */}
      {categoryType === 'user' && (
        <div className="rollup-section" style={{ marginBottom: '16px' }}>
          <h3>Income by Category</h3>
          <div className="category-list">
            {incomeCategories.length === 0 && (
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                No income transactions categorised yet. Use the 4 income categories: {INCOME_CATEGORIES.join(', ')}.
              </p>
            )}
            {incomeCategories.map(([cat, data], i) => (
              <div key={cat} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(data.total / totalIncome) * 100}%`,
                      background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    }}
                  />
                </div>
                <span className="category-name">{cat}</span>
                <span className="category-count">{data.count} txns</span>
                <span className="category-amount">{formatAmount(data.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Internal Transfers section */}
      {internalTransfers.length > 0 && (
        <div className="transfers-section">
          <button
            className="transfers-toggle"
            onClick={() => setShowTransfers((v) => !v)}
          >
            {showTransfers ? '▾' : '▸'} Internal Transfers ({internalTransfers.length})
          </button>
          {showTransfers && (
            <table className="transfers-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {internalTransfers
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
