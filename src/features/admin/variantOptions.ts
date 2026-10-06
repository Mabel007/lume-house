export type OptionRow = { id: number; name: string; value: string };

export function serializeOptions(rows: readonly OptionRow[]): Record<string, string> {
  if (rows.length > 8) throw new Error('Use at most eight options.');
  const entries: [string, string][] = [];
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim(); const value = row.value.trim();
    if (!name || name.length > 40 || !value || value.length > 100) throw new Error('Each option needs a name (up to 40 characters) and value (up to 100 characters).');
    if (names.has(name)) throw new Error('Option names must be unique.');
    names.add(name); entries.push([name, value]);
  }
  const options = Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (new TextEncoder().encode(JSON.stringify(options)).length > 2000) throw new Error('Options are too long.');
  return options;
}

export function optionRows(options: unknown): OptionRow[] {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid existing options. Reload before editing.');
  const rows = Object.entries(options).map(([name, value], id) => {
    if (typeof value !== 'string' || name !== name.trim() || value !== value.trim()) throw new Error('Invalid existing options. Reload before editing.');
    return {id, name, value};
  });
  serializeOptions(rows);
  return rows;
}
