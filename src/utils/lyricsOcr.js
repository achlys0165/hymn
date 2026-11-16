import { createWorker } from 'tesseract.js';

let workerPromise = null;
let progressListener = null;

// Points at the offline assets in public/tessdata/. Loading everything
// locally means scanning a photo never needs an internet connection.
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: '/tessdata/worker.min.js',
      corePath: '/tessdata/tesseract-core-lstm.wasm.js',
      langPath: '/tessdata',
      logger: (message) => progressListener?.(message),
    });
  }
  return workerPromise;
}

/**
 * Extracts all lines with bounding box data from Tesseract's nested data structure
 * (data.blocks -> paragraphs -> lines).
 */
function extractAllLinesFromData(data) {
  if (!data) return [];
  const lines = [];

  if (Array.isArray(data.lines) && data.lines.length > 0) {
    lines.push(...data.lines);
  } else if (Array.isArray(data.blocks)) {
    data.blocks.forEach((block) => {
      if (Array.isArray(block.paragraphs)) {
        block.paragraphs.forEach((paragraph) => {
          if (Array.isArray(paragraph.lines)) {
            lines.push(...paragraph.lines);
          }
        });
      }
    });
  }

  return lines;
}

function createSegmentFromWords(words, parentLine) {
  const text = words.map((w) => w.text).join(' ');
  const x0 = words[0].bbox.x0;
  const x1 = words[words.length - 1].bbox.x1;
  const y0 = parentLine?.bbox ? parentLine.bbox.y0 : words[0].bbox.y0;
  const y1 = parentLine?.bbox ? parentLine.bbox.y1 : words[words.length - 1].bbox.y1;

  return { text, x0, x1, y0, y1 };
}

/**
 * Reconstructs text from Tesseract data using line/word bounding boxes to correctly
 * handle multi-column layouts (e.g. 2 or more verse columns sitting side-by-side).
 */
export function reconstructMultiColumnText(data) {
  const allLines = extractAllLinesFromData(data);
  if (!allLines || allLines.length === 0) {
    return data?.text || '';
  }

  // Calculate median word gap across all lines to establish standard word spacing
  const wordGaps = [];
  allLines.forEach((line) => {
    const validWords = (line.words || []).filter((w) => w.text && w.text.trim());
    for (let i = 0; i < validWords.length - 1; i++) {
      const gap = validWords[i + 1].bbox.x0 - validWords[i].bbox.x1;
      if (gap > 0) wordGaps.push(gap);
    }
  });

  wordGaps.sort((a, b) => a - b);
  const medianGap = wordGaps.length ? wordGaps[Math.floor(wordGaps.length / 2)] : 10;
  // A gap between consecutive words is treated as a column gap if it's > 3.5x median word gap or > 35px
  const columnGapThreshold = Math.max(35, medianGap * 3.5);

  const lineSegments = [];

  allLines.forEach((line) => {
    const validWords = (line.words || []).filter((w) => w.text && w.text.trim());
    if (validWords.length === 0) return;

    let currentSegmentWords = [validWords[0]];

    for (let i = 0; i < validWords.length - 1; i++) {
      const gap = validWords[i + 1].bbox.x0 - validWords[i].bbox.x1;
      if (gap >= columnGapThreshold) {
        lineSegments.push(createSegmentFromWords(currentSegmentWords, line));
        currentSegmentWords = [validWords[i + 1]];
      } else {
        currentSegmentWords.push(validWords[i + 1]);
      }
    }
    if (currentSegmentWords.length > 0) {
      lineSegments.push(createSegmentFromWords(currentSegmentWords, line));
    }
  });

  if (lineSegments.length === 0) {
    return data?.text || '';
  }

  // Sort line segments left-to-right by x0
  lineSegments.sort((a, b) => a.x0 - b.x0);

  const columns = [];

  lineSegments.forEach((segment) => {
    let bestColumn = null;
    let minDiff = Infinity;

    for (const col of columns) {
      const colCenterX = (col.minX + col.maxX) / 2;
      const segCenterX = (segment.x0 + segment.x1) / 2;

      // Check if segment is separated by a gutter gap (> 15px past column bounds)
      const isSeparatedByGutter = segment.x0 > col.maxX + 15 || segment.x1 < col.minX - 15;

      if (!isSeparatedByGutter) {
        const diff = Math.abs(segCenterX - colCenterX);
        if (diff < minDiff) {
          minDiff = diff;
          bestColumn = col;
        }
      }
    }

    if (bestColumn) {
      bestColumn.segments.push(segment);
      bestColumn.minX = Math.min(bestColumn.minX, segment.x0);
      bestColumn.maxX = Math.max(bestColumn.maxX, segment.x1);
    } else {
      columns.push({
        minX: segment.x0,
        maxX: segment.x1,
        segments: [segment],
      });
    }
  });

  // Sort columns left-to-right by minX
  columns.sort((a, b) => a.minX - b.minX);

  // Within each column, sort segments top-to-bottom by y0 and join lines
  const columnTexts = columns.map((col) => {
    col.segments.sort((a, b) => a.y0 - b.y0);
    return col.segments.map((s) => s.text).join('\n');
  });

  // Join columns with double newlines
  return columnTexts.join('\n\n');
}

