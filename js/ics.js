/**
 * Lê calendários .ics e CSV no navegador.
 * Cobre o que grade de faculdade costuma exportar: recorrência semanal,
 * EXDATE, dia inteiro e fuso no DTSTART.
 */

const WEEKDAY_CODE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const WEEKDAY_NAME = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1, 'segunda-feira': 1,
  terca: 2, terça: 2, ter: 2, 'terca-feira': 2, 'terça-feira': 2,
  quarta: 3, qua: 3, 'quarta-feira': 3,
  quinta: 4, qui: 4, 'quinta-feira': 4,
  sexta: 5, sex: 5, 'sexta-feira': 5,
  sabado: 6, sábado: 6, sab: 6, sáb: 6,
};

export function unfoldIcs(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function parseProperty(line) {
  const split = line.indexOf(':');
  if (split < 0) return null;
  const left = line.slice(0, split);
  const value = line.slice(split + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq < 0) params[part.toUpperCase()] = true;
    else params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name, params, value };
}

function parseStamp(value, params) {
  const raw = String(value || '').trim();
  const dateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(raw);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] == null ? 0 : Number(match[4]),
    minute: match[5] == null ? 0 : Number(match[5]),
    allDay: dateOnly,
    utc: match[7] === 'Z',
    tzid: params.TZID ? params.TZID.replace(/^"(.*)"$/, '$1') : '',
  };
}

function parseDuration(value) {
  const match = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return ((days * 24 + hours) * 60) + minutes;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatStamp(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function offsetMinutes(timeZone, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) parts[part.type] = part.value;
  let hour = Number(parts.hour);
  let day = Number(parts.day);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, day, hour, Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - utcMs) / 60000);
}

function wallToUtc(stamp, timeZone) {
  if (!timeZone) return Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute);
  let utc = Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = offsetMinutes(timeZone, utc);
    const next = Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute) - offset * 60000;
    if (Math.abs(next - utc) < 60000) return next;
    utc = next;
  }
  return utc;
}

function utcToWall(utcMs, timeZone) {
  const shifted = utcMs + offsetMinutes(timeZone, utcMs) * 60000;
  return new Date(shifted);
}

function stampToWall(stamp, displayZone) {
  if (stamp.allDay) {
    return new Date(Date.UTC(stamp.year, stamp.month - 1, stamp.day, 0, 0));
  }
  if (!stamp.utc && (!stamp.tzid || stamp.tzid === displayZone)) {
    return new Date(Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute));
  }
  const sourceZone = stamp.utc ? 'UTC' : stamp.tzid;
  try {
    const utc = wallToUtc(stamp, sourceZone);
    return utcToWall(utc, displayZone || 'UTC');
  } catch {
    return new Date(Date.UTC(stamp.year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute));
  }
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseRule(value) {
  const rule = { freq: '', interval: 1, count: null, until: null, byday: [] };
  for (const part of String(value || '').split(';')) {
    const [key, raw] = part.split('=');
    const name = (key || '').toUpperCase();
    if (name === 'FREQ') rule.freq = (raw || '').toUpperCase();
    if (name === 'INTERVAL') rule.interval = Math.max(1, Number(raw) || 1);
    if (name === 'COUNT') rule.count = Math.max(1, Number(raw) || 1);
    if (name === 'UNTIL') rule.until = parseStamp(raw, {});
    if (name === 'BYDAY') rule.byday = raw ? raw.split(',').map((day) => day.trim().toUpperCase()) : [];
  }
  return rule;
}

function sameInstant(a, b) {
  return a.getTime() === b.getTime();
}

function expandWeekly(start, rule, horizonEnd) {
  const days = rule.byday.length
    ? rule.byday.map((code) => WEEKDAY_CODE[code.slice(-2)]).filter((day) => day != null)
    : [start.getUTCDay()];
  const out = [];
  let week = 0;
  while (out.length < (rule.count || 400) && week < 520) {
    const weekStart = addDays(start, -start.getUTCDay() + week * 7 * rule.interval);
    for (const day of [...days].sort((a, b) => a - b)) {
      const date = addDays(weekStart, day);
      date.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), 0, 0);
      if (date < start) continue;
      if (rule.until) {
        const until = stampToWall(rule.until, 'UTC');
        if (date > until) return out;
      }
      if (date > horizonEnd) return out;
      out.push(date);
      if (rule.count && out.length >= rule.count) return out;
    }
    week += 1;
    if (!rule.count && !rule.until && week > 80) break;
  }
  return out;
}

function expandDaily(start, rule, horizonEnd) {
  const out = [];
  let cursor = new Date(start.getTime());
  while (out.length < (rule.count || 400)) {
    if (rule.until && cursor > stampToWall(rule.until, 'UTC')) break;
    if (cursor > horizonEnd) break;
    out.push(new Date(cursor.getTime()));
    cursor = addDays(cursor, rule.interval);
    if (!rule.count && !rule.until && out.length > 370) break;
  }
  return out;
}

