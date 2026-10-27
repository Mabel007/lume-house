import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { findCountry, searchCountries, countries, type Country } from '../config/countries';

type Props = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  required?: boolean;
  options?: readonly Country[];
};

export function CountryCombobox({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required = true,
  options = countries,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  // A pointer gesture is tracked in three explicit stages: pressed on an
  // option, released over that option, and cancelled. Focus departure decides
  // the outcome instead of suppressing it with a generic "interacting" flag.
  const pressed = useRef<string | null>(null);
  const released = useRef<string | null>(null);
  const cancelled = useRef(false);
  const lastValid = useRef(value);
  const listId = `${id}-listbox`;
  const hintId = hint ? `${id}-help` : undefined;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const selected = findCountry(value, options);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [search, setSearch] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const filtered = useMemo(() => searchCountries(search, options), [search, options]);
  const optionId = (index: number) => `${listId}-option-${index}`;

  const closeAndRestore = useCallback(() => {
    pressed.current = null;
    released.current = null;
    setOpen(false);
    setActiveIndex(-1);
    const committed = findCountry(value, options);
    if (committed) {
      setQuery(committed.name);
      setSearch(committed.name);
      setAnnouncement(`${committed.name} selected.`);
      return;
    }
    const restored = findCountry(lastValid.current, options);
    setQuery(restored?.name ?? '');
    setSearch(restored?.name ?? '');
    if (restored) {
      onChange(restored.code);
      setAnnouncement(`${restored.name} selected.`);
    }
  }, [value, options, onChange]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) closeAndRestore();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, closeAndRestore]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const option = document.getElementById(`${listId}-option-${activeIndex}`);
    if (option && typeof option.scrollIntoView === 'function')
      option.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, listId]);

  function openList() {
    cancelled.current = false;
    pressed.current = null;
    released.current = null;
    setOpen(true);
    setSearch('');
    const matches = searchCountries('', options);
    const selectedIndex = matches.findIndex((country) => country.code === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : matches.length ? 0 : -1);
    setAnnouncement(`${matches.length} countries available.`);
  }

  function commit(country: Country) {
    pressed.current = null;
    released.current = null;
    cancelled.current = false;
    lastValid.current = country.code;
    setQuery(country.name);
    setSearch(country.name);
    setOpen(false);
    setActiveIndex(-1);
    setAnnouncement(`${country.name} selected.`);
    onChange(country.code);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.currentTarget.value;
    setQuery(next);
    setSearch(next);
    setOpen(true);
    if (value) onChange('');
    const matches = searchCountries(next, options);
    setActiveIndex(matches.length ? 0 : -1);
    setAnnouncement(
      matches.length
        ? `${matches.length} ${matches.length === 1 ? 'country' : 'countries'} available.`
        : 'No countries match your search.',
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (!filtered.length) {
        setActiveIndex(-1);
        return;
      }
      setActiveIndex((current) =>
        event.key === 'ArrowDown'
          ? (current + 1) % filtered.length
          : current <= 0
            ? filtered.length - 1
            : current - 1,
      );
      return;
    }
    if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      const country = activeIndex >= 0 ? filtered[activeIndex] : undefined;
      if (country) commit(country);
      else if (filtered.length === 1) commit(filtered[0]);
      return;
    }
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      closeAndRestore();
    }
  }

  function handleBlur() {
    // A released option is a completed selection even if the browser sends the
    // blur before the click. Anything else is genuine focus departure.
    // If the pointer gesture was cancelled, focus departure always restores
    // the previous selection rather than committing a cancelled interaction.
    if (cancelled.current) {
      pressed.current = null;
      released.current = null;
      cancelled.current = false;
      closeAndRestore();
      onBlur?.();
      return;
    }
    const code = released.current;
    pressed.current = null;
    released.current = null;
    const selected = code ? findCountry(code, options) : undefined;
    if (selected) commit(selected);
    else closeAndRestore();
    onBlur?.();
  }

  const describedBy =
    [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className="country-field" ref={root}>
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <div className="country-control">
        <input
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-activedescendant={
            open && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          autoComplete="country-name"
          required={required}
          maxLength={120}
          value={query}
          onChange={handleChange}
          onFocus={(event: FocusEvent<HTMLInputElement>) => {
            openList();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!open) openList();
            if (selected && event.currentTarget.value === selected.name)
              event.currentTarget.select();
          }}
          onPointerDown={() => {
            cancelled.current = false;
            pressed.current = null;
            released.current = null;
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Start typing a country"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="country-listbox"
          hidden={!open}
          onScroll={() => {
            if (!pressed.current && !released.current) return;
            pressed.current = null;
            released.current = null;
            cancelled.current = true;
          }}
        >
          {filtered.map((country, index) => (
            <li
              key={country.code}
              id={optionId(index)}
              role="option"
              aria-selected={country.code === value}
              className={
                index === activeIndex
                  ? 'country-option country-option-active'
                  : 'country-option'
              }
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={() => {
                cancelled.current = false;
                pressed.current = country.code;
                released.current = null;
              }}
              onPointerUp={() => {
                if (pressed.current !== country.code) return;
                pressed.current = null;
                released.current = country.code;
              }}
              onPointerCancel={() => {
                pressed.current = null;
                released.current = null;
                cancelled.current = true;
                if (!root.current?.contains(document.activeElement)) closeAndRestore();
              }}
              onLostPointerCapture={() => {
                if (pressed.current !== country.code) return;
                pressed.current = null;
                released.current = null;
                cancelled.current = true;
              }}
              onClick={() => {
                if (cancelled.current) {
                  cancelled.current = false;
                  return;
                }
                commit(country);
              }}
            >
              {country.name}
            </li>
          ))}
        </ul>
      </div>
      {hint && <p id={hintId} className="small-note">{hint}</p>}
      {error && <p id={errorId} className="field-error">{error}</p>}
      {open && !filtered.length && (
        <p className="country-empty">No countries match your search.</p>
      )}
      <p id={statusId} className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
