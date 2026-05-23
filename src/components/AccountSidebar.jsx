function AccountSidebar({ accounts, selectedAccountId, onSelectAccount }) {
  // Group accounts by institution
  const byInstitution = accounts.reduce((groups, account) => {
    const key = account.institution_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(account);
    return groups;
  }, {});

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Accounts</h2>
      </div>

      <nav className="account-list">
        <button
          className={`account-item rollup ${selectedAccountId === 'all' ? 'active' : ''}`}
          onClick={() => onSelectAccount('all')}
        >
          <span className="account-name">All Accounts</span>
          <span className="account-tag">Rollup</span>
        </button>

        {Object.entries(byInstitution).map(([institution, accts]) => (
          <div key={institution} className="institution-group">
            <div className="institution-name">{institution}</div>
            {accts.map((account) => (
              <button
                key={account.account_id}
                className={`account-item ${selectedAccountId === account.account_id ? 'active' : ''}`}
                onClick={() => onSelectAccount(account.account_id)}
              >
                <span className="account-name">{account.name}</span>
                <span className="account-mask">••{account.mask}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="connect-btn">+ Connect Bank</button>
      </div>
    </aside>
  );
}

export default AccountSidebar;
