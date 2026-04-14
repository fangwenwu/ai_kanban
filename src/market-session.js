function isWeekend(day) {
  return day === 0 || day === 6;
}

function withTime(base, hours, minutes, seconds = 0) {
  const next = new Date(base);
  next.setHours(hours, minutes, seconds, 0);
  return next;
}

function getNextWeekdayMorning(base) {
  const next = new Date(base);
  next.setDate(next.getDate() + 1);

  while (isWeekend(next.getDay())) {
    next.setDate(next.getDate() + 1);
  }

  return withTime(next, 9, 30);
}

export function getMarketPhase(now) {
  if (isWeekend(now.getDay())) {
    return "weekend";
  }

  const current = now.getHours() * 60 + now.getMinutes();
  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;

  if (current < morningOpen) {
    return "pre_open";
  }

  if (current < morningClose) {
    return "trading";
  }

  if (current < afternoonOpen) {
    return "lunch_break";
  }

  if (current < afternoonClose) {
    return "trading";
  }

  return "closed";
}

export function isTradingSession(now) {
  return getMarketPhase(now) === "trading";
}

export function getNextMarketBoundary(now) {
  const phase = getMarketPhase(now);

  if (phase === "weekend") {
    return getNextWeekdayMorning(now);
  }

  if (phase === "pre_open") {
    return withTime(now, 9, 30);
  }

  if (phase === "lunch_break") {
    return withTime(now, 13, 0);
  }

  if (phase === "trading") {
    const current = now.getHours() * 60 + now.getMinutes();
    return current < 11 * 60 + 30 ? withTime(now, 11, 30) : withTime(now, 15, 0);
  }

  return getNextWeekdayMorning(now);
}
