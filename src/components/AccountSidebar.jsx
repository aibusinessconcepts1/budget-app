import { useState, useMemo } from 'react';
import ConnectButton from './ConnectButton';

function formatBalance(amount, type) {
  if (amount === null || amount === undefined) return null;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
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
  return isToday
    ? `Today ${time}`
    : date.toLocaleDateString('default', { month: 'short', day: 'numeric' }) + ' ' + time;
}

const isLiability = (type) => ['credit', 'mortgage', 'loan'].includes(type);

function AccountSidebar({
  accounts, balances, balancesUpdatedAt,
  manualAccounts, selectedView, onSelectView, onConnected,
  onAddManualAccount, onUpdateManualBalance, onDeleteManualAccount,
  onRemoveAccount,
}) {
  // ── Drag state ──
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  // ── Remove account confirmation ──
  const [confirmRemoveAccountId, setConfirmRemoveAccountId] = useState(null);
  const [orderIds, setOrderIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('budget_account_order') || '[]'); }
    catch { return []; }
  });

  // ── Add manual form ──
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newType, setNewType] = useState('savings');

  // ── Balance edit (manual accounts) ──
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const updatedLabel = formatUpdatedTime(balancesUpdatedAt);

  // ── Unified flat list ──
  const allItems = useMemo(() => [
    ...accounts.map((a) => ({
      ...a,
      source: 'plaid',
      display_name: a.official_name || a.name,
      subtitle: a.institution_name || '',
    })),
    ...manualAccounts.map((a) => ({
      ...a,
      source: 'manual',
      display_name: a.name,
      subtitle: a.type || '',
    })),
  ], [accounts, manualAccounts]);

  const orderedItems = useMemo(() => {
    if (orderIds.length === 0) return allItems;
    return [...allItems].sort((a, b) => {
      const ai = orderIds.indexOf(a.account_id);
      const bi = orderIds.indexOf(b.account_id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allItems, orderIds]);

  // ── Drag handlers ──
  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragId) setDragOverId(id);
  };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const items = [...orderedItems];
    const from = items.findIndex((a) => a.account_id === dragId);
    const to = items.findIndex((a) => a.account_id === targetId);
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    const ids = items.map((a) => a.account_id);
    setOrderIds(ids);
    localStorage.setItem('budget_account_order', JSON.stringify(ids));
    setDragId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  // ── Manual account actions ──
  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAddManualAccount(newName.trim(), newBalance, newType);
    setNewName(''); setNewBalance(''); setNewType('savings'); setAdding(false);
  };
  const startEdit = (acct) => { setEditingId(acct.account_id); setEditValue(String(acct.balance)); };
  const saveEdit = async (id) => { await onUpdateManualBalance(id, editValue); setEditingId(null); };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Finance Tracker</h2>
      </div>

      <nav className="account-list">
        {/* Navigation items */}
        <button
          className={`account-item nav-item ${selectedView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectView('dashboard')}
        >
          <span className="nav-icon">◈</span>
          <span className="account-name">Dashboard</span>
        </button>
        <button
          className={`account-item nav-item ${selectedView === 'transactions' ? 'active' : ''}`}
          onClick={() => onSelectView('transactions')}
        >
          <span className="nav-icon">≡</span>
          <span className="account-name">All Transactions</span>
        </button>
        <button
          className={`account-item nav-item ${selectedView === 'balance-history' ? 'active' : ''}`}
          onClick={() => onSelectView('balance-history')}
        >
          <span className="nav-icon">⊞</span>
          <span className="account-name">Month-End Balances</span>
        </button>

        <div className="sidebar-divider" />

        {/* Flat draggable account list */}
        {orderedItems.map((item) => {
          const isDragging = dragId === item.account_id;
          const isDragOver = dragOverId === item.account_id;

          if (item.source === 'plaid') {
            const bal = balances[item.account_id];
            const rawAmount = item.type === 'credit'
              ? bal?.current
              : (bal?.available ?? bal?.current);
            const displayBal = bal != null ? formatBalance(rawAmount, item.type) : null;

            return (
              <div
                key={item.account_id}
                className={`account-item-wrap ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => handleDragOver(e, item.account_id)}
                onDrop={(e) => handleDrop(e, item.account_id)}
              >
                <span
                  className="drag-handle"
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.account_id)}
                  onDragEnd={handleDragEnd}
                  title="Drag to reorder"
                >⠿</span>
                <button
                  className={`account-item account-item-inner-btn ${selectedView === item.account_id ? 'active' : ''}`}
                  onClick={() => onSelectView(item.account_id)}
                >
                  <div className="account-item-inner">
                    <span className="account-name">{item.display_name}</span>
                    <span className="account-subtitle">{item.subtitle}</span>
                    {displayBal !== null && updatedLabel && (
                      <span className="balance-updated">{updatedLabel}</span>
                    )}
                    {displayBal === null && (
                      <span className="account-mask">••{item.mask}</span>
                    )}
                  </div>
                  {displayBal !== null && (
                    <span className={`account-balance ${item.type === 'credit' ? 'balance-negative' : 'balance-positive'}`}>
                      {displayBal}
                    </span>
                  )}
                </button>
                {confirmRemoveAccountId === item.account_id ? (
                  <div className="plaid-confirm-remove">
                    <span className="plaid-confirm-label">Remove?</span>
                    <button
                      className="plaid-confirm-yes"
                      onClick={() => {
                        onRemoveAccount(item.account_id);
                        setConfirmRemoveAccountId(null);
                      }}
                    >Yes</button>
                    <button
                      className="plaid-confirm-no"
                      onClick={() => setConfirmRemoveAccountId(null)}
                    >No</button>
                  </div>
                ) : (
                  <button
                    className="plaid-remove-btn"
                    onClick={() => setConfirmRemoveAccountId(item.account_id)}
                    title="Remove this account"
                  >×</button>
                )}
              </div>
            );
          }

          // Manual account
          return (
            <div
              key={item.account_id}
              className={`account-item-wrap ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => handleDragOver(e, item.account_id)}
              onDrop={(e) => handleDrop(e, item.account_id)}
            >
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => handleDragStart(e, item.account_id)}
                onDragEnd={handleDragEnd}
                title="Drag to reorder"
              >⠿</span>
              <div className={`account-item account-item-inner-btn ${selectedView === item.account_id ? 'active' : ''}`}
                style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="account-item-inner"
                  onClick={() => onSelectView(item.account_id)}
                  style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                >
                  <span className="account-name">{item.display_name}</span>
                  <span className="account-subtitle">{item.subtitle}</span>
                  {item.last_updated && (
                    <span className="balance-updated">Updated {item.last_updated}</span>
                  )}
                </div>
                {editingId === item.account_id ? (
                  <div className="manual-balance-edit">
                    <input
                      className="manual-balance-input"
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(item.account_id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button className="manual-balance-save" onClick={() => saveEdit(item.account_id)}>✓</button>
                    <button className="manual-balance-cancel" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <div className="manual-balance-wrap">
                    <span
                      className={`account-balance ${isLiability(item.type) ? 'balance-negative' : 'balance-positive'}`}
                      onClick={() => startEdit(item)}
                      title="Click to update balance"
                    >
                      {formatBalance(item.balance, item.type) ?? '—'}
                    </span>
                    <button
                      className="manual-delete-btn"
                      onClick={() => onDeleteManualAccount(item.account_id)}
                      title="Remove"
                    >×</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add manual account */}
        <div className="manual-add-section">
          {!adding ? (
            <button className="manual-add-trigger" onClick={() => setAdding(true)}>
              + Add manual account
            </button>
          ) : (
            <div className="manual-add-form">
              <input className="manual-input" placeholder="Account name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="manual-input" placeholder="Balance" type="number" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} />
              <select className="manual-input" value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="savings">Savings</option>
                <option value="checking">Checking</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="retirement">Retirement</option>
                <option value="mortgage">Mortgage</option>
                <option value="loan">Loan</option>
                <option value="other">Other</option>
              </select>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="manual-save-btn" style={{ flex: 1 }} onClick={handleAdd}>Add</button>
                <button className="manual-cancel-btn" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <ConnectButton onConnected={onConnected} />
      </div>
    </aside>
  );
}

export default AccountSidebar;
