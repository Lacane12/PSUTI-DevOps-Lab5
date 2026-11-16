export const PAGE_SIZE = 8;

export function validateFilters(filters) {
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    return 'Дата "С" не может быть позже даты "По".';
  }
  if (filters.price_min !== '' && filters.price_max !== '' && Number(filters.price_min) > Number(filters.price_max)) {
    return 'Минимальная цена не может быть больше максимальной.';
  }
  return '';
}

export function buildEventsQuery(filters, sort = 'starts_at', page = 1) {
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), include: 'venue,artist', sort });
  for (const key of ['genre_code', 'price_min', 'price_max']) {
    if (filters[key] !== '' && filters[key] != null) query.set(key, filters[key]);
  }
  if (filters.date_from) query.set('starts_from', `${filters.date_from}T00:00:00+03:00`);
  if (filters.date_to) {
    // starts_to is exclusive: the next midnight includes the entire selected day.
    const nextDay = new Date(`${filters.date_to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query.set('starts_to', `${nextDay.toISOString().slice(0, 10)}T00:00:00+03:00`);
  }
  return query;
}

export async function fetchJson(path, signal) {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Сервер вернул HTTP ${response.status}.`);
  return response.json();
}