/**
 * Runs OCR on an image File/Blob and returns text reconstructed in column reading order.
 * The worker is created once and reused across every subsequent scan.
 */
export async function extractTextFromImage(file, { onProgress } = {}) {
  const worker = await getWorker();
  progressListener = onProgress;
  try {
    const { data } = await worker.recognize(file, {}, { blocks: true });
    return reconstructMultiColumnText(data);
  } finally {
    progressListener = null;
  }
}

// --- Chord-line detection & stripping ---
const CHORD_TOKEN =
  /^[A-G](#|b)?(maj7|maj9|maj|m7b5|m7|m9|m6|min7|min|m|sus2|sus4|sus|dim7|dim|aug|add9|add2|add|6|7|9|11|13)?(\/[A-G](#|b)?)?$/i;
const ALLOWED_EXTRAS = /^(x\d+|\d+x|n\.?c\.?|\(.*\))$/i;

function chordToken(value) {
  return value.replace(/^[|:([\s]+|[|:,)\]\s]+$/g, '');
}

export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).map(chordToken).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter((token) => CHORD_TOKEN.test(token)).length;
  if (!tokens.every((token) => CHORD_TOKEN.test(token) || ALLOWED_EXTRAS.test(token))) return false;
  if (chordCount >= 2) return true;
  // Keep a one-letter lyric such as "A"; a single decorated chord is unambiguous.
  return chordCount === 1 && /[#b/0-9]|maj|min|sus|dim|aug|add|m$/i.test(tokens[0]);
}

function stripInlineChords(line) {
  let removed = 0;
  const text = line.replace(/\[([^\]]+)\]/g, (match, value) => {
    if (!CHORD_TOKEN.test(value.trim())) return match;
    removed += 1;
    return '';
  });
  return { text: text.replace(/[ \t]{2,}/g, ' ').trimEnd(), removed };
}

export function cleanOcrText(rawText) {
  const lines = String(rawText || '').normalize('NFKC').replace(/\r\n?/g, '\n').split('\n');
  const kept = [];
  let removedChordLines = 0;
  let removedInlineChords = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00ad/g, '').trim();
    if (isChordLine(line)) {
      removedChordLines += 1;
      continue;
    }
    const inline = stripInlineChords(line);
    removedInlineChords += inline.removed;
    kept.push(inline.text);
  }

  return {
    text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    removedChordLines,
    removedInlineChords,
  };
}

/**
 * Strips lines that look like chord-only rows (e.g. "G   D   Em   C" sitting
 * above a lyric line), leaving section tags and lyric lines untouched.
 */
export function stripChordLines(rawText) {
  return cleanOcrText(rawText).text;
}
