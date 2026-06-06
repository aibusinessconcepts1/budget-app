import { useState, useMemo, useRef, useCallback } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtWeekHeader(fridayStr) {
  const d = parseLocalDate(fridayStr);
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

function fmtCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function generateWeeks(startFriday, weeksAhead = 12) {
  const weeks = [];
  let d = parseLocalDate(startFriday);
  const limit = new Date();
  limit.setDate(limit.getDate() + weeksAhead * 7);
  while (d <= limit) {
    weeks.push(localDate(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function weekRange(fridayStr) {
  const fri = parseLocalDate(fridayStr);
  const sat = new Date(fri);
  sat.setDate(fri.getDate() - 6);
  return { start: localDate(sat), end: fridayStr };
}

const SECTION_LABELS = {
  income:      'Income',
  credit_card: 'Credit Cards',
  expense:     'Expenses',
  transfer:    'Transfers',
};

const SECTION_ORDER = ['income', 'credit_card', 'expense', 'transfer'];

function matchesKeyword(txn, keyword) {
  if (!keyword) return false;
  const kws = keyword.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean);
  const haystack = [
    txn.merchant_name || '',
    txn.category || '',
    txn.user_category || '',
  ].join(' ').toUpperCase();
  return kws.some((k) => haystack.includes(k));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WeeklyCashFlow({
  transactions,
  accounts,
  cfRows,
  cfData,
  onSaveCell,
  onLockWeek,
  onSaveConfig,
  onAddRow,
  onDeleteRow,
  onReorderRows,
}) {
  // Config (derived from _config rows)
  const config = useMemo(() => {
    const cfg = {};
    (cfRows || []).filter((r) => r.section === '_config').forEach((r) => {
      cfg[r.row_id] = r.label;
    });
    return {
      openingBalance: parseFloat(cfg['_cfg_opening_balance']) || 8745,
      openingDate:    cfg['_cfg_opening_date']    || '2026-05-01',
      threshold:      parseFloat(cfg['_cfg_threshold']) || 1000,
    };
  }, [cfRows]);

  const [localThreshold, setLocalThreshold] = useState('');
  const threshold = localThreshold !== '' ? parseFloat(localThreshold) || 0 : config.threshold;

  // Active (non-config) rows, grouped by section
  const activeRows = useMemo(() =>
    (cfRows || [])
      .filter((r) => r.active && !r.section.startsWith('_'))
      .sort((a, b) => a.sort_order - b.sort_order),
  [cfRows]);

  const rowsBySection = useMemo(() => {
    const groups = {};
    SECTION_ORDER.forEach((s) => { groups[s] = []; });
    activeRows.forEach((r) => {
      if (!groups[r.section]) groups[r.section] = [];
      groups[r.section].push(r);
    });
    return groups;
  }, [activeRows]);

  // Locked weeks set
  const lockedWeeks = useMemo(() => {
    const s = new Set();
    (cfData || []).filter((d) => d.row_id === '_LOCKED' && d.amount === 1).forEach((d) => s.add(d.week_ending));
    return s;
  }, [cfData]);

  // Stored cell values: { week_ending: { row_id: amount } }
  const storedValues = useMemo(() => {
    const map = {};
    (cfData || []).filter((d) => !d.row_id.startsWith('_')).forEach((d) => {
      if (!map[d.week_ending]) map[d.week_ending] = {};
      map[d.week_ending][d.row_id] = d.amount;
    });
    return map;
  }, [cfData]);

  // Find base account (Premier Checking by name)
  const baseAccount = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    return accounts.find((a) => {
      const name = (a.official_name || a.name || '').toLowerCase();
      return name.includes('premier') || name.includes('checking');
    }) || null;
  }, [accounts]);

  // Auto-fill from transactions per week per row
  const autoValues = useMemo(() => {
    if (!baseAccount || !transactions || transactions.length === 0) return {};
    const baseTxns = transactions.filter((t) => t.account_id === baseAccount.account_id);
    const map = {};
    const weeks = generateWeeks(config.openingDate);
    weeks.forEach((week) => {
      const { start, end } = weekRange(week);
      const weekTxns = baseTxns.filter((t) => t.date >= start && t.date <= end);
      map[week] = {};
      activeRows.forEach((row) => {
        if (!row.keyword) return;
        let total = 0;
        weekTxns.forEach((t) => {
          if (!matchesKeyword(t, row.keyword)) return;
          if (row.section === 'income') {
            // Income = negative Plaid amounts (money coming IN to checking)
            if (t.amount < 0) total += Math.abs(t.amount);
          } else {
            // Expenses/CC/Transfers = positive Plaid amounts (money going OUT)
            if (t.amount > 0) total += t.amount;
          }
        });
        if (total > 0) map[week][row.row_id] = Math.round(total * 100) / 100;
      });
    });
    return map;
  }, [baseAccount, transactions, activeRows, config.openingDate]);

  const weeks = useMemo(() => generateWeeks(config.openingDate), [config.openingDate]);

  // Get cell value: stored wins over auto
  const getCellValue = useCallback((week, rowId) => {
    if (storedValues[week]?.[rowId] != null) return storedValues[week][rowId];
    if (autoValues[week]?.[rowId] != null) return autoValues[week][rowId];
    return null;
  }, [storedValues, autoValues]);

  const isAutoFilled = useCallback((week, rowId) => {
    return storedValues[week]?.[rowId] == null && autoValues[week]?.[rowId] != null;
  }, [storedValues, autoValues]);

  // Compute weekly totals and running balances
  const weekCalc = useMemo(() => {
    const result = {};
    let runningBalance = config.openingBalance;
    weeks.forEach((week) => {
      let incomeTotal = 0, ccTotal = 0, expenseTotal = 0, transferTotal = 0;
      const startBal = runningBalance;
      activeRows.forEach((row) => {
        const val = getCellValue(week, row.row_id) || 0;
        if (row.section === 'income')      incomeTotal   += val;
        if (row.section === 'credit_card') ccTotal       += val;
        if (row.section === 'expense')     expenseTotal  += val;
        if (row.section === 'transfer')    transferTotal += val;
      });
      const endBal = startBal + incomeTotal - ccTotal - expenseTotal - transferTotal;
      result[week] = { startBal, incomeTotal, ccTotal, expenseTotal, transferTotal, endBal };
      runningBalance = endBal;
    });
    return result;
  }, [weeks, activeRows, getCellValue, config.openingBalance]);

  // Editing state
  const [editing, setEditing] = useState(null); // { week, rowId }
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  // Add row UI
  const [addingRow, setAddingRow] = useState(null); // section
  const [newLabel, setNewLabel] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  // Drag-to-reorder within section
  const [dragRowId, setDragRowId] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);

  // Reconciliation panel
  const [reconWeek, setReconWeek] = useState(null);

  const startEdit = (week, rowId, currentVal) => {
    if (lockedWeeks.has(week)) return;
    setEditing({ week, rowId });
    setEditVal(currentVal != null ? String(currentVal) : '');
  };

  const cancelEdit = () => { setEditing(null); setEditVal(''); };

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const amount = parseFloat(editVal) || 0;
      await onSaveCell(editing.week, editing.rowId, amount, 'manual');
    } finally {
      setSaving(false);
      setEditing(null);
      setEditVal('');
    }
  };

  const handleLock = async (week) => {
    const isLocked = lockedWeeks.has(week);
    await onLockWeek(week, !isLocked);
  };

  const handleSaveThreshold = async () => {
    const val = parseFloat(localThreshold) || 0;
    await onSaveConfig('_cfg_threshold', String(val));
  };

  const handleAddRow = async (section) => {
    if (!newLabel.trim()) return;
    const rowId = `custom_${section}_${Date.now()}`;
    const maxOrder = Math.max(0, ...(rowsBySection[section] || []).map((r) => r.sort_order));
    await onAddRow(rowId, newLabel.trim(), section, maxOrder + 1, newKeyword.trim());
    setNewLabel(''); setNewKeyword(''); setAddingRow(null);
  };

  const handleDrop = async (targetRowId, section) => {
    if (!dragRowId || dragRowId === targetRowId) { setDragRowId(null); setDragOverRowId(null); return; }
    const sectionRows = [...(rowsBySection[section] || [])];
    const fromIdx = sectionRows.findIndex((r) => r.row_id === dragRowId);
    const toIdx   = sectionRows.findIndex((r) => r.row_id === targetRowId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...sectionRows];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updates = reordered.map((r, i) => ({ row_id: r.row_id, sort_order: r.sort_order < 10 ? i + 1 : (Math.floor(r.sort_order / 10) * 10) + i }));
    // Recalculate orders cleanly
    const baseOrder = sectionRows[0]?.sort_order || 0;
    const cleanUpdates = reordered.map((r, i) => ({ row_id: r.row_id, sort_order: baseOrder + i }));
    await onReorderRows(cleanUpdates);
    setDragRowId(null); setDragOverRowId(null);
  };

  // Reconciliation: transactions for the selected week on base account
  const reconTxns = useMemo(() => {
    if (!reconWeek || !baseAccount) return [];
    const { start, end } = weekRange(reconWeek);
    return (transactions || [])
      .filter((t) => t.account_id === baseAccount.account_id && t.date >= start && t.date <= end)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reconWeek, baseAccount, transactions]);

  // For each recon txn, find which cash flow row (if any) it matched
  const reconMatched = useMemo(() => {
    if (!reconWeek) return new Map();
    const matched = new Map();
    reconTxns.forEach((t) => {
      const row = activeRows.find((r) => r.keyword && matchesKeyword(t, r.keyword));
      matched.set(t.transaction_id, row ? row.label : null);
    });
    return matched;
  }, [reconTxns, activeRows, reconWeek]);

  if (!baseAccount) {
    return (
      <div className="cf-no-account">
        <p>No checking account found. Make sure a Plaid-connected account has "Premier" or "Checking" in its name.</p>
      </div>
    );
  }

  const today = localDate(new Date());

  return (
    <div className="cf-wrap">
      {/* Controls bar */}
      <div className="cf-controls">
        <span className="cf-account-label">Based on: <strong>{baseAccount.official_name || baseAccount.name}</strong></span>
        <div className="cf-threshold-wrap">
          <span className="cf-threshold-label">Low balance warning below</span>
          <input
            className="cf-threshold-input"
            type="number"
            placeholder={String(config.threshold)}
            value={localThreshold}
            onChange={(e) => setLocalThreshold(e.target.value)}
            onBlur={handleSaveThreshold}
          />
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="cf-table-wrap">
        <table className="cf-table">
          <thead>
            <tr className="cf-head-row">
              <th className="cf-label-col cf-head-label">Week Ending →</th>
              {weeks.map((week) => {
                const isPast = week < today;
                const isCurrent = week >= today;
                const isLocked = lockedWeeks.has(week);
                return (
                  <th key={week} className={`cf-week-col ${isLocked ? 'cf-locked' : ''} ${isCurrent && !isLocked ? 'cf-current-week' : ''}`}>
                    <div className="cf-week-header">
                      <button
                        className="cf-recon-btn"
                        onClick={() => setReconWeek(week === reconWeek ? null : week)}
                        title="View transactions for this week"
                      >
                        {fmtWeekHeader(week)}
                      </button>
                      <button
                        className={`cf-lock-btn ${isLocked ? 'cf-locked-btn' : ''}`}
                        onClick={() => handleLock(week)}
                        title={isLocked ? 'Unlock this week' : 'Lock this week'}
                      >
                        {isLocked ? '🔒' : '🔓'}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Starting balance row */}
            <tr className="cf-balance-row cf-start-row">
              <td className="cf-label-col"><span className="cf-row-label cf-balance-label">Starting Balance</span></td>
              {weeks.map((week) => (
                <td key={week} className="cf-cell cf-balance-cell">
                  {fmtCurrency(weekCalc[week]?.startBal ?? 0)}
                </td>
              ))}
            </tr>
          </thead>

          <tbody>
            {SECTION_ORDER.map((section) => {
              const sRows = rowsBySection[section] || [];
              const sectionTotalKey = section === 'income' ? 'incomeTotal' : section === 'credit_card' ? 'ccTotal' : section === 'expense' ? 'expenseTotal' : 'transferTotal';

              return [
                /* Section header */
                <tr key={`sec_${section}`} className="cf-section-header-row">
                  <td className="cf-label-col cf-section-title" colSpan={weeks.length + 1}>
                    {SECTION_LABELS[section]}
                  </td>
                </tr>,

                /* Data rows */
                ...sRows.map((row) => (
                  <tr
                    key={row.row_id}
                    className={`cf-data-row ${dragOverRowId === row.row_id ? 'cf-drag-over' : ''} ${dragRowId === row.row_id ? 'cf-dragging' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverRowId(row.row_id); }}
                    onDrop={() => handleDrop(row.row_id, section)}
                  >
                    <td className="cf-label-col">
                      <div className="cf-row-label-wrap">
                        <span
                          className="cf-drag-handle"
                          draggable
                          onDragStart={() => setDragRowId(row.row_id)}
                          onDragEnd={() => { setDragRowId(null); setDragOverRowId(null); }}
                        >⠿</span>
                        <span className="cf-row-label">{row.label}</span>
                        <button
                          className="cf-delete-row-btn"
                          onClick={() => onDeleteRow(row.row_id)}
                          title="Remove row"
                        >×</button>
                      </div>
                    </td>
                    {weeks.map((week) => {
                      const isLocked = lockedWeeks.has(week);
                      const val = getCellValue(week, row.row_id);
                      const isEditing = editing?.week === week && editing?.rowId === row.row_id;
                      const isAuto = isAutoFilled(week, row.row_id);

                      if (isEditing) {
                        return (
                          <td key={week} className="cf-cell cf-editing-cell">
                            <div className="cf-edit-row">
                              <input
                                className="cf-edit-input"
                                type="number"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                autoFocus
                                disabled={saving}
                              />
                              <button className="cf-edit-save" onClick={saveEdit} disabled={saving}>✓</button>
                              <button className="cf-edit-cancel" onClick={cancelEdit}>✕</button>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={week}
                          className={`cf-cell ${isLocked ? 'cf-cell-locked' : 'cf-cell-editable'} ${isAuto ? 'cf-auto-filled' : ''} ${val ? 'cf-has-value' : 'cf-empty'}`}
                          onClick={() => !isLocked && startEdit(week, row.row_id, val)}
                          title={isLocked ? 'Week is locked' : isAuto ? 'Auto-filled from transactions — click to override' : 'Click to edit'}
                        >
                          {val != null ? fmtCurrency(val) : ''}
                        </td>
                      );
                    })}
                  </tr>
                )),

                /* Section total */
                <tr key={`total_${section}`} className="cf-section-total-row">
                  <td className="cf-label-col cf-total-label">
                    Total {SECTION_LABELS[section]}
                  </td>
                  {weeks.map((week) => (
                    <td key={week} className="cf-cell cf-total-cell">
                      {fmtCurrency(weekCalc[week]?.[sectionTotalKey] ?? 0)}
                    </td>
                  ))}
                </tr>,

                /* Add row button */
                <tr key={`add_${section}`} className="cf-add-row-tr">
                  <td className="cf-label-col" colSpan={weeks.length + 1}>
                    {addingRow === section ? (
                      <div className="cf-add-row-form">
                        <input
                          className="cf-add-input"
                          placeholder="Row label"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                        />
                        <input
                          className="cf-add-input"
                          placeholder="Match keyword(s), comma-separated"
                          value={newKeyword}
                          onChange={(e) => setNewKeyword(e.target.value)}
                        />
                        <button className="cf-add-save-btn" onClick={() => handleAddRow(section)}>Add</button>
                        <button className="cf-add-cancel-btn" onClick={() => { setAddingRow(null); setNewLabel(''); setNewKeyword(''); }}>Cancel</button>
                      </div>
                    ) : (
                      <button className="cf-add-row-btn" onClick={() => setAddingRow(section)}>
                        + Add row
                      </button>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>

          {/* Ending balance footer */}
          <tfoot>
            <tr className="cf-balance-row cf-end-row">
              <td className="cf-label-col"><span className="cf-row-label cf-balance-label">Ending Balance</span></td>
              {weeks.map((week) => {
                const endBal = weekCalc[week]?.endBal ?? 0;
                const warn = endBal < threshold;
                return (
                  <td key={week} className={`cf-cell cf-balance-cell cf-end-balance ${warn ? 'cf-balance-warn' : 'cf-balance-ok'}`}>
                    {fmtCurrency(endBal)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Reconciliation side panel */}
      {reconWeek && (
        <div className="cf-recon-panel">
          <div className="cf-recon-header">
            <span className="cf-recon-title">Week of {fmtWeekHeader(reconWeek)}</span>
            <button className="cf-recon-close" onClick={() => setReconWeek(null)}>✕</button>
          </div>
          <div className="cf-recon-summary">
            <span>{reconTxns.length} transactions</span>
            <span className={reconTxns.filter((t) => !reconMatched.get(t.transaction_id)).length > 0 ? 'cf-recon-gap' : 'cf-recon-ok'}>
              {reconTxns.filter((t) => !reconMatched.get(t.transaction_id)).length} unmatched
            </span>
          </div>
          <div className="cf-recon-list">
            {reconTxns.length === 0 && (
              <p className="cf-recon-empty">No transactions found for this account in this week.</p>
            )}
            {reconTxns.map((t) => {
              const matchedRow = reconMatched.get(t.transaction_id);
              return (
                <div key={t.transaction_id} className={`cf-recon-txn ${matchedRow ? 'cf-recon-matched' : 'cf-recon-unmatched'}`}>
                  <div className="cf-recon-txn-top">
                    <span className="cf-recon-merchant">{t.merchant_name || t.category || '—'}</span>
                    <span className={`cf-recon-amount ${t.amount < 0 ? 'cf-recon-income' : ''}`}>
                      {t.amount < 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(t.amount))}
                    </span>
                  </div>
                  <div className="cf-recon-txn-meta">
                    <span className="cf-recon-date">{t.date}</span>
                    {matchedRow
                      ? <span className="cf-recon-row-match">✓ {matchedRow}</span>
                      : <span className="cf-recon-no-match">Not in cash flow</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
