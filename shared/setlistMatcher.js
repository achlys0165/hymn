const LEADING_MARKER = /^\s*(?:(?:\d+\s*[.)]|\d+\s*-\s+|[-*•]+|\[[ x]\])\s*)+/i;
const SERVICE_LABEL = /^(?:opening|praise(?:\s*&\s*worship)?|worship|offering|response|closing)\s*[:–—-]\s*/i;
const KEY_NOTE = /\s*(?:\((?:key(?:\s+of)?\s*[:=-]?\s*)?[A-G](?:#|b)?m?\)|\[(?:key\s*[:=-]?\s*)?[A-G](?:#|b)?m?\]|(?:\s+[-–—]\s+|(?:\s+[-–—])?\s+key(?:\s+of)?\s*[:=-]?\s*)[A-G](?:#|b)?m?)\s*$/i;
const REPEAT_NOTE = /\s+(?:x|×)\s*\d+\s*$/i;
const EMOJI = /\p{Regional_Indicator}|\p{Extended_Pictographic}|[\uFE0F\u200D\u20E3]/gu;
const HEADER = /^(?:setlist|song list|songs|worship)\s*:?$/i;
const SERVICE_NAME = /^(?:(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+[\p{L}]+){0,4}\s+service|sunday service|worship service|(?:morning|evening|prayer)\s+service|setlist\s*:\s*.+)$/iu;
const DATE_LINE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)$/i;

export function normalizeSetlistTitle(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ');
}

function cleanLine(raw) {
  return raw.replace(EMOJI, '').replace(LEADING_MARKER, '').replace(SERVICE_LABEL, '').trim();
}

export function detectSetlistHeading(text = '') {
  const lines=String(text).split(/\r?\n/).map((raw,id)=>({ title:cleanLine(raw),id })).filter(line=>line.title);
  const first=lines[0];
  if (!first || lines.length<2 || !SERVICE_NAME.test(first.title) && !DATE_LINE.test(first.title)) return null;
  return { ...first,title:first.title.replace(/^setlist\s*:\s*/i,'') };
}

export function parseSetlist(text = '') {
  const header=detectSetlistHeading(text);
  return String(text)
    .split(/\r?\n/)
    .map((raw, index) => {
      let value = cleanLine(raw);
      if (!value || index===header?.id || HEADER.test(value) || DATE_LINE.test(value)) return null;
      value = value.replace(REPEAT_NOTE, '').replace(KEY_NOTE, '').trim();

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
  const length=Math.max(left.length,right.length);
  let start=0;
  let leftEnd=left.length;
  let rightEnd=right.length;
  while(start<leftEnd&&start<rightEnd&&left[start]===right[start]) start++;
  while(leftEnd>start&&rightEnd>start&&left[leftEnd-1]===right[rightEnd-1]) { leftEnd--; rightEnd--; }
  left=left.slice(start,leftEnd);
  right=right.slice(start,rightEnd);
  if(!left||!right) return 1-Math.max(left.length,right.length)/length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal=previous[0];
    previous[0]=row;
    for (let column = 1; column <= right.length; column += 1) {
      const above=previous[column];
      previous[column]=Math.min(previous[column-1]+1,above+1,diagonal+(left[row-1]===right[column-1]?0:1));
      diagonal=above;
    }
  }
  return 1 - previous[right.length] / length;
}

function grams(title) {
  const padded=' '+title+' ';
  const tokens=new Set();
  for(let index=0;index<padded.length-2;index++) tokens.add(padded.slice(index,index+3));
  return tokens;
}

export function indexSetlistLibrary(songs = []) {
  const exact=new Map();
  const partial=new Map();
  for(const song of songs) {
    const title=normalizeSetlistTitle(song.title);
    if(!title) continue;
    const record={song,title,artist:normalizeSetlistTitle(song.artist)};
    if(!exact.has(title)) exact.set(title,[]);
    exact.get(title).push(record);
    for(const token of grams(title)) {
      if(!partial.has(token)) partial.set(token,[]);
      partial.get(token).push(record);
    }
  }
  return {exact,partial};
}

export function matchSetlist(text, songs = [], index = indexSetlistLibrary(songs)) {
  const seen = new Map();
  return parseSetlist(text).map(entry => {
    const title=normalizeSetlistTitle(entry.title);
    const artist=normalizeSetlistTitle(entry.artist);
    const exact=index.exact.get(title);
    const shortlist=new Map();
    if(!exact) {
      const postings=[...grams(title)].map(token=>index.partial.get(token)).filter(Boolean);
      const rare=postings.filter(records=>records.length<=Math.max(64,songs.length/8));
      for(const records of rare.length ? rare : postings) {
        for(const record of records) shortlist.set(record,(shortlist.get(record)||0)+1);
      }
    }
    // shortcut: bound expensive fuzzy checks to the best token candidates; revisit if short titles are often missed.
    const pool=exact||[...shortlist].sort((a,b)=>b[1]-a[1]).slice(0,32).map(([record])=>record);
    const ranked=pool.map(record=>{
      const titleScore=editSimilarity(title,record.title);
      const artistExact=Boolean(artist&&artist===record.artist);
      return {song:record.song,titleScore,artistExact,score:artist?titleScore*.9+editSimilarity(artist,record.artist)*.1:titleScore,source:'title'};
    }).sort((a,b)=>b.score-a.score);
    const best = ranked[0];
    const second = ranked[1];
    const suggestions=ranked.filter(match=>match.titleScore>=.58).slice(0,3);
    if(!best || best.titleScore<.64) return {...entry,status:'missing',review:'missing',suggestions};
    const margin=best.score-(second?.score||0);
    const certain=exact ? !second || best.artistExact&&!second.artistExact : best.titleScore>=.96 && best.score>=.93 && margin>=.1;
    if(!certain) return {...entry,status:'suggested',review:second&&(exact||second.titleScore>=.64&&margin<.1)?'choose':'check',confidence:best.score,suggestions};
    const duplicateOf=seen.get(best.song.id);
    if(duplicateOf!=null) return {...entry,status:'duplicate',review:'duplicate',song:best.song,duplicateOf,suggestions:[]};
    seen.set(best.song.id,entry.id);
    return {...entry,status:'matched',review:'matched',song:best.song,confidence:best.score,suggestions:[]};
  });
}
