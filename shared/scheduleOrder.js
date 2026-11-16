export function normalizeSongIds(value = []) {
  if (!Array.isArray(value)) throw new TypeError('song_ids must be an array');
  if (value.length > 500) throw new TypeError('A schedule can contain at most 500 songs');

  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new TypeError('song_ids must contain positive integer IDs');
  }
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('A song can only appear once in a schedule');
  }
  return ids;
}

export function hasSameSongIds(current, requested) {
  return current.length === requested.length && current.every((id) => requested.includes(id));
}

export function moveScheduleSong(items, index, direction) {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;

  const reordered = [...items];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}
