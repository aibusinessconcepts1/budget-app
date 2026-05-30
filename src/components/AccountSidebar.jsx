import { useState } from 'react';
import ConnectButton from './ConnectButton';

function formatBalance(amount, type) {
  if (amount === null || amount === undefined) return null;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  if (type === 'credit' && amount > 0) return `-${formatted}`;
  return formatted;
}

function formatUpdatedTime(date) {
  if (!date) return null;
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  const time = date.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today ${time}` : date.toLocaleDateString('default', { month: 'short', day: 'numeric' }) + ' ' + time;
}

function ManualAccountsSection({
  manualAccounts,
  selectedView,
  onSelectView,
  onAdd,
  onUpdateBalance,
  onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newType, setNewType] = useState('savings');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim(), newBalance, newType);
    setNewName('');
    setNewBalance('');
    setNewType('savings');
    setAdding(false);
  };

  const startEdit = (acct) => {
    setEditingId(acct.account_id);
    setEditValue(String(acct.balance));
  };

  const saveEdit = async (account_id) => {
    await onUpdateBalance(account_id, editValue);
    setEditingId(null);
  };

  const isLiability = (type) => ['credit', 'mortgage', 'loan'].includes(type);

  return (
    <div className="manual-accounts-section">
      <div className="manual-accounts-header">
        <span className="institution-name">Manual Accounts</span>
        <button className="manual-add-btn" onClick={() => setAdding((v) => !v)} title="Add account">
          {adding ? '✕' : '+'}
        </button>
      </div>

      {adding && (
        <div className="manual-add-form">
          <input
            className="manual-input"
            placeholder="Account name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="manual-input"
            placeholder="Balance"
            type="number"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
          />
          <select
            className="manual-input"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          >
            <option value="savings">Savings</option>
            <option value="checking">Checking</option>
            <option value="credit">Credit Card</option>
            <option value="investment">Investment</option>
            <option value="mortgage">Mortgage</option>
            <option value="loan">Loan</option>
            <option value="other">Other</option>
          </select>
          <button className="manual-save-btn" onClick={handleAdd}>Add</button>
        </div>
      )}

      {manualAccounts.map((acct) => (
        <div
          key={acct.account_id}
          className={`account-item manual-account-item ${selectedView === acct.account_id ? 'active' : ''}`}
        >
          <div className="account-item-inner" onClick={() => onSelectView(acct.account_id)} style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
            <span className="account-name">{acct.name}</span>
            {acct.last_updated && (
              <span className="balance-updated">Updated {acct.last_updated}</span>
            )}
          </div>

          {editingId === acct.account_id ? (
            <div className="manual-balance-edit">
              <input
                className="manual-balance-input"
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(acct.account_id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button className="manual-balance-save" onClick={() => saveEdit(acct.account_id)}>✓</button>
              <button className="manual-balance-cancel" onClick={() => setEditingId(null)}>✕</button>
            </div>
          ) : (
            <div className="manual-balance-wrap">
              <span
                className={`account-balance ${isLiability(acct.type) ? 'balance-negative' : 'balance-positive'}`}
                onClick={() => startEdit(acct)}
                title="Click to update balance"
              >
                {formatBalance(acct.balance, acct.type) ?? '—'}
              </span>
              <button
                className="manual-delete-btn"
                onClick={() => onDelete(acct.account_id)}
                title="Remove account"
              >×</button>
            </div>
          )}
        </div>
      ))}

      {manualAccounts.length === 0 && !adding && (
        <p className="manual-empty">No manual accounts. Click + to add.</p>
      )}
    </div>
  );
}

function AccountSidebar({
  accounts,
  balances,
  balancesUpdatedAt,
  manualAccounts,
  selectedView,
  onSelectView,
  onConnected,
  onAddManualAccount,
  onUpdateManualBalance,
  onDeleteManualAccount,
}) {
  const updatedLabel = formatUpdatedTime(balancesUpdatedAt);

  const byInstitution = accounts.reduce((groups, account) => {
    const key = account.institution_name || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(account);
    return groups;
  }, {});

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Finance Tracker</h2>
      </div>

      <nav className="account-list">
        {/* Dashboard */}
        <button
          className={`account-item nav-item ${selectedView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectView('dashboard')}
        >
          <span className="nav-icon">◈</span>
          <span className="account-name">Dashboard</span>
        </button>

        {/* All Transactions */}
        <button
          className={`account-item nav-item ${selectedView === 'transactions' ? 'active' : ''}`}
          onClick={() => onSelectView('transactions')}
        >
          <span className="nav-icon">≡</span>
          <span className="account-name">All Transactions</span>
        </button>

        <div className="sidebar-divider" />

        {/* Plaid accounts grouped by institution */}
        {Object.entries(byInstitution).map(([institution, accts]) => (
          <div key={institution} className="institution-group">
            <div className="institution-name">{institution}</div>
            {accts.map((account) => {
              const bal = balances[account.account_id];
              const rawAmount = account.type === 'credit'
                ? bal?.current
                : (bal?.available ?? bal?.current);
              const displayBal = bal ? formatBalance(rawAmount, account.type) : null;

              return (
                <button
                  key={account.account_id}
                  className={`account-item ${selectedView === account.account_id ? 'active' : ''}`}
                  onClick={() => onSelectView(account.account_id)}
                >
                  <div className="account-item-inner" style={{ flex: 1, minWidth: 0 }}>
                    <span className="account-name">{account.official_name || account.name}</span>
                    {displayBal !== null && updatedLabel && (
                      <span className="balance-updated">{updatedLabel}</span>
                    )}
                    {displayBal === null && (
                      <span className="account-mask">••{account.mask}</span>
                    )}
                  </div>
                  {displayBal !== null && (
                    <span className={`account-balance ${account.type === 'credit' ? 'balance-negative' : 'balance-positive'}`}>
                      {displayBal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        <div className="sidebar-divider" />

        {/* Manual accounts */}
        <ManualAccountsSection
          manualAccounts={manualAccounts}
          selectedView={selectedView}
          onSelectView={onSelectView}
          onAdd={onAddManualAccount}
          onUpdateBalance={onUpdateManualBalance}
          onDelete={onDeleteManualAccount}
        />
      </nav>

      <div className="sidebar-footer">
        <ConnectButton onConnected={onConnected} />
      </div>
    </aside>
  );
}

export default AccountSidebar;
