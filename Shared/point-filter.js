// Reserve is a label, never inferred from a zero value, test status or offline state.
// Delimiters include AKS separators; digits may follow a label (RES01 / Reserve2).
// Words such as Reservepumpe, Druckreserve or Freigabe are intentionally retained.
export function isReservePoint(point) {
  return [point?.name, point?.description].some(value => {
    if (typeof value !== 'string') return false;
    const text = value.normalize('NFKC').toLowerCase();
    const marker = /(^|[^\p{L}\p{N}])(?:reserve|res|spare|unused|unbelegt|unbenutzt|nicht[\s_-]+(?:belegt|benutzt|verwendet)|not[\s_-]+used)\d*(?=$|[^\p{L}\p{N}])/gu;
    let match;
    while ((match = marker.exec(text))) {
      // A negated label is not a spare channel, e.g. "keine Reserve".
      if (!/(?:^|[^\p{L}\p{N}])(?:kein|keine|keinen|nicht|not|no)[\s_-]+$/u.test(text.slice(0, match.index + match[1].length))) return true;
    }
    return false;
  });
}

export function reservePointKeys(points) {
  if (!Array.isArray(points)) throw new Error('Datenpunktliste fehlt.');
  return points.filter(isReservePoint).map(point => point.key);
}

// Walk the full controller order even if the currently selected point is hidden.
// Only future selections use the filter. Existing selections/drafts are not edited.
export function nextInspectionPointKey({points, currentKey = '', direction = 1, hideReserve = false, matchingKeys = null}) {
  if (!Array.isArray(points) || ![1, -1].includes(direction) ||
      (matchingKeys !== null && !Array.isArray(matchingKeys))) throw new Error('Prüfreihenfolge ungültig.');
  const start = currentKey ? points.findIndex(point => point.key === currentKey) : direction === 1 ? -1 : points.length;
  if (currentKey && start < 0) throw new Error('Bisheriger Datenpunkt nicht mehr vorhanden. Erneut auswählen.');
  const matches = matchingKeys === null ? null : new Set(matchingKeys);
  for (let i = start + direction; i >= 0 && i < points.length; i += direction) {
    const point = points[i];
    if ((!hideReserve || !isReservePoint(point)) && (!matches || matches.has(point.key))) return point.key;
  }
  return '';
}
