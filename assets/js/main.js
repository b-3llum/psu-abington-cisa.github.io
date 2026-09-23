/* =========================================================================
   CISA @ Penn State Abington — site script
   Vanilla JS, no build step, no third-party requests.
   Pure helpers live at the top and are exported for Node unit tests via the
   guarded `module.exports` block at the bottom. DOM code only runs when
   `document` exists, inside init().
   ========================================================================= */

(function (root) {
  'use strict';

  // =======================================================================
  // Pure helpers (safe to run in Node or the browser)
  // =======================================================================

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var WEEKDAY_SHORT_TITLE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /**
   * Parse a YYYY-MM-DD date (and optional HH:MM time) into a local Date
   * object WITHOUT using `new Date('YYYY-MM-DD')`, which parses as UTC and
   * can shift the calendar day for viewers west of UTC.
   */
  function parseLocal(dateStr, timeStr) {
    var dparts = String(dateStr).split('-');
    var y = parseInt(dparts[0], 10);
    var m = parseInt(dparts[1], 10);
    var d = parseInt(dparts[2], 10);
    var hh = 0, mm = 0;
    if (timeStr) {
      var tparts = String(timeStr).split(':');
      hh = parseInt(tparts[0], 10);
      mm = parseInt(tparts[1], 10);
    }
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  /** Add whole days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
  function addDaysToDateStr(dateStr, days) {
    var dparts = String(dateStr).split('-');
    var d = new Date(parseInt(dparts[0], 10), parseInt(dparts[1], 10) - 1, parseInt(dparts[2], 10));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function dateStrOf(y, m, d) {
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function fmtDate(date) {
    return WEEKDAY_NAMES[date.getDay()] + ', ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function fmtTime12(hh, mm) {
    var period = hh >= 12 ? 'PM' : 'AM';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(mm) + ' ' + period;
  }

  /** "12:15 – 1:15 PM" style range from HH:MM strings (end optional). */
  function fmtTime(start, end) {
    if (!start) return '';
    var s = start.split(':').map(function (n) { return parseInt(n, 10); });
    if (!end) return fmtTime12(s[0], s[1]);
    var e = end.split(':').map(function (n) { return parseInt(n, 10); });
    var startPeriod = s[0] >= 12 ? 'PM' : 'AM';
    var endPeriod = e[0] >= 12 ? 'PM' : 'AM';
    var sh = s[0] % 12; if (sh === 0) sh = 12;
    if (startPeriod === endPeriod) {
      return sh + ':' + pad2(s[1]) + ' – ' + fmtTime12(e[0], e[1]);
    }
    return fmtTime12(s[0], s[1]) + ' – ' + fmtTime12(e[0], e[1]);
  }

  /**
   * Expand a single event definition (which may carry a `repeat` block)
   * into concrete occurrences. Each occurrence is a shallow copy of the
   * event with `date` set to that occurrence's date and `occId` set to
   * `<id>` (no repeat) or `<id>@<date>` (repeated occurrence).
   */
  function expandRepeat(event) {
    var occurrences = [];
    if (!event || !event.repeat) {
      var single = shallowCopy(event);
      single.occId = event.id;
      occurrences.push(single);
      return occurrences;
    }
    var step = event.repeat.every === '2w' ? 14 : 7;
    var until = event.repeat.until;
    var skip = event.repeat.skip || [];
    var cur = event.date;
    var guard = 0;
    while (cur <= until && guard < 500) {
      guard++;
      if (skip.indexOf(cur) === -1) {
        var occ = shallowCopy(event);
        occ.date = cur;
        occ.occId = event.id + '@' + cur;
        occurrences.push(occ);
      }
      cur = addDaysToDateStr(cur, step);
    }
    return occurrences;
  }

  function shallowCopy(obj) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      if (ch === '&') return '&amp;';
      if (ch === '<') return '&lt;';
      if (ch === '>') return '&gt;';
      if (ch === '"') return '&quot;';
      return '&#39;';
    });
  }

  /** Only http(s) and mailto URLs are allowed as href targets. */
  function isSafeUrl(url) {
    return /^(https?:|mailto:)/i.test(String(url || ''));
  }

  /**
   * Resolve the effective theme ('light' | 'dark') from an explicit stored
   * choice plus the OS-level preference. An explicit stored choice ('light'
   * or 'dark') always wins; any other value (including null/undefined, e.g.
   * localStorage was empty or unavailable) falls back to the system
   * preference.
   */
  function resolveTheme(stored, systemPrefersLight) {
    if (stored === 'light' || stored === 'dark') return stored;
    return systemPrefersLight ? 'light' : 'dark';
  }

  /** The theme the toggle switches TO from the given current theme. */
  function nextTheme(current) {
    return current === 'light' ? 'dark' : 'light';
  }

  function toGCalDatesParam(dateStr, start, end) {
    var d = dateStr.replace(/-/g, '');
    if (!start) {
      var endDate = addDaysToDateStr(dateStr, 1).replace(/-/g, '');
      return d + '/' + endDate;
    }
    var s = start.replace(':', '') + '00';
    var e = (end || start).replace(':', '') + '00';
    return d + 'T' + s + '/' + d + 'T' + e;
  }

  /** Build a "Add to Google Calendar" URL for one occurrence. */
  function toGCal(occ) {
    var params = [];
    params.push('action=TEMPLATE');
    params.push('text=' + encodeURIComponent(occ.title || ''));
    params.push('dates=' + toGCalDatesParam(occ.date, occ.start, occ.end));
    var detailsText = occ.summary || '';
    if (occ.url) detailsText += (detailsText ? '\n\n' : '') + occ.url;
    params.push('details=' + encodeURIComponent(detailsText));
    params.push('location=' + encodeURIComponent(occ.location || ''));
    params.push('ctz=America/New_York');
    return 'https://calendar.google.com/calendar/render?' + params.join('&');
  }

  function icsEscape(str) {
    return String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /**
   * UTF-8 octet length of a single JS "character" as produced by iterating a
   * string with `Array.from` / `for...of` (i.e. one full Unicode code point,
   * with surrogate pairs already combined). No Buffer/TextEncoder needed so
   * this runs identically in Node and the browser.
   */
  function charUtf8Len(ch) {
    var code = ch.codePointAt(0);
    if (code <= 0x7F) return 1;
    if (code <= 0x7FF) return 2;
    if (code <= 0xFFFF) return 3;
    return 4;
  }

  /**
   * Fold one logical iCalendar content line (no CRLF in `line`) per RFC 5545
   * §3.1: physical lines SHOULD be no longer than 75 octets, and folding is
   * done by inserting CRLF followed by a single space before the octet that
   * would exceed the limit. Folding is done per-code-point (never splitting
   * a multi-byte UTF-8 character) by counting octet length per character
   * rather than relying on Buffer/TextEncoder, so it also works unmodified
   * in the browser.
   */
  function foldLine(line) {
    var chars = Array.from(String(line == null ? '' : line));
    var maxOctets = 75;
    var out = [];
    var cur = '';
    var curOctets = 0;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var chLen = charUtf8Len(ch);
      if (cur !== '' && curOctets + chLen > maxOctets) {
        out.push(cur);
        cur = ' ' + ch;
        curOctets = 1 + chLen;
      } else {
        cur += ch;
        curOctets += chLen;
      }
    }
    out.push(cur);
    return out.join('\r\n');
  }


  /** The VEVENT lines (unfolded) for one occurrence. */
  function veventLines(occ) {
    var dt = occ.date.replace(/-/g, '');
    var lines = [];
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (occ.occId || occ.id) + '@psu-abington-cisa.github.io');
    if (occ.start) {
      lines.push('DTSTART:' + dt + 'T' + occ.start.replace(':', '') + '00');
      lines.push('DTEND:' + dt + 'T' + (occ.end || occ.start).replace(':', '') + '00');
    } else {
      lines.push('DTSTART;VALUE=DATE:' + dt);
      lines.push('DTEND;VALUE=DATE:' + addDaysToDateStr(occ.date, 1).replace(/-/g, ''));
    }
    lines.push('SUMMARY:' + icsEscape(occ.title));
    var desc = occ.description || occ.summary;
    if (desc) lines.push('DESCRIPTION:' + icsEscape(desc));
    if (occ.location) lines.push('LOCATION:' + icsEscape(occ.location));
    if (occ.url) lines.push('URL:' + icsEscape(occ.url));
    lines.push('END:VEVENT');
    return lines;
  }

  /** Build a floating-local-time .ics VCALENDAR document holding several occurrences. */
  function toIcsCalendar(occs) {
    var lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//CISA Penn State Abington//Events//EN');
    lines.push('CALSCALE:GREGORIAN');
    occs.forEach(function (occ) { lines = lines.concat(veventLines(occ)); });
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n');
  }

  /** Build a floating-local-time .ics VCALENDAR document for one occurrence. */
  function toIcs(occ) {
    return toIcsCalendar([occ]);
  }

  /** Whole calendar days from `now`'s date to a YYYY-MM-DD date (0 = today). */
  function daysUntil(dateStr, now) {
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((parseLocal(dateStr) - today) / 86400000);
  }

  /** "Today" / "Tomorrow" / "In 8 days" for a non-negative day count. */
  function relativeDayLabel(days) {
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return 'In ' + days + ' days';
  }

  /** Split a board roster into student officers and faculty advisors. */
  function splitBoard(members) {
    var people = [];
    var advisors = [];
    (members || []).forEach(function (m) {
      if (/advis/i.test(m.role || '')) advisors.push(m); else people.push(m);
    });
    return { people: people, advisors: advisors };
  }

  /** "A", "A and B", "A, B, and C". */
  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  var EVENT_TYPES = ['meeting', 'come-hack', 'workshop', 'social', 'competition', 'other'];
  var TYPE_LABELS = {
    'meeting': 'Meeting', 'come-hack': 'Come Hack', 'workshop': 'Workshop',
    'social': 'Social', 'competition': 'Competition', 'other': 'Other'
  };

  /** CSS-safe slug for an event type ("come-hack" -> "comehack"; unknown -> "other"). */
  function typeSlug(type) {
    if (EVENT_TYPES.indexOf(type) === -1) return 'other';
    return type.replace('-', '');
  }

  /**
   * The YYYY-MM-DD cells of a Sunday-first month grid for (year, month0),
   * padded with the neighbouring months' days to whole weeks.
   */
  function monthGridCells(year, month0) {
    var first = new Date(year, month0, 1);
    var start = new Date(year, month0, 1 - first.getDay());
    var daysInMonth = new Date(year, month0 + 1, 0).getDate();
    var total = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
    var cells = [];
    for (var i = 0; i < total; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({
        date: dateStrOf(d.getFullYear(), d.getMonth() + 1, d.getDate()),
        day: d.getDate(),
        inMonth: d.getMonth() === month0
      });
    }
    return cells;
  }

  // =======================================================================
  // Browser-only code
  // =======================================================================

  function initBrowser() {
    var THEME_KEY = 'cisa-theme';
    var VIEW_KEY = 'cisa-calendar-view';
    var MAX_TILES = 6;

    var state = {
      occurrences: [],  // expanded + sorted occurrences
      skips: [],        // YYYY-MM-DD dates a recurring event skips
      view: 'month',    // calendar view: 'month' | 'list'
      cursorYear: 0,
      cursorMonth: 0,   // 0-based
      selectedDate: null
    };

    document.addEventListener('DOMContentLoaded', function () {
      wireStaticUI();
      wireThemeToggle();
      wireMenu();
      loadEvents();
      loadBoard();
      loadFounders();
    });

    function wireStaticUI() {
      var year = document.getElementById('footer-year');
      if (year) year.textContent = String(new Date().getFullYear());
    }

    function safeLocalGet(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeLocalSet(key, val) {
      try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
    }

    function getJson(url) {
      return fetch(url, { cache: 'no-cache' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }

    // ---------------- Theme toggle ----------------

    function wireThemeToggle() {
      var btn = document.getElementById('theme-toggle');
      var metaThemeColor = document.querySelector('meta[name="theme-color"]');
      var mql = null;
      try { mql = window.matchMedia('(prefers-color-scheme: light)'); } catch (e) { mql = null; }

      function systemPrefersLight() {
        return !!(mql && mql.matches);
      }

      function applyLabelAndMeta(theme) {
        if (btn) btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
        if (metaThemeColor) metaThemeColor.setAttribute('content', theme === 'light' ? '#0b1f3a' : '#070e1c');
      }

      var current = resolveTheme(safeLocalGet(THEME_KEY), systemPrefersLight());
      applyLabelAndMeta(current);

      if (btn) {
        btn.addEventListener('click', function () {
          current = nextTheme(current);
          document.documentElement.setAttribute('data-theme', current);
          safeLocalSet(THEME_KEY, current);
          applyLabelAndMeta(current);
        });
      }

      if (mql) {
        var onSystemChange = function () {
          var stored = safeLocalGet(THEME_KEY);
          if (stored === 'light' || stored === 'dark') return; // explicit choice wins
          current = resolveTheme(null, systemPrefersLight());
          applyLabelAndMeta(current);
        };
        if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
        else if (mql.addListener) mql.addListener(onSystemChange); // older Safari
      }
    }

    // ---------------- Mobile menu ----------------

    function wireMenu() {
      var btn = document.getElementById('menu-toggle');
      var nav = document.getElementById('site-nav');
      if (!btn || !nav) return;
      function setOpen(open) {
        nav.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      btn.addEventListener('click', function () {
        setOpen(btn.getAttribute('aria-expanded') !== 'true');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
          setOpen(false);
          btn.focus();
        }
      });
    }

    // ---------------- Events ----------------

    function loadEvents() {
      getJson('./data/events.json')
        .then(function (data) {
          var events = Array.isArray(data.events) ? data.events : [];
          var all = [];
          var skips = [];
          events.forEach(function (ev) {
            expandRepeat(ev).forEach(function (occ) { all.push(occ); });
            if (ev.repeat && Array.isArray(ev.repeat.skip)) skips = skips.concat(ev.repeat.skip);
          });
          all.sort(function (a, b) {
            return parseLocal(a.date, a.start || '00:00') - parseLocal(b.date, b.start || '00:00');
          });
          state.occurrences = all;
          state.skips = skips.sort();
          renderEvents();
        })
        .catch(function (err) {
          console.error('Failed to load events.json', err);
          var msg = '<p class="empty-msg">Could not load the schedule right now. Check <a href="https://www.instagram.com/abingtoncisa">Instagram</a> for dates.</p>';
          setHtml('date-tiles', msg);
          setHtml('cal-body', msg);
        });
    }

    function upcomingOccurrences() {
      var now = new Date();
      return state.occurrences.filter(function (occ) {
        if (occ.cancelled) return false;
        return parseLocal(occ.date, occ.end || occ.start || '23:59') >= now;
      });
    }

    function icsHref(occs) {
      return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(toIcsCalendar(occs));
    }

    function shortDate(d) {
      return WEEKDAY_SHORT_TITLE[d.getDay()] + ', ' + MONTH_ABBR[d.getMonth()] + ' ' + d.getDate();
    }

    function renderEvents() {
      var upcoming = upcomingOccurrences();
      var next = upcoming[0] || null;
      renderTicket(next);
      renderCta(next);
      renderTiles(upcoming);
      renderSkipNote();
      initCalendar();
    }

    function renderTicket(next) {
      var el = document.getElementById('ticket');
      if (!el) return;
      if (!next) {
        el.innerHTML = '<div class="ticket-head"><span class="ticket-kicker">Next session</span>' +
          '<span class="ticket-title">Dates coming soon</span>' +
          '<span class="ticket-sub">Follow <a href="https://www.instagram.com/abingtoncisa">@abingtoncisa</a> for the next announcement.</span></div>';
        return;
      }
      var d = parseLocal(next.date, next.start || '00:00');
      var days = daysUntil(next.date, new Date());
      var html = '';
      html += '<div class="ticket-head">';
      html += '<span class="ticket-kicker">Next session · ' + escapeHtml(relativeDayLabel(days)) + '</span>';
      html += '<span class="ticket-title">' + escapeHtml(next.title) + '</span>';
      if (next.summary) html += '<span class="ticket-sub">' + escapeHtml(next.summary) + '</span>';
      html += '</div>';
      html += '<dl class="ticket-facts">';
      html += '<div><dt>Date</dt><dd>' + escapeHtml(shortDate(d)) + '</dd></div>';
      html += '<div><dt>Time</dt><dd>' + escapeHtml(next.start ? fmtTime(next.start) : 'All day') + '</dd></div>';
      html += '<div><dt>Room</dt><dd>' + escapeHtml(next.location || 'TBA') + '</dd></div>';
      html += '</dl>';
      html += '<div class="ticket-foot">';
      html += '<span>' + escapeHtml(next.start && next.end ? fmtTime(next.start, next.end) : 'Open to every Abington student.') + '</span>';
      html += '<span class="ticket-actions">';
      html += '<a class="btn btn-dark btn-sm" href="' + escapeHtml(toGCal(next)) + '" target="_blank" rel="noopener">Google Calendar</a>';
      html += '<a class="btn btn-line btn-sm" href="' + icsHref([next]) + '" download="cisa-' + escapeHtml(next.occId || next.id) + '.ics">.ics</a>';
      html += '</span></div>';
      el.innerHTML = html;

      var heroCal = document.getElementById('hero-cal');
      if (heroCal) setExternal(heroCal, toGCal(next));
    }

    function renderCta(next) {
      var title = document.getElementById('cta-title');
      var meta = document.getElementById('cta-meta');
      var btn = document.getElementById('cta-cal');
      if (!title) return;
      if (!next) {
        title.textContent = 'See you at the next session.';
        if (meta) meta.textContent = 'Dates are announced on Instagram and Penn State Discover.';
        if (btn) btn.hidden = true;
        return;
      }
      var d = parseLocal(next.date, next.start || '00:00');
      var days = daysUntil(next.date, new Date());
      title.textContent = days === 0 ? 'See you today.' : 'See you ' + WEEKDAY_NAMES[d.getDay()] + ', ' + MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() + '.';
      var bits = [];
      if (next.start) bits.push(fmtTime(next.start));
      if (next.location) bits.push(next.location);
      bits.push('Bring a friend.');
      if (meta) meta.textContent = bits.join(' · ');
      if (btn) setExternal(btn, toGCal(next));
    }

    function renderTiles(upcoming) {
      var el = document.getElementById('date-tiles');
      var all = document.getElementById('all-dates');
      if (!el) return;
      if (upcoming.length === 0) {
        el.innerHTML = '<p class="empty-msg">No sessions scheduled yet. Check <a href="https://www.instagram.com/abingtoncisa">Instagram</a> for updates.</p>';
        if (all) all.hidden = true;
        return;
      }
      var shown = upcoming.slice(0, MAX_TILES);
      var html = '';
      shown.forEach(function (occ, i) {
        var d = parseLocal(occ.date, occ.start || '00:00');
        var isLast = i === upcoming.length - 1;
        var tag = i === 0 ? 'Next up' : (isLast ? 'Last one' : WEEKDAY_NAMES[d.getDay()]);
        var meta = [];
        if (occ.start) meta.push(fmtTime(occ.start, occ.end));
        if (occ.location) meta.push(occ.location);
        html += '<article class="tile' + (i === 0 ? ' tile-next' : '') + '">';
        html += '<span class="tile-tag">' + escapeHtml(tag) + '</span>';
        html += '<span class="tile-day">' + d.getDate() + '</span>';
        html += '<span class="tile-mon">' + escapeHtml(MONTH_NAMES[d.getMonth()]) + '</span>';
        html += '<span class="tile-title">' + escapeHtml(occ.title.split(' \u2014 ')[0]) + '</span>';
        html += '<span class="tile-meta">' + meta.map(escapeHtml).join('<br>') + '</span>';
        html += '<a class="tile-cal" href="' + escapeHtml(toGCal(occ)) + '" target="_blank" rel="noopener" aria-label="Add ' + escapeHtml(occ.title + ' on ' + fmtDate(d)) + ' to Google Calendar">+ Calendar</a>';
        html += '</article>';
      });
      el.innerHTML = html;
      if (all) {
        all.hidden = false;
        all.setAttribute('href', icsHref(upcoming));
        all.setAttribute('download', 'cisa-sessions.ics');
      }
    }

    function renderSkipNote() {
      var el = document.getElementById('skip-note');
      if (!el) return;
      var now = new Date();
      var todayStr = dateStrOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
      var future = state.skips.filter(function (s) { return s >= todayStr; });
      var parts = [];
      if (future.length) {
        parts.push('No session on ' + joinNames(future.map(function (s) {
          var d = parseLocal(s);
          return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate();
        })) + '.');
      }
      parts.push('Missed one? The slides and write-ups are online, so you can catch up and still come to the next.');
      el.textContent = parts.join(' ');
    }

    // ---------------- Calendar (month + list) ----------------

    function initCalendar() {
      var now = new Date();
      state.cursorYear = now.getFullYear();
      state.cursorMonth = now.getMonth();
      var stored = safeLocalGet(VIEW_KEY);
      state.view = (stored === 'month' || stored === 'list') ? stored
        : (window.innerWidth >= 720 ? 'month' : 'list');

      var toggle = document.getElementById('view-toggle');
      if (toggle) {
        toggle.querySelectorAll('button[data-view]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            state.view = btn.getAttribute('data-view');
            state.selectedDate = null;
            safeLocalSet(VIEW_KEY, state.view);
            renderCalendar();
          });
        });
      }
      bindClick('cal-prev', function () { shiftMonth(-1); });
      bindClick('cal-next', function () { shiftMonth(1); });
      bindClick('cal-today', function () {
        var today = new Date();
        state.cursorYear = today.getFullYear();
        state.cursorMonth = today.getMonth();
        state.selectedDate = null;
        renderCalendar();
      });
      renderCalendar();
    }

    function bindClick(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }

    function shiftMonth(delta) {
      var d = new Date(state.cursorYear, state.cursorMonth + delta, 1);
      state.cursorYear = d.getFullYear();
      state.cursorMonth = d.getMonth();
      state.selectedDate = null;
      renderCalendar();
    }

    function occurrencesOn(dateStr) {
      return state.occurrences.filter(function (o) { return o.date === dateStr; });
    }

    function renderCalendar() {
      var body = document.getElementById('cal-body');
      var nav = document.querySelector('.cal-nav');
      var toggle = document.getElementById('view-toggle');
      if (!body) return;
      if (toggle) {
        toggle.querySelectorAll('button[data-view]').forEach(function (btn) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-view') === state.view));
        });
      }
      if (nav) nav.classList.toggle('is-list', state.view === 'list');
      if (state.view === 'list') {
        var heading = document.getElementById('cal-heading');
        if (heading) heading.textContent = 'All events';
        renderList(body);
      } else {
        renderMonth(body);
      }
      renderDetail();
    }

    function renderMonth(body) {
      var heading = document.getElementById('cal-heading');
      if (heading) heading.textContent = MONTH_NAMES[state.cursorMonth] + ' ' + state.cursorYear;
      var now = new Date();
      var todayStr = dateStrOf(now.getFullYear(), now.getMonth() + 1, now.getDate());

      var html = '<div class="month-grid">';
      WEEKDAY_SHORT_TITLE.forEach(function (wd) { html += '<div class="wd" aria-hidden="true">' + wd + '</div>'; });
      monthGridCells(state.cursorYear, state.cursorMonth).forEach(function (cell) {
        var occs = occurrencesOn(cell.date);
        var cls = 'day-cell' + (cell.inMonth ? '' : ' dim') + (cell.date === todayStr ? ' today' : '') +
          (cell.date === state.selectedDate ? ' selected' : '');
        if (occs.length === 0) {
          html += '<div class="' + cls + '"><span class="day-num">' + cell.day + '</span></div>';
          return;
        }
        var d = parseLocal(cell.date);
        var label = fmtDate(d) + ': ' + occs.map(function (o) { return o.title + (o.cancelled ? ' (cancelled)' : ''); }).join(', ');
        html += '<button type="button" class="' + cls + ' has-events" data-date="' + cell.date + '" aria-label="' + escapeHtml(label) + '">';
        html += '<span class="day-num">' + cell.day + '</span>';
        occs.slice(0, 3).forEach(function (o) {
          html += '<span class="day-chip type-' + typeSlug(o.type) + (o.cancelled ? ' cancelled' : '') + '">' +
            escapeHtml(o.title.split(' — ')[0]) + '</span>';
        });
        if (occs.length > 3) html += '<span class="day-more">+' + (occs.length - 3) + ' more</span>';
        html += '</button>';
      });
      html += '</div>';
      body.innerHTML = html;

      body.querySelectorAll('.day-cell.has-events').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var date = btn.getAttribute('data-date');
          state.selectedDate = state.selectedDate === date ? null : date;
          renderCalendar();
          if (state.selectedDate) {
            var panel = document.querySelector('.detail-panel');
            if (panel) panel.focus({ preventScroll: window.innerWidth >= 900 });
          }
        });
      });
    }

    function occurrenceLinks(occ, small) {
      var cls = 'btn btn-line' + (small ? ' btn-sm' : '');
      var html = '';
      if (occ.url && isSafeUrl(occ.url)) html += '<a class="' + cls + '" href="' + escapeHtml(occ.url) + '" target="_blank" rel="noopener">Details</a>';
      if (!occ.cancelled) {
        html += '<a class="' + cls + '" href="' + escapeHtml(toGCal(occ)) + '" target="_blank" rel="noopener">Google Calendar</a>';
        html += '<a class="' + cls + '" href="' + icsHref([occ]) + '" download="cisa-' + escapeHtml(occ.occId || occ.id) + '.ics">.ics</a>';
      }
      return html;
    }

    function renderDetail() {
      var slot = document.getElementById('cal-detail');
      var wrap = document.getElementById('cal-wrap');
      if (!slot) return;
      var occs = state.view === 'month' && state.selectedDate ? occurrencesOn(state.selectedDate) : [];
      if (wrap) wrap.classList.toggle('has-detail', occs.length > 0);
      if (occs.length === 0) { slot.innerHTML = ''; return; }

      var d = parseLocal(state.selectedDate);
      var html = '<div class="detail-panel" tabindex="-1" role="region" aria-label="Events on ' + escapeHtml(fmtDate(d)) + '">';
      html += '<div class="detail-top"><span class="detail-date">' + escapeHtml(fmtDate(d)) + '</span>';
      html += '<button type="button" class="detail-close" aria-label="Close event details">&times;</button></div>';
      occs.forEach(function (o) {
        html += '<article class="detail-event">';
        html += '<span class="type-badge type-' + typeSlug(o.type) + '">' + escapeHtml(TYPE_LABELS[o.type] || 'Other') + '</span>';
        if (o.cancelled) html += '<span class="cancelled-badge">Cancelled</span>';
        html += '<h4' + (o.cancelled ? ' class="is-cancelled"' : '') + '>' + escapeHtml(o.title) + '</h4>';
        var meta = [];
        if (o.start) meta.push(fmtTime(o.start, o.end));
        if (o.location) meta.push(o.location);
        if (meta.length) html += '<p class="detail-meta">' + escapeHtml(meta.join(' · ')) + '</p>';
        if (o.description || o.summary) html += '<p>' + escapeHtml(o.description || o.summary) + '</p>';
        if (o.tags && o.tags.length) {
          html += '<ul class="detail-tags">' + o.tags.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>';
        }
        html += '<div class="detail-links">' + occurrenceLinks(o, true) + '</div>';
        html += '</article>';
      });
      html += '</div>';
      slot.innerHTML = html;
      var close = slot.querySelector('.detail-close');
      if (close) {
        close.addEventListener('click', function () {
          var date = state.selectedDate;
          state.selectedDate = null;
          renderCalendar();
          var cell = document.querySelector('.day-cell[data-date="' + date + '"]');
          if (cell) cell.focus();
        });
      }
    }

    function renderList(body) {
      var now = new Date();
      var upcoming = [];
      var past = [];
      state.occurrences.forEach(function (o) {
        if (parseLocal(o.date, o.end || o.start || '23:59') >= now) upcoming.push(o); else past.push(o);
      });
      var html = '<div class="event-list">';
      if (upcoming.length === 0) {
        html += '<p class="empty-msg">No upcoming events yet. Check <a href="https://www.instagram.com/abingtoncisa">Instagram</a> for updates.</p>';
      } else {
        html += upcoming.map(eventRow).join('');
      }
      if (past.length) {
        html += '<details class="past"><summary>Past events (' + past.length + ')</summary>' +
          past.slice().reverse().map(eventRow).join('') + '</details>';
      }
      html += '</div>';
      body.innerHTML = html;
    }

    function eventRow(o) {
      var d = parseLocal(o.date, o.start || '00:00');
      var meta = [WEEKDAY_NAMES[d.getDay()]];
      if (o.start) meta.push(fmtTime(o.start, o.end));
      if (o.location) meta.push(o.location);
      var html = '<article class="event-row">';
      html += '<div class="row-date"><span class="row-mon">' + MONTH_ABBR[d.getMonth()] + '</span><span class="row-day">' + d.getDate() + '</span></div>';
      html += '<div class="row-body">';
      html += '<h4' + (o.cancelled ? ' class="is-cancelled"' : '') + '><span class="legend-dot type-' + typeSlug(o.type) + '" aria-hidden="true"></span>' +
        escapeHtml(o.title) + (o.cancelled ? ' <span class="cancelled-badge">Cancelled</span>' : '') + '</h4>';
      html += '<p class="row-meta">' + escapeHtml(meta.join(' · ')) + '</p>';
      if (o.summary) html += '<p class="row-summary">' + escapeHtml(o.summary) + '</p>';
      html += '</div>';
      html += '<div class="row-links">' + occurrenceLinks(o, true) + '</div>';
      html += '</article>';
      return html;
    }

    // ---------------- People ----------------

    function loadBoard() {
      getJson('./data/board.json')
        .then(function (data) {
          var split = splitBoard(Array.isArray(data.members) ? data.members : []);
          renderBoard(split.people);
          renderAdvisors(split.advisors);
        })
        .catch(function (err) {
          console.error('Failed to load board.json', err);
          setHtml('board-grid', '<p class="empty-msg">Could not load the e-board right now.</p>');
        });
    }

    function personLinks(m) {
      var links = [];
      if (m.email && isSafeUrl('mailto:' + m.email)) links.push('<a href="mailto:' + escapeHtml(m.email) + '">Email</a>');
      if (m.linkedin && isSafeUrl(m.linkedin)) links.push('<br><a href="' + escapeHtml(m.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>');
      if (m.portfolio && isSafeUrl(m.portfolio)) links.push('<a href="' + escapeHtml(m.portfolio) + '" target="_blank" rel="noopener">Portfolio</a>');
      return links.length ? '<span class="person-links">' + links.join('') + '</span>' : '';
    }

    function renderBoard(people) {
      var el = document.getElementById('board-grid');
      if (!el) return;
      if (people.length === 0) {
        el.innerHTML = '<p class="empty-msg">E-board information is not available right now.</p>';
        return;
      }
      el.innerHTML = people.map(function (m) {
        var src = m.photo ? 'assets/img/board/' + m.photo : 'assets/img/avatar-placeholder.svg';
        return '<article class="person">' +
          '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(m.name) + '" loading="lazy" width="160" height="160">' +
          '<h3>' + escapeHtml(m.name) + '</h3>' +
          '<span class="person-role">' + escapeHtml(m.role) + '</span>' +
          personLinks(m) +
          '</article>';
      }).join('');
    }

    function renderAdvisors(advisors) {
      var el = document.getElementById('advisors');
      if (!el) return;
      if (advisors.length === 0) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = 'Faculty advisors: ' + joinNames(advisors.map(function (a) {
        return a.email && isSafeUrl('mailto:' + a.email)
          ? '<a href="mailto:' + escapeHtml(a.email) + '">' + escapeHtml(a.name) + '</a>'
          : escapeHtml(a.name);
      })) + '.';
    }

    function loadFounders() {
      getJson('./data/founders.json')
        .then(function (data) {
          renderFounders(Array.isArray(data.founders) ? data.founders : []);
        })
        .catch(function (err) {
          console.error('Failed to load founders.json', err);
        });
    }

    function renderFounders(founders) {
      var box = document.getElementById('founders');
      var el = document.getElementById('founders-text');
      if (!box || !el) return;
      var withJobs = founders.filter(function (f) { return f.title || f.org; });
      if (withJobs.length === 0) { box.hidden = true; return; }
      el.innerHTML = withJobs.map(function (f) {
        var job = [f.title, f.org].filter(Boolean).join(' at ');
        var name = f.linkedin && isSafeUrl(f.linkedin)
          ? '<a href="' + escapeHtml(f.linkedin) + '" target="_blank" rel="noopener">' + escapeHtml(f.name) + '</a>'
          : escapeHtml(f.name);
        return name + ', ' + escapeHtml(job) + '.';
      }).join(' ');
      box.hidden = false;
    }

    function setExternal(link, href) {
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }

    function setHtml(id, html) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }
  }

  if (typeof document !== 'undefined') {
    initBrowser();
  }

  // =======================================================================
  // Node export (guarded so the browser ignores it)
  // =======================================================================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseLocal: parseLocal,
      addDaysToDateStr: addDaysToDateStr,
      expandRepeat: expandRepeat,
      fmtDate: fmtDate,
      fmtTime: fmtTime,
      fmtTime12: fmtTime12,
      toGCal: toGCal,
      toGCalDatesParam: toGCalDatesParam,
      toIcs: toIcs,
      toIcsCalendar: toIcsCalendar,
      typeSlug: typeSlug,
      monthGridCells: monthGridCells,
      icsEscape: icsEscape,
      foldLine: foldLine,
      escapeHtml: escapeHtml,
      isSafeUrl: isSafeUrl,
      resolveTheme: resolveTheme,
      nextTheme: nextTheme,
      daysUntil: daysUntil,
      relativeDayLabel: relativeDayLabel,
      splitBoard: splitBoard,
      joinNames: joinNames
    };
  }
})(typeof window !== 'undefined' ? window : this);
