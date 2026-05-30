import { useState, useEffect } from 'react';
import AccountSidebar from './components/AccountSidebar';
import TransactionList from './components/TransactionList';
import RollupView from './components/RollupView';
import CategoriesPanel from './components/CategoriesPanel';
import './App.css';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [balances, setBalances] = useState({});
  const [balancesUpdatedAt, setBalancesUpdatedAt] = useState(null);
  const [manualAccounts, setManualAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // selectedView: 'dashboard' | 'transactions' | <account_id>
  const [selectedView, setSelectedView] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCategories, setShowCategories] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState(() => {
    return localStorage.getItem('budget_last_refreshed') || null;
  });

  // Default refresh range: last 30 days
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  };
  const [refreshStart, setRefreshStart] = useState(thirtyDaysAgoStr);
  const [refreshEnd, setRefreshEnd] = useState(todayStr);

  const saveRefreshTime = () => {
    const now = new Date().toISOString();
    localStorage.setItem('budget_last_refreshed', now);
    setLastRefreshed(now);
  };

  const formatRefreshTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const time = d.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Refreshed today at ${time}`;
    const date = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    return `Refreshed ${date} at ${time}`;
  };

  const fetchBalances = async () => {
    try {
      const res = await fetch(`/api/balances?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setBalances(data);
        setBalancesUpdatedAt(new Date());
      }
    } catch (err) {
      console.error('Balance fetch error:', err);
    }
  };

  const handleConnected = () => {
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      saveRefreshTime();
      fetchBalances();
    }, 4000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/refresh?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: refreshStart, end_date: refreshEnd }),
      });
      setTimeout(async () => {
        setRefreshKey((k) => k + 1);
        setRefreshing(false);
        saveRefreshTime();
        await fetchBalances();
      }, 4000);
    } catch (err) {
      console.error('Refresh error:', err);
      setRefreshing(false);
    }
  };

  const handleAddCategory = (name) => {
    setCategories((prev) => [...prev, name]);
  };

  const handleAddManualAccount = async (name, balance, type) => {
    try {
      const res = await fetch('/api/manual-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, balance: parseFloat(balance) || 0, type }),
      });
      const data = await res.json();
      if (data.ok) {
        setManualAccounts((prev) => [
          ...prev,
          { account_id: data.account_id, name, balance: parseFloat(balance) || 0, type, last_updated: new Date().toISOString().slice(0, 10) },
        ]);
      }
    } catch (err) {
      console.error('Add manual account error:', err);
    }
  };

  const handleUpdateManualBalance = async (account_id, balance) => {
    try {
      await fetch('/api/manual-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id, balance: parseFloat(balance) || 0 }),
      });
      setManualAccounts((prev) =>
        prev.map((a) =>
          a.account_id === account_id
            ? { ...a, balance: parseFloat(balance) || 0, last_updated: new Date().toISOString().slice(0, 10) }
            : a
        )
      );
    } catch (err) {
      console.error('Update balance error:', err);
    }
  };

  const handleDeleteManualAccount = async (account_id) => {
    try {
      await fetch('/api/manual-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id }),
      });
      setManualAccounts((prev) => prev.filter((a) => a.account_id !== account_id));
    } catch (err) {
      console.error('Delete manual account error:', err);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const ts = Date.now();
        const [accountsRes, transactionsRes, categoriesRes, manualRes] = await Promise.all([
          fetch(`/api/accounts?t=${ts}`),
          fetch(`/api/transactions?t=${ts}`),
          fetch(`/api/categories?t=${ts}`),
          fetch(`/api/manual-accounts?t=${ts}`),
        ]);

        if (!accountsRes.ok) throw new Error('Failed to fetch accounts');
        if (!transactionsRes.ok) throw new Error('Failed to fetch transactions');

        const accountsData = await accountsRes.json();
        const transactionsData = await transactionsRes.json();
        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];
        const manualData = manualRes.ok ? await manualRes.json() : [];

        setAccounts(accountsData);
        setTransactions(transactionsData);
        setCategories(categoriesData);
        setManualAccounts(manualData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    fetchBalances();
  }, [refreshKey]);

  // Deduplicate transactions
  const seen = new Set();
  const uniqueTransactions = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  // Remove pending transactions superseded by settled ones
  const supersededIds = new Set(
    uniqueTransactions.map((t) => t.pending_transaction_id).filter(Boolean)
  );
  const settledTxns = uniqueTransactions.filter((t) => !t.pending);
  uniqueTransactions
    .filter((t) => t.pending && !supersededIds.has(t.transaction_id))
    .forEach((pending) => {
      const pendingDate = new Date(pending.date);
      const hasSettled = settledTxns.some((s) => {
        if (s.account_id !== pending.account_id) return false;
        if (Math.abs(s.amount - pending.amount) > 0.01) return false;
        const daysDiff = Math.abs(new Date(s.date) - pendingDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
      });
      if (hasSettled) supersededIds.add(pending.transaction_id);
    });
  const activeTransactions = uniqueTransactions.filter(
    (t) => !supersededIds.has(t.transaction_id)
  );

  // Derive available months
  const availableMonths = [...new Set(
    activeTransactions.map((t) => t.date?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  // Filter by account
  const accountFiltered =
    selectedView === 'dashboard' || selectedView === 'transactions'
      ? activeTransactions
      : activeTransactions.filter((t) => t.account_id === selectedView);

  // Filter by month
  const monthFiltered =
    selectedMonth === 'all'
      ? accountFiltered
      : accountFiltered.filter((t) => t.date?.startsWith(selectedMonth));

  const selectedAccount = accounts.find((a) => a.account_id === selectedView);

  const monthLabel = (month) => {
    if (month === 'all') return 'All Time';
    const [year, m] = month.split('-');
    return new Date(year, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const pageTitle = () => {
    if (selectedView === 'dashboard') return 'Dashboard';
    if (selectedView === 'transactions') return 'All Transactions';
    return selectedAccount?.official_name || selectedAccount?.name || 'Account';
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <p>Loading your accounts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <p style={{ color: '#c0392b' }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <AccountSidebar
        accounts={accounts}
        balances={balances}
        balancesUpdatedAt={balancesUpdatedAt}
        manualAccounts={manualAccounts}
        selectedView={selectedView}
        onSelectView={setSelectedView}
        onConnected={handleConnected}
        onAddManualAccount={handleAddManualAccount}
        onUpdateManualBalance={handleUpdateManualBalance}
        onDeleteManualAccount={handleDeleteManualAccount}
      />

      <main className="main-content">
        <header className="main-header">
          <h1>{pageTitle()}</h1>
          <div className="header-actions">
            <select
              className="month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="all">All Time</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button
              className="categories-btn"
              onClick={() => setShowCategories(true)}
            >
              ☰ Categories
            </button>
            {selectedView === 'transactions' && (
              <div className="refresh-wrap">
                <span className="refresh-range-label">Fetch</span>
                <input
                  type="date"
                  className="refresh-date-input"
                  value={refreshStart}
                  onChange={(e) => setRefreshStart(e.target.value)}
                  disabled={refreshing}
                />
                <span className="refresh-range-label">to</span>
                <input
                  type="date"
                  className="refresh-date-input"
                  value={refreshEnd}
                  onChange={(e) => setRefreshEnd(e.target.value)}
                  disabled={refreshing}
                />
                {lastRefreshed && (
                  <span className="refresh-timestamp">{formatRefreshTime(lastRefreshed)}</span>
                )}
                <button
                  className="refresh-btn"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>
            )}
          </div>
        </header>

        {selectedView === 'dashboard' && (
          <RollupView transactions={monthFiltered} accounts={accounts} />
        )}

        {selectedView !== 'dashboard' && (
          <TransactionList
            transactions={monthFiltered}
            accounts={accounts}
            categories={categories}
          />
        )}
      </main>

      {showCategories && (
        <CategoriesPanel
          categories={categories}
          onAdd={handleAddCategory}
          onClose={() => setShowCategories(false)}
        />
      )}
    </div>
  );
}

export default App;
