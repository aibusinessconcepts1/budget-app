import { useState } from 'react';
import { formatAmount } from '../utils';

function RollupView({ transactions, accounts }) {
  const [categoryType, setCategoryType] = useState('user');

  // Filter out transfers to avoid double-counting
  const filtered = transactions.filter((t) => t.category !== 'Transfer');

  const totalSpend = filtered.reduce((sum, t) => sum + t.amount, 0);

  // Spend by category — toggle between user category and Plaid category
  const byCategory = filtered.reduce((groups, txn) => {
    const cat =
      categoryType === 'user'
        ? txn.user_category || txn.category || 'Uncategorised'
        : txn.category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0 };
    groups[cat].total += txn.amount;
    groups[cat].count += 1;
    return groups;
  }, {});

  const categories = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

  // Spend by account
  const byAccount = filtered.reduce((groups, txn) => {
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
          <span className="stat-label">Total Spend</span>
          <span className="stat-value">{formatAmount(totalSpend)}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Transactions</span>
          <span className="stat-value">{filtered.length.toLocaleString()}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Accounts</span>
          <span className="stat-value">{accounts.length}</span>
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
            {categories.map(([cat, data], i) => (
              <div key={cat} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(data.total / totalSpend) * 100}%`,
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
            {Object.entries(byAccount).map(([name, total], i) => (
              <div key={name} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(total / totalSpend) * 100}%`,
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
    </div>
  );
}

export default RollupView;
