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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCategories, setShowCategories] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState(() => {
    return localStorage.getItem('budget_last_refreshed') || null;
  });

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

  const handleConnected = () => {
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      saveRefreshTime();
    }, 4000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/refresh?t=${Date.now()}`);
      setTimeout(() => {
        setRefreshKey((k) => k + 1);
        setRefreshing(false);
        saveRefreshTime();
      }, 4000);
    } catch (err) {
      console.error('Refresh error:', err);
      setRefreshing(false);
    }
  };

  const handleAddCategory = (name) => {
    setCategories((prev) => [...prev, name]);
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const ts = Date.now();
        const [accountsRes, transactionsRes, categoriesRes] = await Promise.all([
          fetch(`/api/accounts?t=${ts}`),
          fetch(`/api/transactions?t=${ts}`),
          fetch(`/api/categories?t=${ts}`),
        ]);

        if (!accountsRes.ok) throw new Error('Failed to fetch accounts');
        if (!transactionsRes.ok) throw new Error('Failed to fetch transactions');

        const accountsData = await accountsRes.json();
        const transactionsData = await transactionsRes.json();
        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];

        setAccounts(accountsData);
        setTransactions(transactionsData);
        setCategories(categoriesData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [refreshKey]);

  // Deduplicate transactions
  const seen = new Set();
  const uniqueTransactions = transactions.filter((t) => {
    if (seen.has(t.transaction_id)) return false;
    seen.add(t.transaction_id);
    return true;
  });

  // Derive available months from transactions
  const availableMonths = [...new Set(
    uniqueTransactions
      .map((t) => t.date?.slice(0, 7))
      .filter(Boolean)
  )].sort().reverse();

  // Filter by account
  const accountFiltered =
    selectedAccountId === 'all'
      ? uniqueTransactions
      : uniqueTransactions.filter((t) => t.account_id === selectedAccountId);

  // Filter by month
  const monthFiltered =
    selectedMonth === 'all'
      ? accountFiltered
      : accountFiltered.filter((t) => t.date?.startsWith(selectedMonth));

  const selectedAccount = accounts.find((a) => a.account_id === selectedAccountId);

  const monthLabel = (month) => {
    if (month === 'all') return 'All Time';
    const [year, m] = month.split('-');
    return new Date(year, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
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
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onConnected={handleConnected}
      />

      <main className="main-content">
        <header className="main-header">
          <h1>
            {selectedAccountId === 'all'
              ? 'All Accounts'
              : selectedAccount?.name || 'Account'}
          </h1>
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
            <div className="refresh-wrap">
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
          </div>
        </header>

        {selectedAccountId === 'all' ? (
          <RollupView transactions={monthFiltered} accounts={accounts} />
        ) : null}

        <TransactionList
          transactions={monthFiltered}
          accounts={accounts}
          categories={categories}
        />
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
