const LEADING_MARKER = /^\s*(?:(?:\d+\s*[.)-])|[-*•]+|\[[ x]\])\s*/i;
const SERVICE_LABEL = /^(?:opening|praise(?:\s*&\s*worship)?|worship|offering|response|closing)\s*[:–—-]\s*/i;
const KEY_NOTE = /\s*(?:\((?:key(?:\s+of)?\s*[:=-]?\s*)?[A-G](?:#|b)?m?\)|\[(?:key\s*[:=-]?\s*)?[A-G](?:#|b)?m?\]|[-–—]\s*key(?:\s+of)?\s+[A-G](?:#|b)?m?)\s*$/i;
const REPEAT_NOTE = /\s+(?:x|×)\s*\d+\s*$/i;

export function normalizeSetlistTitle(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseSetlist(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map((raw, index) => {
      let value = raw.replace(LEADING_MARKER, '').replace(SERVICE_LABEL, '').trim();
      value = value.replace(KEY_NOTE, '').replace(REPEAT_NOTE, '').trim();
      if (!value) return null;

      const parts = value.split(/\s+(?:[-–—]|by)\s+/i);
      const title = parts.shift()?.trim() || '';
      const artist = parts.join(' - ').trim();
      return title ? { id: index, raw: raw.trim(), title, artist } : null;
    })
    .filter(Boolean);
}

function editSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function matchScore(entry, song) {
  const titleScore = editSimilarity(normalizeSetlistTitle(entry.title), normalizeSetlistTitle(song.title));
  if (!entry.artist) return titleScore;
  const artistScore = editSimilarity(normalizeSetlistTitle(entry.artist), normalizeSetlistTitle(song.artist));
  return Math.min(1, titleScore * 0.9 + artistScore * 0.1);
}

export function matchSetlist(text, songs = []) {
  const seenSongIds = new Set();
  return parseSetlist(text).map((entry) => {
    const ranked = songs
      .map(song => ({ song, score: matchScore(entry, song) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 0.7) {
      return { ...entry, status: 'missing', suggestions: ranked.filter(match => match.score >= 0.5).slice(0, 3) };
    }

    const certain = best.score >= 0.9 && (!second || best.score - second.score >= 0.08);
    if (!certain) return { ...entry, status: 'suggested', suggestions: ranked.slice(0, 3) };
    if (seenSongIds.has(best.song.id)) return { ...entry, status: 'duplicate', song: best.song, suggestions: [] };
    seenSongIds.add(best.song.id);
    return { ...entry, status: 'matched', song: best.song, suggestions: [] };
  });
}