function instancesOf(event, horizonStart, horizonEnd) {
  const start = event.startWall;
  if (!event.rule) {
    if (start > horizonEnd || event.endWall < horizonStart) return [];
    return [start];
  }
  const freq = event.rule.freq;
  if (freq === 'DAILY') return expandDaily(start, event.rule, horizonEnd);
  if (freq === 'WEEKLY') return expandWeekly(start, event.rule, horizonEnd);
  if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const step = freq === 'YEARLY' ? 12 : event.rule.interval;
    const out = [];
    let cursor = new Date(start.getTime());
    while (out.length < (event.rule.count || 48)) {
      if (event.rule.until && cursor > stampToWall(event.rule.until, 'UTC')) break;
      if (cursor > horizonEnd) break;
      if (cursor >= start) out.push(new Date(cursor.getTime()));
      cursor.setUTCMonth(cursor.getUTCMonth() + step);
      if (!event.rule.count && !event.rule.until && out.length > 24) break;
    }
    return out;
  }
  return [start];
}

function readEvents(text) {
  const lines = unfoldIcs(text).split('\n');
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { props: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseProperty(line);
    if (prop) current.props.push(prop);
  }
  return events;
}

function prop(event, name) {
  return event.props.find((item) => item.name === name) || null;
}

function props(event, name) {
  return event.props.filter((item) => item.name === name);
}

export function parseIcs(text, options = {}) {
  const timeZone = options.timeZone || 'UTC';
  const horizonStart = options.from ? new Date(`${options.from}T00:00:00Z`) : new Date(Date.UTC(2020, 0, 1));
  const horizonEnd = options.until ? new Date(`${options.until}T23:59:00Z`) : addDays(new Date(), 400);
  const rawEvents = readEvents(text);
  const masters = [];
  const overrides = [];

  for (const event of rawEvents) {
    const dtStart = prop(event, 'DTSTART');
    if (!dtStart) continue;
    const startStamp = parseStamp(dtStart.value, dtStart.params);
    if (!startStamp) continue;
    const dtEnd = prop(event, 'DTEND');
    const duration = prop(event, 'DURATION');
    let endStamp = dtEnd ? parseStamp(dtEnd.value, dtEnd.params) : null;
    const startWall = stampToWall(startStamp, timeZone);
    let endWall = endStamp ? stampToWall(endStamp, timeZone) : null;
    if (!endWall) {
      const minutes = duration ? parseDuration(duration.value) : (startStamp.allDay ? 24 * 60 : 60);
      endWall = new Date(startWall.getTime() + (minutes || 60) * 60000);
    }
    const recurrence = prop(event, 'RECURRENCE-ID');
    const record = {
      uid: prop(event, 'UID')?.value || `evt-${masters.length + overrides.length}`,
      title: (prop(event, 'SUMMARY')?.value || 'Compromisso').replace(/\\n/g, ' ').replace(/\\,/g, ','),
      startWall,
      endWall,
      allDay: startStamp.allDay,
      minutes: Math.max(15, Math.round((endWall - startWall) / 60000)),
      rule: prop(event, 'RRULE') ? parseRule(prop(event, 'RRULE').value) : null,
      exdates: props(event, 'EXDATE').flatMap((item) => item.value.split(',').map((value) => {
        const stamp = parseStamp(value.trim(), item.params);
        return stamp ? stampToWall(stamp, timeZone) : null;
      })).filter(Boolean),
      recurrenceId: recurrence ? stampToWall(parseStamp(recurrence.value, recurrence.params), timeZone) : null,
    };
    if (record.recurrenceId) overrides.push(record);
    else masters.push(record);
  }

  const busy = [];
  for (const master of masters) {
    const skips = new Set(master.exdates.map((date) => date.getTime()));
    for (const override of overrides) {
      if (override.uid === master.uid && override.recurrenceId) skips.add(override.recurrenceId.getTime());
    }
    for (const start of instancesOf(master, horizonStart, horizonEnd)) {
      if (start < horizonStart || start > horizonEnd) continue;
      if (skips.has(start.getTime())) continue;
      const end = new Date(start.getTime() + master.minutes * 60000);
      busy.push({
        id: `${master.uid}-${start.getTime()}`,
        uid: master.uid,
        title: master.title,
        start: formatStamp(start),
        end: formatStamp(end),
        allDay: master.allDay,
        source: 'ics',
      });
    }
  }
  for (const override of overrides) {
    if (override.startWall < horizonStart || override.startWall > horizonEnd) continue;
    busy.push({
      id: `${override.uid}-override-${override.startWall.getTime()}`,
      uid: override.uid,
      title: override.title,
      start: formatStamp(override.startWall),
      end: formatStamp(override.endWall),
      allDay: override.allDay,
      source: 'ics',
    });
  }
  return busy;
}

export function weekdayFromLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (/^\d$/.test(key)) return Number(key);
  return Object.prototype.hasOwnProperty.call(WEEKDAY_NAME, key) ? WEEKDAY_NAME[key] : null;
}

export function parseCsvSchedule(text) {
  const manual = [];
  const dated = [];
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^dia\b/i.test(line) || /^data\b/i.test(line)) continue;
    const cells = line.split(/[;,|\t]/).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const [first, start, end, ...nameParts] = cells;
    const title = nameParts.join(' ').trim();
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || title.length < 2) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(first)) {
      dated.push({
        id: `csv-${first}-${start}`.replace(/[^\w-]/g, ''),
        title,
        start: `${first}T${start}`,
        end: `${first}T${end}`,
        allDay: false,
        source: 'csv',
      });
      continue;
    }
    const weekday = weekdayFromLabel(first);
    if (weekday == null) continue;
    manual.push({ weekday, start, end, title });
  }
  return { manual, dated };
}
