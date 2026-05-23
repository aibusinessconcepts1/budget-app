function TransactionList({ transactions, accounts }) {
  const getAccountName = (accountId) => {
    const account = accounts.find((a) => a.account_id === accountId);
    return account ? account.name : accountId;
  };

  // Filter out transfers for display
  const filtered = transactions.filter((t) => t.category !== 'Transfer');

  const totalSpend = filtered.reduce((sum, t) => sum + t.amount, 0);

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
        <span className="total-spend">${totalSpend.toFixed(2)} spent</span>
      </div>

      <table className="txn-table">
        <colgroup>
          <col style={{ width: '110px' }} />
          <col />
          <col style={{ width: '160px' }} />
          <col style={{ width: '160px' }} />
          <col style={{ width: '100px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th>Account</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((txn) => (
            <tr key={txn.transaction_id} className={txn.pending ? 'pending' : ''}>
              <td className="date">{txn.date}</td>
              <td className="merchant">
                {txn.merchant_name}
                {txn.pending && <span className="pending-badge">Pending</span>}
              </td>
              <td>
                <span className="category-tag">{txn.category}</span>
              </td>
              <td className="account-col">{getAccountName(txn.account_id)}</td>
              <td className="right amount">${txn.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TransactionList;
