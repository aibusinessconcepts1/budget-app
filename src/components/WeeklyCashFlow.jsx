import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';

// ── Date helpers ─────────────────────────────────────────────────────────────

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

// Generate all Fridays from openingDate to 6 months past today
function generateWeeks(openingDate) {
  const weeks = [];
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  // Advance end to the next Friday
  end.setDate(end.getDate() + (5 - end.getDay() + 7) % 7);

  let d = parseLocalDate(openingDate);
  while (d <= end) {
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

// Find the Friday in weeks closest to exactly 1 calendar month after fridayStr
function findMonthAhead(fridayStr, weeks) {
  const d = parseLocalDate(fridayStr);
  const target = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const targetTime = target.getTime();
  let closest = null, closestDiff = Infinity;
  for (const w of weeks) {
    if (w <= fridayStr) continue;
    const diff = Math.abs(parseLocalDate(w).getTime() - targetTime);
    if (diff < closestDiff) { closestDiff = diff; closest = w; }
    else break; // weeks are sorted — once diff grows, stop
  }
  return closest;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SECTION_LABELS = {
  income:      'Income',
  credit_card: 'Credit Cards',
  expense:     'Expenses',
  transfer:    'Transfers',
};
const SECTION_ORDER = ['income', 'credit_card', 'expense', 'transfer'];

function matchesKeyword(txn, keyword) {
  if (!keyword) return false;
  const kws = keyword.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
  const hay = [txn.merchant_name||'', txn.category||'', txn.user_category||''].join(' ').toUpperCase();
  return kws.some(k => hay.includes(k));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WeeklyCashFlow({
  transactions, accounts, cfRows, cfData,
  onSaveCell, onClearCell, onLockWeek, onSaveConfig, onAddRow, onDeleteRow, onReorderRows, onUpdateRow,
}) {
  // ── Config from special rows ──────────────────────────────────────────────
  const config = useMemo(() => {
    const cfg = {};
    (cfRows||[]).filter(r => r.section === '_config').forEach(r => { cfg[r.row_id] = r.label; });
    return {
      openingBalance: parseFloat(cfg['_cfg_opening_balance']) || 9040,
      openingDate:    cfg['_cfg_opening_date']    || '2026-05-01',
      threshold:      parseFloat(cfg['_cfg_threshold']) || 1000,
    };
  }, [cfRows]);

  const [localThreshold, setLocalThreshold] = useState('');
  const threshold = localThreshold !== '' ? (parseFloat(localThreshold)||0) : config.threshold;

  // ── Rows grouped by section ───────────────────────────────────────────────
  const activeRows = useMemo(() =>
    (cfRows||[]).filter(r => r.active && !r.section.startsWith('_')).sort((a,b) => a.sort_order - b.sort_order),
  [cfRows]);

  const rowsBySection = useMemo(() => {
    const g = {}; SECTION_ORDER.forEach(s => { g[s] = []; });
    activeRows.forEach(r => { if (!g[r.section]) g[r.section]=[]; g[r.section].push(r); });
    return g;
  }, [activeRows]);

  // ── Weeks ─────────────────────────────────────────────────────────────────
  const weeks = useMemo(() => generateWeeks(config.openingDate), [config.openingDate]);

  // ── Locked weeks ──────────────────────────────────────────────────────────
  const lockedWeeks = useMemo(() => {
    const s = new Set();
    (cfData||[]).filter(d => d.row_id === '_LOCKED' && d.amount === 1).forEach(d => s.add(d.week_ending));
    return s;
  }, [cfData]);

  // ── Stored values: { week: { rowId: amount } } ────────────────────────────
  const storedValues = useMemo(() => {
    const m = {};
    (cfData||[]).filter(d => !d.row_id.startsWith('_')).forEach(d => {
      if (!m[d.week_ending]) m[d.week_ending] = {};
      m[d.week_ending][d.row_id] = d.amount;
    });
    return m;
  }, [cfData]);

  // ── Base account (Premier Checking) ──────────────────────────────────────
  const baseAccount = useMemo(() => {
    if (!accounts?.length) return null;
    return accounts.find(a => {
      const n = (a.official_name||a.name||'').toLowerCase();
      return n.includes('premier') || n.includes('checking');
    }) || null;
  }, [accounts]);

  // ── Auto-fill from transactions ───────────────────────────────────────────
  const autoValues = useMemo(() => {
    if (!baseAccount || !transactions?.length) return {};
    const baseTxns = transactions.filter(t => t.account_id === baseAccount.account_id);
    const map = {};
    weeks.forEach(week => {
      const { start, end } = weekRange(week);
      const wTxns = baseTxns.filter(t => t.date >= start && t.date <= end);
      map[week] = {};
      activeRows.forEach(row => {
        if (!row.keyword) return;
        let total = 0;
        wTxns.forEach(t => {
          if (!matchesKeyword(t, row.keyword)) return;
          if (row.section === 'income') { if (t.amount < 0) total += Math.abs(t.amount); }
          else { if (t.amount > 0) total += t.amount; }
        });
        if (total > 0) map[week][row.row_id] = Math.round(total * 100) / 100;
      });
    });
    return map;
  }, [baseAccount, transactions, activeRows, weeks]);

  const getCellValue = useCallback((week, rowId) => {
    if (storedValues[week]?.[rowId] != null) return storedValues[week][rowId];
    if (autoValues[week]?.[rowId]  != null) return autoValues[week][rowId];
    return null;
  }, [storedValues, autoValues]);

  const isAutoFilled = useCallback((week, rowId) =>
    storedValues[week]?.[rowId] == null && autoValues[week]?.[rowId] != null,
  [storedValues, autoValues]);

  // ── Weekly balance calculation ────────────────────────────────────────────
  const weekCalc = useMemo(() => {
    const res = {};
    let running = config.openingBalance;
    weeks.forEach(week => {
      let inc=0, cc=0, exp=0, trn=0;
      const start = running;
      activeRows.forEach(row => {
        const v = getCellValue(week, row.row_id) || 0;
        if (row.section === 'income')      inc += v;
        if (row.section === 'credit_card') cc  += v;
        if (row.section === 'expense')     exp += v;
        if (row.section === 'transfer')    trn += v;
      });
      const end = start + inc - cc - exp - trn;
      res[week] = { startBal: start, incomeTotal: inc, ccTotal: cc, expenseTotal: exp, transferTotal: trn, endBal: end };
      running = end;
    });
    return res;
  }, [weeks, activeRows, getCellValue, config.openingBalance]);

  // ── Sticky header height measurement ─────────────────────────────────────
  const headerRowRef = useRef(null);
  const [headerH, setHeaderH] = useState(52);
  useLayoutEffect(() => {
    if (headerRowRef.current) setHeaderH(headerRowRef.current.offsetHeight);
  });

  // ── Cell editing ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(null); // { week, rowId }
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (week, rowId, currentVal) => {
    if (lockedWeeks.has(week) && rowId !== '_OPENING') return;
    setEditing({ week, rowId });
    setEditVal(currentVal != null ? String(Math.abs(currentVal)) : '');
  };
  const cancelEdit = () => { setEditing(null); setEditVal(''); };
  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const amount = parseFloat(editVal);
      if (editing.rowId === '_OPENING') {
        await onSaveConfig('_cfg_opening_balance', String(isNaN(amount) ? 0 : amount));
      } else if (!editVal.trim() || isNaN(amount) || amount === 0) {
        // Empty or zero → remove the stored override, leave the cell blank
        await onClearCell(editing.week, editing.rowId);
      } else {
        await onSaveCell(editing.week, editing.rowId, amount, 'manual');
      }
    } finally { setSaving(false); setEditing(null); setEditVal(''); }
  };

  // ── Cell drag-to-copy ─────────────────────────────────────────────────────
  const [dragCell, setDragCell] = useState(null); // { rowId, value }
  const [dragOverCell, setDragOverCell] = useState(null); // { week, rowId }

  const handleCellDragStart = (e, week, rowId, value) => {
    setDragCell({ sourceWeek: week, rowId, value });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(value || 0));
  };
  const handleCellDragOver = (e, week, rowId) => {
    if (!dragCell || dragCell.rowId !== rowId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ week, rowId });
  };
  const handleCellDrop = async (e, week, rowId) => {
    e.preventDefault();
    const src = dragCell;
    setDragCell(null); setDragOverCell(null);
    if (!src || src.rowId !== rowId || lockedWeeks.has(week) || week === src.sourceWeek) return;
    // Save value to target week
    await onSaveCell(week, rowId, src.value || 0, 'manual');
    // Clear the source week (move, not copy)
    await onClearCell(src.sourceWeek, rowId);
  };
  const handleCellDragEnd = () => { setDragCell(null); setDragOverCell(null); };

  // ── Context menu (right-click → copy to next month) ──────────────────────
  const [contextMenu, setContextMenu] = useState(null); // { x, y, week, rowId, value }
  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleCellRightClick = (e, week, rowId, value) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, week, rowId, value });
  };

  const copyToNextMonth = async () => {
    if (!contextMenu) return;
    const { week, rowId, value } = contextMenu;
    if (value == null) { setContextMenu(null); return; }
    const targetWeek = findMonthAhead(week, weeks);
    if (targetWeek && !lockedWeeks.has(targetWeek)) {
      await onSaveCell(targetWeek, rowId, value, 'manual');
    }
    setContextMenu(null);
  };

  // ── Keyword popup ─────────────────────────────────────────────────────────
  const [kwModal, setKwModal] = useState(null); // row object
  const [kwInput, setKwInput] = useState('');

  const saveKeyword = async (row) => {
    const current = (row.keyword||'').split(',').map(k=>k.trim()).filter(Boolean);
    const adding = kwInput.split(',').map(k=>k.trim()).filter(Boolean);
    if (!adding.length) return;
    const merged = [...new Set([...current, ...adding])].join(',');
    await onUpdateRow(row.row_id, merged);
    setKwInput('');
  };

  // ── Row drag-to-reorder ───────────────────────────────────────────────────
  const [dragRowId, setDragRowId] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);

  const handleRowDrop = async (targetRowId, section) => {
    if (!dragRowId || dragRowId === targetRowId) { setDragRowId(null); setDragOverRowId(null); return; }
    const sRows = [...(rowsBySection[section]||[])];
    const fromIdx = sRows.findIndex(r => r.row_id === dragRowId);
    const toIdx   = sRows.findIndex(r => r.row_id === targetRowId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...sRows];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const base = sRows[0]?.sort_order || 0;
    const updates = reordered.map((r, i) => ({ row_id: r.row_id, sort_order: base + i }));
    await onReorderRows(updates);
    setDragRowId(null); setDragOverRowId(null);
  };

  // ── Reconciliation panel ──────────────────────────────────────────────────
  const [reconWeek, setReconWeek] = useState(null);
  const reconTxns = useMemo(() => {
    if (!reconWeek || !baseAccount) return [];
    const { start, end } = weekRange(reconWeek);
    return (transactions||[])
      .filter(t => t.account_id === baseAccount.account_id && t.date >= start && t.date <= end)
      .sort((a,b) => b.date.localeCompare(a.date));
  }, [reconWeek, baseAccount, transactions]);

  const reconMatched = useMemo(() => {
    const m = new Map();
    reconTxns.forEach(t => {
      const row = activeRows.find(r => r.keyword && matchesKeyword(t, r.keyword));
      m.set(t.transaction_id, row ? row.label : null);
    });
    return m;
  }, [reconTxns, activeRows]);

  // ── Add row UI ────────────────────────────────────────────────────────────
  const [addingRow, setAddingRow] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newKw, setNewKw] = useState('');

  const handleAddRow = async (section) => {
    if (!newLabel.trim()) return;
    const rowId = `custom_${section}_${Date.now()}`;
    const maxOrder = Math.max(0, ...(rowsBySection[section]||[]).map(r => r.sort_order));
    await onAddRow(rowId, newLabel.trim(), section, maxOrder + 1, newKw.trim());
    setNewLabel(''); setNewKw(''); setAddingRow(null);
  };

  const handleSaveThreshold = async () => {
    const v = parseFloat(localThreshold) || 0;
    await onSaveConfig('_cfg_threshold', String(v));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!baseAccount) {
    return (
      <div className="cf-no-account">
        <p>No checking account found. Make sure a Plaid-connected account has "Premier" or "Checking" in its name.</p>
      </div>
    );
  }

  const today = localDate(new Date());
  const sectionTotalKey = { income: 'incomeTotal', credit_card: 'ccTotal', expense: 'expenseTotal', transfer: 'transferTotal' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cf-wrap">
      {/* Controls bar */}
      <div className="cf-controls">
        <span className="cf-account-label">Based on: <strong>{baseAccount.official_name || baseAccount.name}</strong></span>
        <div className="cf-threshold-wrap">
          <span className="cf-threshold-label">Low balance warning below</span>
          <input
            className="cf-threshold-input" type="number"
            placeholder={String(config.threshold)}
            value={localThreshold} onChange={e => setLocalThreshold(e.target.value)}
            onBlur={handleSaveThreshold}
          />
        </div>
        <span className="cf-hint">Right-click any value to copy it 1 month forward · Drag a value across weeks · Drag ⠿ to reorder rows</span>
      </div>

      <div className="cf-table-wrap">
        <table className="cf-table">
          <thead>
            {/* Row 1: week date headers */}
            <tr className="cf-head-row" ref={headerRowRef}>
              <th className="cf-label-col cf-head-label">Week ending →</th>
              {weeks.map(week => {
                const isLocked = lockedWeeks.has(week);
                const isCurrent = week >= today;
                return (
                  <th key={week} className={`cf-week-col${isLocked ? ' cf-locked' : ''}${isCurrent && !isLocked ? ' cf-current-week' : ''}`}>
                    <div className="cf-week-header">
                      <button className="cf-recon-btn" onClick={() => setReconWeek(week === reconWeek ? null : week)} title="View transactions">
                        {fmtWeekHeader(week)}
                      </button>
                      <button className={`cf-lock-btn${isLocked ? ' cf-locked-btn' : ''}`} onClick={() => onLockWeek(week, !isLocked)} title={isLocked ? 'Unlock' : 'Lock this week'}>
                        {isLocked ? '🔒' : '🔓'}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Row 2: starting balance (sticky below header) */}
            <tr className="cf-balance-row cf-start-row" style={{ top: headerH }}>
              <td className="cf-label-col cf-balance-label-cell">
                <span className="cf-balance-label">Starting Balance</span>
              </td>
              {weeks.map((week, wi) => {
                const isFirst = wi === 0;
                const isEditing = editing?.week === week && editing?.rowId === '_OPENING';
                if (isEditing) {
                  return (
                    <td key={week} className="cf-cell cf-balance-cell cf-editing-cell">
                      <div className="cf-edit-row">
                        <input className="cf-edit-input" type="number" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          autoFocus disabled={saving} />
                        <button className="cf-edit-save" onClick={saveEdit} disabled={saving}>✓</button>
                        <button className="cf-edit-cancel" onClick={cancelEdit}>✕</button>
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={week}
                    className={`cf-cell cf-balance-cell${isFirst ? ' cf-cell-editable' : ''}`}
                    onClick={() => isFirst && startEdit(week, '_OPENING', weekCalc[week]?.startBal)}
                    title={isFirst ? 'Click to edit opening balance' : undefined}
                  >
                    {fmtCurrency(weekCalc[week]?.startBal ?? 0)}
                  </td>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {SECTION_ORDER.map(section => {
              const sRows = rowsBySection[section] || [];
              return [
                <tr key={`sec_${section}`} className="cf-section-header-row">
                  <td className="cf-label-col cf-section-title" colSpan={weeks.length + 1}>
                    {SECTION_LABELS[section]}
                  </td>
                </tr>,

                ...sRows.map(row => (
                  <tr key={row.row_id}
                    className={`cf-data-row${dragOverRowId === row.row_id ? ' cf-drag-over' : ''}${dragRowId === row.row_id ? ' cf-dragging' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOverRowId(row.row_id); }}
                    onDrop={() => handleRowDrop(row.row_id, section)}
                  >
                    <td className="cf-label-col">
                      <div className="cf-row-label-wrap">
                        <span className="cf-drag-handle" draggable
                          onDragStart={() => setDragRowId(row.row_id)}
                          onDragEnd={() => { setDragRowId(null); setDragOverRowId(null); }}>⠿</span>

                        {/* Keyword popup toggle */}
                        {kwModal?.row_id === row.row_id ? (
                          <div className="cf-kw-popup">
                            <div className="cf-kw-popup-head">
                              <span className="cf-kw-row-name">{row.label}</span>
                              <button className="cf-kw-close" onClick={() => { setKwModal(null); setKwInput(''); }}>✕</button>
                            </div>
                            <div className="cf-kw-chips">
                              {(row.keyword||'').split(',').map(k => k.trim()).filter(Boolean).map(k => (
                                <span key={k} className="cf-kw-chip">{k}</span>
                              ))}
                              {!(row.keyword) && <span className="cf-kw-none">No keywords yet</span>}
                            </div>
                            <div className="cf-kw-add">
                              <input className="cf-kw-input" placeholder="Add keyword(s), comma-separated"
                                value={kwInput} onChange={e => setKwInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveKeyword(row); if (e.key === 'Escape') { setKwModal(null); setKwInput(''); }}}
                              />
                              <button className="cf-kw-save" onClick={() => saveKeyword(row)}>Add</button>
                            </div>
                          </div>
                        ) : (
                          <button className="cf-row-label-btn" onClick={() => { setKwModal(row); setKwInput(''); }} title="View/edit keywords">
                            {row.label}
                          </button>
                        )}

                        <button className="cf-delete-row-btn" onClick={() => onDeleteRow(row.row_id)} title="Remove row">×</button>
                      </div>
                    </td>

                    {weeks.map(week => {
                      const isLocked  = lockedWeeks.has(week);
                      const val       = getCellValue(week, row.row_id);
                      const isEditing = editing?.week === week && editing?.rowId === row.row_id;
                      const isAuto    = isAutoFilled(week, row.row_id);
                      const isDragTarget = dragOverCell?.week === week && dragOverCell?.rowId === row.row_id && dragCell?.rowId === row.row_id;

                      if (isEditing) {
                        return (
                          <td key={week} className="cf-cell cf-editing-cell">
                            <div className="cf-edit-row">
                              <input className="cf-edit-input" type="number" value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                autoFocus disabled={saving} />
                              <button className="cf-edit-save" onClick={saveEdit} disabled={saving}>✓</button>
                              <button className="cf-edit-cancel" onClick={cancelEdit}>✕</button>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={week}
                          className={`cf-cell${isLocked ? ' cf-cell-locked' : ' cf-cell-editable'}${isAuto ? ' cf-auto-filled' : ''}${val!=null ? ' cf-has-value' : ' cf-empty'}${isDragTarget ? ' cf-drag-target' : ''}`}
                          draggable={!isLocked && val != null}
                          onClick={() => !isLocked && startEdit(week, row.row_id, val)}
                          onContextMenu={e => !isLocked && handleCellRightClick(e, week, row.row_id, val)}
                          onDragStart={e => !isLocked && handleCellDragStart(e, week, row.row_id, val)}
                          onDragOver={e => handleCellDragOver(e, week, row.row_id)}
                          onDrop={e => handleCellDrop(e, week, row.row_id)}
                          onDragEnd={handleCellDragEnd}
                          title={isLocked ? 'Week is locked' : isAuto ? 'Auto-filled — right-click for options' : 'Click to edit · Right-click to copy forward'}
                        >
                          {val != null ? fmtCurrency(val) : ''}
                        </td>
                      );
                    })}
                  </tr>
                )),

                <tr key={`total_${section}`} className="cf-section-total-row">
                  <td className="cf-label-col cf-total-label">Total {SECTION_LABELS[section]}</td>
                  {weeks.map(week => (
                    <td key={week} className="cf-cell cf-total-cell">
                      {fmtCurrency(weekCalc[week]?.[sectionTotalKey[section]] ?? 0)}
                    </td>
                  ))}
                </tr>,

                <tr key={`add_${section}`} className="cf-add-row-tr">
                  <td className="cf-label-col" colSpan={weeks.length + 1}>
                    {addingRow === section ? (
                      <div className="cf-add-row-form">
                        <input className="cf-add-input" placeholder="Row label" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
                        <input className="cf-add-input" placeholder="Keywords (comma-separated)" value={newKw} onChange={e => setNewKw(e.target.value)} />
                        <button className="cf-add-save-btn" onClick={() => handleAddRow(section)}>Add</button>
                        <button className="cf-add-cancel-btn" onClick={() => { setAddingRow(null); setNewLabel(''); setNewKw(''); }}>Cancel</button>
                      </div>
                    ) : (
                      <button className="cf-add-row-btn" onClick={() => setAddingRow(section)}>+ Add row</button>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>

          <tfoot>
            <tr className="cf-balance-row cf-end-row">
              <td className="cf-label-col cf-balance-label-cell">
                <span className="cf-balance-label">Ending Balance</span>
              </td>
              {weeks.map(week => {
                const endBal = weekCalc[week]?.endBal ?? 0;
                const warn = endBal < threshold;
                return (
                  <td key={week} className={`cf-cell cf-balance-cell cf-end-balance${warn ? ' cf-balance-warn' : ' cf-balance-ok'}`}>
                    {fmtCurrency(endBal)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div className="cf-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}>
          {(() => {
            const target = findMonthAhead(contextMenu.week, weeks);
            return (
              <>
                <div className="cf-context-item" onClick={copyToNextMonth} title={target ? `Copy to week ending ${fmtWeekHeader(target)}` : 'No future week available'}>
                  📅 Copy to {target ? fmtWeekHeader(target) : '(unavailable)'}
                </div>
                <div className="cf-context-item" onClick={() => { startEdit(contextMenu.week, contextMenu.rowId, contextMenu.value); setContextMenu(null); }}>
                  ✏️ Edit value
                </div>
                <div className="cf-context-separator" />
                <div className="cf-context-item cf-context-cancel" onClick={() => setContextMenu(null)}>Cancel</div>
              </>
            );
          })()}
        </div>
      )}

      {/* Reconciliation panel */}
      {reconWeek && (
        <div className="cf-recon-panel">
          <div className="cf-recon-header">
            <span className="cf-recon-title">Week ending {fmtWeekHeader(reconWeek)}</span>
            <button className="cf-recon-close" onClick={() => setReconWeek(null)}>✕</button>
          </div>
          <div className="cf-recon-summary">
            <span>{reconTxns.length} transactions</span>
            <span className={reconTxns.filter(t => !reconMatched.get(t.transaction_id)).length > 0 ? 'cf-recon-gap' : 'cf-recon-ok'}>
              {reconTxns.filter(t => !reconMatched.get(t.transaction_id)).length} unmatched
            </span>
          </div>
          <div className="cf-recon-list">
            {reconTxns.length === 0 && <p className="cf-recon-empty">No transactions for this account this week.</p>}
            {reconTxns.map(t => {
              const matched = reconMatched.get(t.transaction_id);
              return (
                <div key={t.transaction_id} className={`cf-recon-txn${matched ? ' cf-recon-matched' : ' cf-recon-unmatched'}`}>
                  <div className="cf-recon-txn-top">
                    <span className="cf-recon-merchant">{t.merchant_name || t.category || '—'}</span>
                    <span className={`cf-recon-amount${t.amount < 0 ? ' cf-recon-income' : ''}`}>
                      {t.amount < 0 ? '+' : ''}{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(Math.abs(t.amount))}
                    </span>
                  </div>
                  <div className="cf-recon-txn-meta">
                    <span className="cf-recon-date">{t.date}</span>
                    {matched ? <span className="cf-recon-row-match">✓ {matched}</span>
                             : <span className="cf-recon-no-match">Not in cash flow</span>}
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
