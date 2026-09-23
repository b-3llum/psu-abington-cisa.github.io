#!/usr/bin/env node
/**
 * Plain-Node unit tests for assets/js/main.js helpers. No dependencies.
 * Run: node scripts/test-main.js
 */

var path = require('path');
var main = require(path.join(__dirname, '..', 'assets', 'js', 'main.js'));

var failures = 0;
var passes = 0;

function assertEqual(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error('FAIL: ' + msg);
    console.error('  expected: ' + e);
    console.error('  actual:   ' + a);
  } else {
    passes++;
    console.log('PASS: ' + msg);
  }
}

function assertTrue(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  } else {
    passes++;
    console.log('PASS: ' + msg);
  }
}

// ---- parseLocal doesn't shift days ----
(function () {
  var d = main.parseLocal('2026-09-10', '12:15');
  assertEqual(d.getFullYear(), 2026, 'parseLocal: year');
  assertEqual(d.getMonth(), 8, 'parseLocal: month (0-based September)');
  assertEqual(d.getDate(), 10, 'parseLocal: day not shifted');
  assertEqual(d.getHours(), 12, 'parseLocal: hours');
  assertEqual(d.getMinutes(), 15, 'parseLocal: minutes');

  // Sanity check against the classic UTC-shift bug: new Date('2026-09-10')
  // can render as Sept 9 in negative-UTC-offset timezones. parseLocal must
  // always report the 10th regardless of host timezone.
  var midnight = main.parseLocal('2026-09-10');
  assertEqual(midnight.getDate(), 10, 'parseLocal: midnight date not shifted');
})();

// ---- expandRepeat: 2w from 2026-09-17 until 2026-12-10, skip 2026-11-26 ----
(function () {
  var event = {
    id: 'test-biweekly',
    title: 'Test Biweekly',
    date: '2026-09-17',
    type: 'come-hack',
    repeat: { every: '2w', until: '2026-12-10', skip: ['2026-11-26'] }
  };
  var occs = main.expandRepeat(event);
  var dates = occs.map(function (o) { return o.date; });
  var expected = ['2026-09-17', '2026-10-01', '2026-10-15', '2026-10-29', '2026-11-12', '2026-12-10'];
  assertEqual(dates, expected, 'expandRepeat: biweekly with skip yields expected dates');
  assertTrue(dates.indexOf('2026-11-26') === -1, 'expandRepeat: skipped date is excluded');
  assertEqual(occs[0].occId, 'test-biweekly@2026-09-17', 'expandRepeat: occId format');
})();

// ---- expandRepeat: no repeat block returns single occurrence ----
(function () {
  var event = { id: 'solo-event', title: 'Solo', date: '2026-09-10', type: 'meeting' };
  var occs = main.expandRepeat(event);
  assertEqual(occs.length, 1, 'expandRepeat: no repeat -> single occurrence');
  assertEqual(occs[0].occId, 'solo-event', 'expandRepeat: no repeat -> occId equals id');
})();

// ---- toGCal dates string ----
(function () {
  var occ = {
    id: 'e1', occId: 'e1', title: 'First General Meeting',
    date: '2026-09-10', start: '12:15', end: '13:15',
    location: 'Academic Building 309', summary: 'Kick off the semester.'
  };
  var url = main.toGCal(occ);
  assertTrue(url.indexOf('20260910T121500/20260910T131500') !== -1,
    'toGCal: contains expected dates string');
  assertTrue(url.indexOf('https://calendar.google.com/calendar/render?action=TEMPLATE') === 0,
    'toGCal: URL begins with expected template base');
})();

// ---- toIcs contains DTSTART and escapes commas ----
(function () {
  var occ = {
    id: 'e1', occId: 'e1', title: 'First General Meeting',
    date: '2026-09-10', start: '12:15', end: '13:15',
    location: 'Academic Building 309',
    summary: 'Meet the club, e-board, and friends.'
  };
  var ics = main.toIcs(occ);
  assertTrue(ics.indexOf('DTSTART:20260910T121500') !== -1, 'toIcs: contains DTSTART line');
  assertTrue(ics.indexOf('DTEND:20260910T131500') !== -1, 'toIcs: contains DTEND line');
  assertTrue(ics.indexOf('Meet the club\\, e-board\\, and friends.') !== -1,
    'toIcs: escapes commas in DESCRIPTION');
  assertTrue(ics.indexOf('BEGIN:VCALENDAR') !== -1, 'toIcs: has BEGIN:VCALENDAR');
  assertTrue(ics.indexOf('BEGIN:VEVENT') !== -1, 'toIcs: has BEGIN:VEVENT');
})();

