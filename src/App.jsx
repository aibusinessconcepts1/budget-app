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

  const handleConnected = () => {
    setTimeout(() => setRefreshKey((k) => k + 1), 4000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/refresh?t=${Date.now()}`);
      setTimeout(() => {
        setRefreshKey((k) => k + 1);
        setRefreshing(false);
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

  const selectedAccount = accounts.find((a) => a.account_id === selectedAccountId);

  const visibleTransactions =
    selectedAccountId === 'all'
      ? transactions
      : transactions.filter((t) => t.account_id === selectedAccountId);

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
        <p style={{ color: '#ef4444' }}>Error: {error}</p>
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
            <button
              className="categories-btn"
              onClick={() => setShowCategories(true)}
            >
              ☰ Categories
            </button>
            <button
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </header>

        {selectedAccountId === 'all' ? (
          <RollupView transactions={transactions} accounts={accounts} />
        ) : null}

        <TransactionList
          transactions={visibleTransactions}
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
