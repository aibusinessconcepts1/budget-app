import { useState, useEffect } from 'react';
import AccountSidebar from './components/AccountSidebar';
import TransactionList from './components/TransactionList';
import RollupView from './components/RollupView';
import './App.css';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');

  useEffect(() => {
    async function fetchData() {
      try {
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
  }, []);

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
      />

      <main className="main-content">
        <header className="main-header">
          <h1>
            {selectedAccountId === 'all'
              ? 'All Accounts'
              : selectedAccount?.name || 'Account'}
          </h1>
          <span className="month-label">May 2026</span>
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