// ---- toIcsCalendar: several events in one calendar ----
(function () {
  var a = { id: 'a', occId: 'a', title: 'A', date: '2026-10-01', start: '12:15', end: '13:15' };
  var b = { id: 'b', occId: 'b', title: 'B', date: '2026-10-15', start: '12:15', end: '13:15' };
  var ics = main.toIcsCalendar([a, b]);
  assertEqual(ics.split('BEGIN:VEVENT').length - 1, 2, 'toIcsCalendar: two VEVENTs');
  assertEqual(ics.split('BEGIN:VCALENDAR').length - 1, 1, 'toIcsCalendar: one VCALENDAR');
  assertEqual(main.toIcs(a), main.toIcsCalendar([a]), 'toIcs: same as a one-event calendar');
})();

// ---- daysUntil / relativeDayLabel ----
(function () {
  var now = new Date(2026, 8, 23, 23, 30);
  assertEqual(main.daysUntil('2026-09-23', now), 0, 'daysUntil: same day is 0');
  assertEqual(main.daysUntil('2026-09-24', now), 1, 'daysUntil: next day is 1 even late at night');
  assertEqual(main.daysUntil('2026-10-01', now), 8, 'daysUntil: Oct 1 is 8 days after Sep 23');
  assertEqual(main.daysUntil('2026-11-02', new Date(2026, 9, 31, 9, 0)), 2, 'daysUntil: counts calendar days across a DST change');
  assertEqual(main.relativeDayLabel(0), 'Today', 'relativeDayLabel: today');
  assertEqual(main.relativeDayLabel(1), 'Tomorrow', 'relativeDayLabel: tomorrow');
  assertEqual(main.relativeDayLabel(8), 'In 8 days', 'relativeDayLabel: in N days');
})();

// ---- splitBoard / joinNames ----
(function () {
  var split = main.splitBoard([
    { name: 'A', role: 'President' },
    { name: 'B', role: 'Co-Advisor' },
    { name: 'C', role: 'Faculty Advisor' }
  ]);
  assertEqual(split.people.map(function (m) { return m.name; }), ['A'], 'splitBoard: officers');
  assertEqual(split.advisors.map(function (m) { return m.name; }), ['B', 'C'], 'splitBoard: advisors');
  assertEqual(main.joinNames(['A']), 'A', 'joinNames: one');
  assertEqual(main.joinNames(['A', 'B']), 'A and B', 'joinNames: two');
  assertEqual(main.joinNames(['A', 'B', 'C']), 'A, B, and C', 'joinNames: three');
})();

// ---- monthGridCells / typeSlug ----
(function () {
  var sep = main.monthGridCells(2026, 8); // September 2026 starts on a Tuesday
  assertEqual(sep.length, 35, 'monthGridCells: Sep 2026 fills five weeks');
  assertEqual(sep[0].date, '2026-08-30', 'monthGridCells: grid starts on the Sunday before');
  assertEqual(sep[2], { date: '2026-09-01', day: 1, inMonth: true }, 'monthGridCells: first of month in column 3');
  assertEqual(sep[34].date, '2026-10-03', 'monthGridCells: grid ends on a Saturday');
  assertEqual(sep.filter(function (c) { return c.inMonth; }).length, 30, 'monthGridCells: 30 days in month');
  assertEqual(main.monthGridCells(2026, 1).length, 28, 'monthGridCells: Feb 2026 is exactly four weeks');
  assertEqual(main.typeSlug('come-hack'), 'comehack', 'typeSlug: strips hyphen');
  assertEqual(main.typeSlug('meeting'), 'meeting', 'typeSlug: known type');
  assertEqual(main.typeSlug('party'), 'other', 'typeSlug: unknown type is other');
})();

// ---- escapeHtml ----
(function () {
  assertEqual(main.escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'escapeHtml: escapes tags and quotes');
  assertEqual(main.escapeHtml("O'Brien & co"), 'O&#39;Brien &amp; co', 'escapeHtml: escapes apostrophe and ampersand');
})();

