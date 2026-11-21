// Fast CSV reader, written from the competition spec.
//
// Two paths share one contract:
//  - a quote-free line path: slice the line, split on commas, strip lone CRs;
//  - a general path: an index-based scanner that jumps between delimiters
//    with indexOf, slices fields out, and only joins segments when a field
//    is broken by a lone CR or a doubled quote.
//
// Error order, line numbers and row indexes follow the spec: an error's
// line is the 1-based line its record starts on, its row the record's
// index in rows (null for the header record, or for errors met before
// any record is kept when a header is expected). A field's quote_junk
// is recorded when the field ends, a record's short_row/long_row when
// the record ends, and an unterminated_quote as soon as the scan proves
// no closing quote exists anywhere later in the text.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;

  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  const rows = [];
  const errors = [];
  let firstFields;
  let sawFirst = false;
  let width = 0;
  let curLine = 1;

  // Monotone caches: the next quote / CR at or after the cursor. Each
  // refresh scans a stretch that is never scanned again, so quote and CR
  // searches cost O(n) over the whole input instead of O(n) per record.
  let nextQ = text.indexOf('"', i);
  let nextR = text.indexOf('\r', i);

  // Per-record state, read by the scanners below.
  let recordStartLine = 1;
  let rowIndex = null;

  // scanUnquoted results, via shared slots to avoid allocating per field.
  let sqVal = '';
  let sqEnd = 0; // 0 = end of text, 1 = comma, 2 = line break
  let sqNext = 0;

  function finishRecord(fields) {
    if (!sawFirst) {
      sawFirst = true;
      width = fields.length;
      if (header) {
        firstFields = fields;
        return;
      }
      rows.push(fields);
      return;
    }
    if (fields.length < width) {
      const count = fields.length;
      while (fields.length < width) fields.push('');
      errors.push({ code: 'short_row', line: recordStartLine, row: rowIndex, fields: count });
    } else if (fields.length > width) {
      const extra = fields.slice(width);
      fields.length = width;
      errors.push({ code: 'long_row', line: recordStartLine, row: rowIndex, extra });
    }
    rows.push(fields);
  }

  // Scan one unquoted field starting at `start`. Lone CRs are dropped and
  // reported; a CR followed by LF ends the record. Sets sqVal/sqEnd/sqNext.
  function scanUnquoted(start) {
    let p = start;
    let segStart = start;
    let parts = null;
    for (;;) {
      if (nextR !== -1 && nextR < p) nextR = text.indexOf('\r', p);
      const c = text.indexOf(',', p);
      const l = text.indexOf('\n', p);
      let m = -1;
      let kind = 0;
      if (c !== -1) {
        m = c;
        kind = 1;
      }
      if (l !== -1 && (m === -1 || l < m)) {
        m = l;
        kind = 2;
      }
      if (nextR !== -1 && (m === -1 || nextR < m)) {
        const r = nextR;
        if (r + 1 < n && text.charCodeAt(r + 1) === 10) {
          const seg = text.slice(segStart, r);
          sqVal = parts === null ? seg : parts.join('') + seg;
          sqEnd = 2;
          sqNext = r + 2;
          nextR = text.indexOf('\r', r + 2);
          return;
        }
        errors.push({ code: 'stray_cr', line: recordStartLine, row: rowIndex });
        if (parts === null) parts = [text.slice(segStart, r)];
        else parts.push(text.slice(segStart, r));
        p = r + 1;
        segStart = r + 1;
        nextR = text.indexOf('\r', p);
        continue;
      }
      if (m === -1) {
        const tail = text.slice(segStart);
        sqVal = parts === null ? tail : parts.join('') + tail;
        sqEnd = 0;
        sqNext = n;
        return;
      }
      const seg = text.slice(segStart, m);
      sqVal = parts === null ? seg : parts.join('') + seg;
      sqEnd = kind;
      sqNext = m + 1;
      return;
    }
  }

  // Parse one record whose first line holds a quote. Returns the fields,
  // whether any field was quoted, how the record ended, and the cursor.
  function parseGeneral(start) {
    const fields = [];
    let recQuoted = false;
    let endKind = 0;
    let p = start;
    for (;;) {
      let val;
      if (p < n && text.charCodeAt(p) === 34) {
        recQuoted = true;
        let pos = p + 1;
        let segStart = p + 1;
        let parts = null;
        let closedAt = -1;
        for (;;) {
          const j = text.indexOf('"', pos);
          if (j === -1) {
            // No closing quote anywhere later: the quote is literal and
            // the rest is read again as an unquoted field.
            errors.push({ code: 'unterminated_quote', line: recordStartLine, row: rowIndex });
            nextQ = -1;
            scanUnquoted(p + 1);
            val = '"' + sqVal;
            endKind = sqEnd;
            p = sqNext;
            break;
          }
          if (j + 1 < n && text.charCodeAt(j + 1) === 34) {
            if (parts === null) parts = [text.slice(segStart, j + 1)];
            else parts.push(text.slice(segStart, j + 1));
            pos = j + 2;
            segStart = j + 2;
            continue;
          }
          closedAt = j;
          const seg = text.slice(segStart, j);
          val = parts === null ? seg : parts.join('') + seg;
          break;
        }
        if (closedAt !== -1) {
          // Embedded line breaks become LF in the value and count lines.
          if (val.indexOf('\n') !== -1 || val.indexOf('\r') !== -1) {
            let adds = 0;
            let q2 = val.indexOf('\n');
            while (q2 !== -1) {
              adds++;
              q2 = val.indexOf('\n', q2 + 1);
            }
            let r2 = val.indexOf('\r');
            while (r2 !== -1) {
              if (r2 + 1 >= val.length || val.charCodeAt(r2 + 1) !== 10) adds++;
              r2 = val.indexOf('\r', r2 + 1);
            }
            curLine += adds;
            if (val.indexOf('\r') !== -1) val = val.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
          }
          // What follows the closing quote, up to the next comma or line
          // break, is appended as it stands (unquoted rules apply).
          scanUnquoted(closedAt + 1);
          if (sqVal !== '') {
            val += sqVal;
            errors.push({ code: 'quote_junk', line: recordStartLine, row: rowIndex });
          }
          endKind = sqEnd;
          p = sqNext;
        }
      } else {
        scanUnquoted(p);
        val = sqVal;
        endKind = sqEnd;
        p = sqNext;
      }
      fields.push(val);
      if (endKind === 1) {
        if (p >= n) {
          fields.push('');
          endKind = 0;
          break;
        }
        continue;
      }
      break;
    }
    return { fields, recQuoted, endKind, nextI: p };
  }

  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 10) {
      i++;
      curLine++;
      continue;
    }
    if (ch === 13 && i + 1 < n && text.charCodeAt(i + 1) === 10) {
      i += 2;
      curLine++;
      continue;
    }

    recordStartLine = curLine;
    rowIndex = header && !sawFirst ? null : rows.length;

    if (nextQ !== -1 && nextQ < i) nextQ = text.indexOf('"', i);
    let lineEnd = text.indexOf('\n', i);
    if (lineEnd === -1) lineEnd = n;

    if (nextQ === -1 || nextQ > lineEnd) {
      // Quote-free line: split on commas, strip lone CRs.
      let contentEnd = lineEnd;
      if (lineEnd < n && lineEnd > i && text.charCodeAt(lineEnd - 1) === 13) contentEnd = lineEnd - 1;
      const content = text.slice(i, contentEnd);
      let fields;
      if (content.indexOf('\r') === -1) {
        fields = content.split(',');
      } else {
        fields = content.split(',');
        for (let k = 0; k < fields.length; k++) {
          const f = fields[k];
          if (f.indexOf('\r') !== -1) {
            const parts = f.split('\r');
            const c = parts.length - 1;
            for (let t = 0; t < c; t++) errors.push({ code: 'stray_cr', line: recordStartLine, row: rowIndex });
            fields[k] = parts.join('');
          }
        }
      }
      i = lineEnd < n ? lineEnd + 1 : n;
      curLine++;
      // A single empty unquoted field with nothing kept is no record.
      if (fields.length === 1 && fields[0] === '' && content.indexOf(',') === -1) continue;
      finishRecord(fields);
    } else {
      const g = parseGeneral(i);
      i = g.nextI;
      if (g.endKind === 2) curLine++;
      nextQ = text.indexOf('"', i);
      if (g.fields.length === 1 && g.fields[0] === '' && !g.recQuoted) continue;
      finishRecord(g.fields);
    }
  }

  return { columns: header ? firstFields ?? [] : null, rows, errors };
}
