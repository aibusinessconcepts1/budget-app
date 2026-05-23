import { useState, useEffect } from 'react';
import AccountSidebar from './components/AccountSidebar';
import TransactionList from './components/TransactionList';
import RollupView from './components/RollupView';
import './App.css';

const FETCH_TRANSACTIONS_WEBHOOK = 'https://hook.us1.make.com/qo20stbnt4iz38r1nu78y4oxlgu3plog';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleConnected = () => {
    setTimeout(() => setRefreshKey((k) => k + 1), 4000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(FETCH_TRANSACTIONS_WEBHOOK);
      // Wait for Make to process then reload data
      setTimeout(() => {
        setRefreshKey((k) => k + 1);
        setRefreshing(false);
      }, 4000);
    } catch (err) {
      console.error('Refresh error:', err);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [accountsRes, transactionsRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/transactions'),
        ]);

        if (!accountsRes.ok) throw new Error('Failed to fetch accounts');
        if (!transactionsRes.ok) throw new Error('Failed to fetch transactions');

        const accountsData = await accountsRes.json();
        const transactionsData = await transactionsRes.json();

        setAccounts(accountsData);
        setTransactions(transactionsData);
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
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh Transactions'}
          </button>
        </header>

        {selectedAccountId === 'all' ? (
          <RollupView transactions={transactions} accounts={accounts} />
        ) : null}

        <TransactionList
          transactions={visibleTransactions}
          accounts={accounts}
        />
      </main>
    </div>
  );
}

export default App;
