import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { NAV_ITEMS } from '../../app/navigation';
import { usePreferences } from '../../app/preferences';
import { interpolate } from '../../lib/format';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Búsqueda real sobre los módulos de la plataforma (combobox accesible).
 * La búsqueda sobre datos de negocio llegará cuando existan datos (Fase 3).
 */
export function GlobalSearch() {
  const { t } = usePreferences();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const listId = useId();

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return NAV_ITEMS.filter((item) => normalize(t.nav[item.id]).includes(q)).slice(0, 6);
  }, [query, t]);

  const go = (path: string) => {
    navigate(path);
    setQuery('');
    setOpen(false);
  };

  const showPanel = open && query.trim().length > 0;
  const activeItem = results[index];

  return (
    <div className="rc-search rc-popover-anchor">
      <Search size={16} className="rc-search__icon" aria-hidden="true" />
      <input
        className="rc-search__input"
        type="search"
        role="combobox"
        aria-label={t.topbar.searchLabel}
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeItem ? `${listId}-${activeItem.id}` : undefined}
        placeholder={t.topbar.search}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          if (e.key === 'Enter' && activeItem) go(activeItem.path);
          if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {showPanel && (
        <div className="rc-popover rc-search__results rc-glass rc-glass--strong">
          <ul id={listId} role="listbox" aria-label={t.topbar.searchLabel}>
            {results.map((item, i) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={i === index}
                  className="rc-search__option"
                  onMouseDown={(e) => { e.preventDefault(); go(item.path); }}
                  onMouseEnter={() => setIndex(i)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {t.nav[item.id]}
                </li>
              );
            })}
          </ul>
          {results.length === 0 && <p className="rc-search__empty">{interpolate(t.topbar.searchNoResults, { q: query.trim() })}</p>}
          <p className="rc-popover__hint" style={{ padding: '8px 12px 4px' }}>{t.topbar.searchHint}</p>
        </div>
      )}
    </div>
  );
}