// ---- isSafeUrl ----
(function () {
  assertTrue(main.isSafeUrl('https://example.com'), 'isSafeUrl: https allowed');
  assertTrue(main.isSafeUrl('http://example.com'), 'isSafeUrl: http allowed');
  assertTrue(main.isSafeUrl('mailto:test@example.com'), 'isSafeUrl: mailto allowed');
  assertTrue(!main.isSafeUrl('javascript:alert(1)'), 'isSafeUrl: javascript: rejected');
  assertTrue(!main.isSafeUrl(''), 'isSafeUrl: empty string rejected');
})();

// ---- foldLine / toIcs: RFC 5545 §3.1 line folding ----
(function () {
  var longDescription = 'This is a deliberately long DESCRIPTION line used to verify that RFC ' +
    '5545 content-line folding kicks in correctly: every physical line must be no more than 75 ' +
    'octets before the CRLF, and unfolding (removing every "\\r\\n " sequence) must restore the ' +
    'original text exactly, including some unicode: café — café — ☃.';
  var occ = {
    id: 'e-fold', occId: 'e-fold', title: 'Fold Test Event',
    date: '2026-09-10', start: '12:15', end: '13:15',
    location: 'Academic Building 309',
    description: longDescription
  };
  var ics = main.toIcs(occ);
  var physicalLines = ics.split('\r\n');

  var maxOctets = 0;
  physicalLines.forEach(function (line) {
    var octets = Buffer.byteLength(line, 'utf8');
    if (octets > maxOctets) maxOctets = octets;
    assertTrue(octets <= 75, 'toIcs: folded physical line <= 75 octets (was ' + octets + ')');
  });
  assertTrue(physicalLines.length > 6, 'toIcs: long DESCRIPTION line actually produced folded continuation lines');

  // Unfold: remove the CRLF+space inserted at each fold point, then the
  // DESCRIPTION content (still icsEscape'd) must match the escaped original.
  var unfolded = ics.replace(/\r\n /g, '');
  var expectedEscapedDesc = 'DESCRIPTION:' + main.icsEscape(longDescription);
  assertTrue(unfolded.indexOf(expectedEscapedDesc) !== -1,
    'toIcs: unfolding ("\\r\\n " removed) restores the original DESCRIPTION text');

  // Direct foldLine test with a plain ASCII line so octet count == char count.
  var plain = 'DESCRIPTION:' + Array(100).join('x');
  var folded = main.foldLine(plain);
  var foldedPhysicalLines = folded.split('\r\n');
  assertTrue(foldedPhysicalLines.length > 1, 'foldLine: long ASCII line is folded into multiple physical lines');
  foldedPhysicalLines.forEach(function (line) {
    assertTrue(Buffer.byteLength(line, 'utf8') <= 75, 'foldLine: each physical line <= 75 octets');
  });
  assertEqual(folded.replace(/\r\n /g, ''), plain, 'foldLine: unfolding restores the original line');
})();

// ---- resolveTheme ----
(function () {
  assertEqual(main.resolveTheme('light', false), 'light', 'resolveTheme: stored light wins over system dark-preferred');
  assertEqual(main.resolveTheme('dark', true), 'dark', 'resolveTheme: stored dark wins over system light-preferred');
  assertEqual(main.resolveTheme(null, true), 'light', 'resolveTheme: no stored -> system light');
  assertEqual(main.resolveTheme(null, false), 'dark', 'resolveTheme: no stored -> system dark (default)');
  assertEqual(main.resolveTheme(undefined, false), 'dark', 'resolveTheme: undefined stored -> system dark');
  assertEqual(main.resolveTheme('bogus', true), 'light', 'resolveTheme: invalid stored value falls back to system');
})();

// ---- nextTheme ----
(function () {
  assertEqual(main.nextTheme('dark'), 'light', 'nextTheme: dark -> light');
  assertEqual(main.nextTheme('light'), 'dark', 'nextTheme: light -> dark');
})();

// ---- fmtDate / fmtTime ----
(function () {
  var d = main.parseLocal('2026-09-10', '12:15');
  assertEqual(main.fmtDate(d), 'Thursday, September 10, 2026', 'fmtDate: full weekday + date');
  assertEqual(main.fmtTime('12:15', '13:15'), '12:15 – 1:15 PM', 'fmtTime: same-period range collapses AM/PM');
})();

console.log('\n' + passes + ' passed, ' + failures + ' failed.');
process.exit(failures > 0 ? 1 : 0);
