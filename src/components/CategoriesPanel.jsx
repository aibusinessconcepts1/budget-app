import { useState } from 'react';

function CategoriesPanel({ categories, onAdd, onClose }) {
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const name = newCategory.trim();
    if (!name) return;
    setSaving(true);
    try {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_name: name }),
      });
      onAdd(name);
      setNewCategory('');
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="categories-panel">
      <div className="categories-panel-header">
        <h2>Categories</h2>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="categories-add">
        <input
          className="category-input"
          placeholder="New category name..."
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          className="category-add-btn"
          onClick={handleAdd}
          disabled={saving || !newCategory.trim()}
        >
          {saving ? '...' : 'Add'}
        </button>
      </div>

      <div className="categories-list">
        {categories.length === 0 && (
          <p className="categories-empty">No categories yet. Add one above.</p>
        )}
        {categories.map((cat) => (
          <div key={cat} className="category-item">
            <span>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CategoriesPanel;
