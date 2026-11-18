const weekdays = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const longDates = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
const months = new Intl.DateTimeFormat('en-US', { month: 'short' });
const songPlural = new Intl.PluralRules('en');
const heading = /^([ \t]*(?:\[[^\]\r\n]+\]|(?:verse|chorus|pre[- ]?chorus|bridge|intro|outro|tag|ending|refrain)(?:[ \t]+\d+)?)[ \t]*)(\r?\n|$)/i;

export function readSetting(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function localDateKey(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
}

export function parseDate(value) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value ?? '')) return null;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(+date) && localDateKey(date) === value ? date : null;
}

export function formatDate(value, full = false) {
  const date = parseDate(value);
  return date ? (full ? longDates : weekdays).format(date) : '';
}

export function dateTile(value) {
  const date = parseDate(value);
  return date ? { day: date.getDate(), month: months.format(date) } : null;
}

export function nextSunday(today = new Date()) {
  const date = new Date(today);
  date.setDate(date.getDate() + (7 - date.getDay()));
  return localDateKey(date);
}

export function songCount(count) {
  return count + (songPlural.select(count) === 'one' ? ' song' : ' songs');
}

export function pluralCount(count, singular) {
  return count + ' ' + singular + (songPlural.select(count) === 'one' ? '' : 's');
}

export function splitLyrics(raw = '') {
  return String(raw).split(/(\r?\n(?:[ \t]*\r?\n)+)/).reduce((sections, part, index, parts) => {
    if (index % 2) return sections;
    if (!part && index === parts.length - 1) return sections;
    const match = part.match(heading);
    sections.push({
      prefix: match?.[0] ?? '',
      text: part.slice(match?.[0].length ?? 0),
      separator: parts[index + 1] ?? '',
    });
    return sections;
  }, []);
}

export function joinLyrics(sections) {
  return sections.map(({ prefix, text, separator }, index) => {
    const newline = prefix && text && !prefix.endsWith('\n') ? '\n' : '';
    return prefix + newline + text + (separator || (index < sections.length - 1 ? '\n\n' : ''));
  }).join('');
}

export function sectionName(section) {
  return section.prefix.trim().replace(/^\[(.*)\]$/, '$1');
}

export function lyricSections(song) {
  if (song?.lyrics_format === 'structured' && song.lyrics?.trim().startsWith('[')) {
    try {
      const sections = JSON.parse(song.lyrics);
      if (Array.isArray(sections)) return sections.filter(section => Array.isArray(section?.lines))
        .map(section => ({ label: section.label ?? '', text: section.lines.join('\n') }));
    } catch { /* Older imports can contain bracketed text instead. */ }
  }
  return splitLyrics(song?.lyrics).map(section => ({ label: sectionName(section), text: section.text }));
}

export function lyricsForEditor(song) {
  if (song?.lyrics_format === 'structured') {
    try {
      if (Array.isArray(JSON.parse(song.lyrics))) return lyricSections(song)
        .map(({ label, text }) => (label ? '[' + label + ']\n' : '') + text).join('\n\n');
    } catch { /* Plain text keeps its original bytes. */ }
  }
  return song?.lyrics ?? '';
}

export function setlistBuckets(setlists, today = localDateKey()) {
  const dated = setlists.filter(item => parseDate(item.date));
  return {
    upcoming: dated.filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    past: dated.filter(item => item.date < today).sort((a, b) => b.date.localeCompare(a.date)),
    undated: setlists.filter(item => !parseDate(item.date)),
  };
}

export function searchLibrary(songs, setlists, value, limit = 28) {
  const query = value.trim().toLocaleLowerCase();
  const result = { songs: [], setlists: [] };
  if (!query) return result;
  const includes = text => text?.toLocaleLowerCase().includes(query);
  for (const song of songs) {
    const title = includes(song.title);
    const artist = includes(song.artist);
    const snippet = title || artist ? '' : lyricSections(song).flatMap(({ text }) => text.split(/\r?\n/)).find(includes);
    if (title || artist || snippet) result.songs.push({ item: song, excerpt: snippet || song.artist || '' });
    if (result.songs.length >= limit) break;
  }
  for (const setlist of setlists) {
    if (includes(setlist.name)) result.setlists.push({ item: setlist, excerpt: formatDate(setlist.date) });
    if (result.setlists.length >= limit) break;
  }
  return result;
}

export function serviceTimeInput(value) {
  const text = value?.trim() || '';
  const match = text.match(/^(\d{1,2}):([0-5]\d)(?:\s*(am|pm))?$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) return '';
    hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  return hour < 24 ? String(hour).padStart(2, '0') + ':' + match[2] : '';
}

export function serviceTimeFromInput(value, previous = '') {
  if (value === serviceTimeInput(previous)) return previous;
  if (!value || !/\b(am|pm)\b/i.test(previous) && previous) return value;
  const [hour, minutes] = value.split(':');
  return (Number(hour) % 12 || 12) + ':' + minutes + (Number(hour) >= 12 ? ' PM' : ' AM');
}

export function monogram(title) {
  const text = String(title ?? '').trim();
  const initials = text.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toLocaleUpperCase();
  const tone = Array.from(text).reduce((sum, character) => sum + character.codePointAt(0), 0) % 3;
  return { initials, tone };
}

export function lineupChanges(current, desired) {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const add = desired.filter(id => !currentSet.has(id));
  const remove = current.filter(id => !desiredSet.has(id));
  const afterMembership = current.filter(id => desiredSet.has(id)).concat(add);
  return { add, remove, reorder: afterMembership.some((id, index) => desired[index] !== id) };
}
