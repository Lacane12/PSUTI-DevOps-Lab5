import { buildEventsQuery, fetchJson, PAGE_SIZE, validateFilters } from './api.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#filters');
const events = $('#events');
const genreSelect = $('#genre');
const sortSelect = $('#sort');
const emptyFilters = () => ({ genre_code: '', date_from: '', date_to: '', price_min: '', price_max: '' });
const state = { filters: emptyFilters(), sort: 'starts_at', page: 1, total: 0, genres: new Map(), requestId: 0, controller: null };
const timeZone = 'Europe/Moscow';
const formatter = (options) => new Intl.DateTimeFormat('ru-RU', { timeZone, ...options });
const dayFormat = formatter({ day: '2-digit' });
const monthFormat = formatter({ month: 'short' });
const yearFormat = formatter({ year: 'numeric' });
const timeFormat = formatter({ hour: '2-digit', minute: '2-digit' });
const fullDateFormat = formatter({ day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
const shortDateFormat = formatter({ day: 'numeric', month: 'short', year: 'numeric' });
const numberFormat = new Intl.NumberFormat('ru-RU');
const statusLabels = { draft: 'Черновик', cancelled: 'Отменено', archived: 'В архиве' };

function plural(value, words) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return words[2];
  const last = value % 10;
  return last === 1 ? words[0] : last >= 2 && last <= 4 ? words[1] : words[2];
}

function createCard(event) {
  const card = $('#event-template').content.firstElementChild.cloneNode(true);
  const setText = (selector, text) => { card.querySelector(selector).textContent = text; };
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  card.dataset.genre = event.genre_code;
  setText('.date-day', dayFormat.format(startsAt));
  setText('.date-month', monthFormat.format(startsAt).replace('.', ''));
  setText('.date-year', yearFormat.format(startsAt));
  card.querySelector('.event-date').title = fullDateFormat.format(startsAt);
  setText('.genre-tag', state.genres.get(event.genre_code) ?? event.genre_code);
  setText('.age-tag', `${event.age_rating}+`);
  if (event.status !== 'published') {
    const badge = card.querySelector('.status-tag');
    badge.hidden = false;
    badge.textContent = statusLabels[event.status] ?? event.status;
  }
  setText('.event-title', event.title);
  setText('.event-artist', event.artist?.name ?? '');
  card.querySelector('.event-artist').hidden = !event.artist?.name;
  const description = card.querySelector('.event-description');
  description.textContent = event.description ?? '';
  description.hidden = !event.description;
  setText('.event-place', event.venue?.name ?? 'Площадка не указана');
  setText('.event-address', event.venue?.formatted_address ?? '');
  const isSameDay = startsAt.toLocaleDateString('sv-SE', { timeZone }) === endsAt.toLocaleDateString('sv-SE', { timeZone });
  const end = isSameDay ? timeFormat.format(endsAt) : `${shortDateFormat.format(endsAt)}, ${timeFormat.format(endsAt)}`;
  setText('.event-time', `${fullDateFormat.format(startsAt)} · ${timeFormat.format(startsAt)} – ${end}`);
  setText('.price-value', event.price_rub === 0 ? 'Бесплатно' : `${numberFormat.format(event.price_rub)} ₽`);
  card.querySelector('.price-value').classList.toggle('is-free', event.price_rub === 0);
  let availability = 'Продажа недоступна';
  if (event.status === 'published') {
    availability = event.available_tickets > 0
      ? `${numberFormat.format(event.available_tickets)} ${plural(event.available_tickets, ['билет', 'билета', 'билетов'])} в наличии`
      : 'Билетов нет';
  }
  setText('.availability', availability);
  return card;
}

function renderSummary() {
  const filters = state.filters;
  const genre = state.genres.get(filters.genre_code) ?? 'Все жанры';
  const humanDate = (date) => shortDateFormat.format(new Date(`${date}T12:00:00+03:00`));
  let dates = 'Любые даты';
  if (filters.date_from && filters.date_to) dates = `${humanDate(filters.date_from)} – ${humanDate(filters.date_to)}`;
  else if (filters.date_from) dates = `С ${humanDate(filters.date_from)}`;
  else if (filters.date_to) dates = `По ${humanDate(filters.date_to)}`;
  let price = 'Любая цена';
  if (filters.price_min !== '' && filters.price_max !== '') price = `${numberFormat.format(filters.price_min)} – ${numberFormat.format(filters.price_max)} ₽`;
  else if (filters.price_min !== '') price = `От ${numberFormat.format(filters.price_min)} ₽`;
  else if (filters.price_max !== '') price = Number(filters.price_max) === 0 ? 'Бесплатно' : `До ${numberFormat.format(filters.price_max)} ₽`;
  $('#applied-filters').textContent = `${genre} · ${dates} · ${price}`;
}

function showMessage(title, text, action, handler) {
  $('#message-panel').hidden = false;
  $('#message-title').textContent = title;
  $('#message-text').textContent = text;
  $('#message-action').textContent = action;
  $('#message-action').onclick = handler;
}

async function loadEvents() {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;
  const timeout = setTimeout(() => controller.abort(), 15000);
  events.setAttribute('aria-busy', 'true');
  events.replaceChildren(...Array.from({ length: 3 }, () => {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    return skeleton;
  }));
  $('#result-count').textContent = 'Загружаем афишу…';
  $('#message-panel').hidden = true;
  $('#pagination').hidden = true;
  renderSummary();
  try {
    if (state.genres.size === 0) {
      const catalog = await fetchJson('/api/v1/meta/genres', controller.signal);
      if (requestId !== state.requestId) return;
      state.genres = new Map(catalog.data.map((genre) => [genre.code, genre.name]));
      genreSelect.replaceChildren(new Option('Все жанры', ''), ...catalog.data.map((genre) => new Option(genre.name, genre.code)));
      genreSelect.disabled = false;
    }
    const query = buildEventsQuery(state.filters, state.sort, state.page);
    const result = await fetchJson(`/api/v1/events?${query}`, controller.signal);
    if (requestId !== state.requestId) return;
    state.total = result.meta.total;
    events.replaceChildren(...result.data.map(createCard));
    $('#result-count').textContent = `${numberFormat.format(state.total)} ${plural(state.total, ['событие', 'события', 'событий'])}`;
    const pageCount = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $('#pagination').hidden = pageCount <= 1;
    $('#previous').disabled = state.page <= 1;
    $('#next').disabled = state.page >= pageCount;
    $('#page-number').textContent = `Страница ${state.page} из ${pageCount}`;
    if (state.total === 0) {
      showMessage('Пока ничего не нашлось', 'Попробуйте другой жанр, расширьте диапазон дат или измените бюджет.', 'Сбросить фильтры', resetFilters);
    }
    renderSummary();
  } catch (error) {
    if (requestId !== state.requestId) return;
    events.replaceChildren();
    $('#result-count').textContent = 'Не удалось загрузить события';
    const explanation = error.name === 'AbortError' ? 'Сервер долго не отвечает.' : error.message;
    showMessage('Афиша немного задерживается', `${explanation} Проверьте подключение и попробуйте ещё раз.`, 'Попробовать ещё раз', loadEvents);
  } finally {
    clearTimeout(timeout);
    if (requestId === state.requestId) events.setAttribute('aria-busy', 'false');
  }
}

function resetFilters() {
  form.reset();
  sortSelect.value = 'starts_at';
  state.filters = emptyFilters();
  state.sort = 'starts_at';
  state.page = 1;
  $('#validation-message').hidden = true;
  loadEvents();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const filters = { ...emptyFilters(), ...Object.fromEntries(new FormData(form)) };
  const message = validateFilters(filters);
  $('#validation-message').textContent = message;
  $('#validation-message').hidden = !message;
  if (message) return;
  state.filters = filters;
  state.page = 1;
  loadEvents();
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  state.page = 1;
  loadEvents();
});

$('#reset-filters').addEventListener('click', resetFilters);
for (const [selector, delta] of [['#previous', -1], ['#next', 1]]) {
  $(selector).addEventListener('click', () => {
    state.page += delta;
    loadEvents();
    $('#catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

loadEvents();
