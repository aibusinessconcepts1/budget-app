import { useState } from 'react';
import { formatAmount } from '../utils';

function TransactionList({ transactions, accounts, categories }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [userCategories, setUserCategories] = useState({});

  const getAccountName = (accountId) => {
    const account = accounts.find((a) => a.account_id === accountId);
    return account ? (account.official_name || account.name) : accountId;
  };

  // Deduplicate by transaction_id
  const seen = new Set();
  const unique = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  // Filter out loan payments (credit card payments) and sort newest first
  const filtered = unique
    .filter((t) => {
      const cat = (t.category || '').toLowerCase();
      return !cat.includes('loan');
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalSpend = filtered.reduce((sum, t) => sum + t.amount, 0);

  const startEdit = (txn) => {
    setEditingId(txn.transaction_id);
    setEditValue(txn.merchant_name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (txn) => {
    setSaving(true);
    try {
      await fetch('/api/update-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: txn.transaction_id,
          merchant_name: editValue,
        }),
      });
      txn.merchant_name = editValue;
    } catch (err) {
      console.error('Save error:', err);
    }
    setSaving(false);
    setEditingId(null);
  };

  const handleCategoryChange = async (txn, value) => {
    setUserCategories((prev) => ({ ...prev, [txn.transaction_id]: value }));
    try {
      await fetch('/api/update-user-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: txn.transaction_id,
          user_category: value,
        }),
      });
    } catch (err) {
      console.error('Category save error:', err);
    }
  };

  const getUserCategory = (txn) => {
    return userCategories[txn.transaction_id] ?? txn.user_category ?? '';
  };

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <p>No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="transaction-list">
      <div className="list-summary">
        <span>{filtered.length} transactions</span>
        <span className="total-spend">{formatAmount(totalSpend)} spent</span>
      </div>

      <table className="txn-table">
        <thead>
          <tr>
            <th style={{ width: '90px' }}>Date</th>
            <th style={{ width: '150px' }}>Merchant</th>
            <th style={{ width: '120px' }}>Plaid Category</th>
            <th style={{ width: '200px' }}>My Category</th>
            <th style={{ width: '130px' }}>Account</th>
            <th style={{ width: '90px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((txn) => (
            <tr key={txn.transaction_id} className={txn.pending ? 'pending' : ''}>
              <td className="date">{txn.date}</td>
              <td className="merchant">
                {editingId === txn.transaction_id ? (
                  <div className="edit-wrap">
                    <input
                      className="edit-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(txn);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <button className="edit-save" onClick={() => saveEdit(txn)} disabled={saving}>
                      {saving ? '...' : '✓'}
                    </button>
                    <button className="edit-cancel" onClick={cancelEdit}>✕</button>
                  </div>
                ) : (
                  <span className="merchant-name" onClick={() => startEdit(txn)} title="Click to edit">
                    {txn.merchant_name}
                    {txn.pending && <span className="pending-badge">Pending</span>}
                  </span>
                )}
              </td>
              <td>
                <span className="category-tag">{txn.category}</span>
              </td>
              <td>
                <select
                  className="category-select"
                  value={getUserCategory(txn)}
                  onChange={(e) => handleCategoryChange(txn, e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {[...categories].sort((a, b) => a.localeCompare(b)).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </td>
              <td className="account-col">{getAccountName(txn.account_id)}</td>
              <td className="right amount" style={{ textAlign: 'right' }}>{formatAmount(txn.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TransactionList;
