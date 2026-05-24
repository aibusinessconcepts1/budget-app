function RollupView({ transactions, accounts }) {
  // Deduplicate by transaction_id
  const seen = new Set();
  const unique = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  // Filter out transfers to avoid double-counting
  const filtered = unique.filter((t) => t.category !== 'Transfer');

  const totalSpend = filtered.reduce((sum, t) => sum + t.amount, 0);

  // Spend by category — use user_category if set, fall back to Plaid category
  const byCategory = filtered.reduce((groups, txn) => {
    const cat = txn.user_category || txn.category || 'Other';
    if (!groups[cat]) groups[cat] = { total: 0, count: 0 };
    groups[cat].total += txn.amount;
    groups[cat].count += 1;
    return groups;
  }, {});

  const categories = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

  // Spend by account
  const byAccount = filtered.reduce((groups, txn) => {
    const account = accounts.find((a) => a.account_id === txn.account_id);
    const key = account ? account.name : txn.account_id;
    if (!groups[key]) groups[key] = 0;
    groups[key] += txn.amount;
    return groups;
  }, {});

  const CATEGORY_COLORS = {
    'Food and Drink': '#f97316',
    Shopping: '#8b5cf6',
    Entertainment: '#06b6d4',
    Travel: '#10b981',
    Other: '#6b7280',
  };

  return (
    <div className="rollup-view">
      <div className="rollup-header">
        <div className="rollup-stat">
          <span className="stat-label">Total Spend</span>
          <span className="stat-value">${totalSpend.toFixed(2)}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Transactions</span>
          <span className="stat-value">{filtered.length}</span>
        </div>
        <div className="rollup-stat">
          <span className="stat-label">Accounts</span>
          <span className="stat-value">{accounts.length}</span>
        </div>
      </div>

      <div className="rollup-sections">
        <div className="rollup-section">
          <h3>Spend by Category</h3>
          <div className="category-list">
            {categories.map(([cat, data]) => (
              <div key={cat} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(data.total / totalSpend) * 100}%`,
                      background: CATEGORY_COLORS[cat] || '#6b7280',
                    }}
                  />
                </div>
                <span className="category-name">{cat}</span>
                <span className="category-count">{data.count} txns</span>
                <span className="category-amount">${data.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rollup-section">
          <h3>Spend by Account</h3>
          <div className="category-list">
            {Object.entries(byAccount).map(([name, total]) => (
              <div key={name} className="category-row">
                <div className="category-bar-wrap">
                  <div
                    className="category-bar"
                    style={{
                      width: `${(total / totalSpend) * 100}%`,
                      background: '#aa3bff',
                    }}
                  />
                </div>
                <span className="category-name">{name}</span>
                <span className="category-amount">${total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RollupView;
