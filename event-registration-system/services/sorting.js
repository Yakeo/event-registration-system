/**
 * services/sorting.js
 * One small, whitelisted way to order a list from the query string.
 *
 *   ?sort=name&dir=asc     alphabetical
 *   ?sort=date&dir=desc    newest first
 *
 * Why a whitelist instead of passing the query straight to Sequelize's
 * `order`: an unvalidated sort key becomes SQL. Every list declares the keys
 * it allows, and anything else falls back to the default, so a hand-typed
 * `?sort=../../etc/passwd` is simply ignored rather than reaching the query
 * builder.
 *
 * A "key" is a label the view knows (`name`, `date`, `status`), and the map
 * entry says how to express it: either a plain column, a column on a joined
 * model, or a value computed in JavaScript after the rows are loaded (used for
 * "seats left", which is derived from a count and therefore not a column).
 */
const DIRECTIONS = ['asc', 'desc'];

/** Normalises `?sort=` / `?dir=` against the keys a list supports. */
function resolve(query = {}, keys, fallback) {
  const key = String(query.sort || '').toLowerCase();
  const wanted = String(query.dir || '').toLowerCase();

  const active = keys.includes(key) ? key : fallback.key;
  const dir = DIRECTIONS.includes(wanted)
    ? wanted
    : (fallback.dir || 'asc');

  return { key: active, dir };
}

/**
 * Turns a resolved key into a Sequelize `order` array.
 * `map` entries are either a column name or [model, column]; both also accept
 * the model form used for a joined table, e.g. [{ model: User, as: 'user' },
 * 'full_name'].
 */
function orderFor(map, { key, dir }) {
  const entry = map[key];
  if (!entry) return [];
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  if (Array.isArray(entry)) return [[...entry, direction]];
  return [[entry, direction]];
}

/**
 * Sorts an already-loaded array (used where the sort value is computed, such
 * as seats remaining). `pick(row, key)` returns a string or number per row;
 * it is also called with the default key to break ties, so equal values keep a
 * sensible secondary order instead of looking random.
 */
function sortRows(rows, { key, dir }, pick, fallbackKey) {
  const factor = dir === 'desc' ? -1 : 1;
  const norm = (v) => (typeof v === 'number' ? v : String(v == null ? '' : v).toLowerCase());
  const compare = (a, b) => {
    const av = norm(pick(a, key));
    const bv = norm(pick(b, key));
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    if (!fallbackKey) return 0;
    const ak = norm(pick(a, fallbackKey));
    const bk = norm(pick(b, fallbackKey));
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  };
  // Array#sort is stable, so rows that tie on both values keep their incoming
  // order rather than jumping around between page loads.
  return [...rows].sort(compare);
}

/**
 * Builds the href for a sortable header: clicking the active column flips the
 * direction, clicking any other column starts ascending. Existing query
 * parameters (a search term, a status filter) are preserved.
 */
function href(basePath, query, key, current) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (k === 'sort' || k === 'dir' || v === undefined || v === '') return;
    params.set(k, v);
  });
  params.set('sort', key);
  const nextDir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
  params.set('dir', nextDir);
  return `${basePath}?${params.toString()}`;
}

/**
 * Decorates a list's locals with everything the views need: the current
 * state, the href builder, and an arrow to render next to the active column.
 */
function locals(basePath, query, keys, fallback, labels = {}) {
  const current = resolve(query, keys, fallback);
  return {
    sort: current,
    sortHref: (key) => href(basePath, query, key, current),
    // arrow shown next to a column heading: active columns get a direction,
    // inactive ones get the neutral "clickable" glyph
    sortArrow: (key) => {
      if (current.key !== key) return ' ⇅';
      return current.dir === 'asc' ? ' ↑' : ' ↓';
    },
    sortLabel: (key) => labels[key] || key,
    // "sort=name&dir=asc" — for links that carry the current order along
    // (status filters, CSV downloads) without flipping it
    sortParams: `sort=${current.key}&dir=${current.dir}`,
  };
}

module.exports = { resolve, orderFor, sortRows, href, locals, DIRECTIONS };
