import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventsQuery, validateFilters } from '../frontend/public/api.js';

const defaults = { genre_code: '', date_from: '', date_to: '', price_min: '', price_max: '' };

test('пустые фильтры не ограничивают каталог, а страница запрашивается на сервере', () => {
  const query = buildEventsQuery(defaults, 'starts_at', 3);
  assert.equal(query.get('page'), '3');
  assert.equal(query.get('include'), 'venue,artist');
  for (const name of ['genre_code', 'starts_from', 'starts_to', 'price_min', 'price_max']) {
    assert.equal(query.has(name), false);
  }
});

test('нулевая цена передаётся в API и не теряется как пустое значение', () => {
  const query = buildEventsQuery({ ...defaults, price_max: '0' }, 'price_rub');
  assert.equal(query.get('price_max'), '0');
  assert.equal(query.get('sort'), 'price_rub');
});

for (const [lastDay, exclusiveEnd] of [
  ['2027-03-20', '2027-03-21'],
  ['2026-12-31', '2027-01-01'],
  ['2028-02-29', '2028-03-01'],
]) {
  test(`день ${lastDay} включается полностью, с учётом перехода месяца и года`, () => {
    const query = buildEventsQuery({ ...defaults, date_from: lastDay, date_to: lastDay });
    assert.equal(query.get('starts_from'), `${lastDay}T00:00:00+03:00`);
    assert.equal(query.get('starts_to'), `${exclusiveEnd}T00:00:00+03:00`);
  });
}

test('комбинация фильтров и убывающая сортировка сохраняются при смене страницы', () => {
  const query = buildEventsQuery({ ...defaults, genre_code: 'concert', price_min: '500', price_max: '2000' }, '-price_rub', 2);
  assert.equal(query.get('genre_code'), 'concert');
  assert.equal(query.get('price_min'), '500');
  assert.equal(query.get('price_max'), '2000');
  assert.equal(query.get('sort'), '-price_rub');
  assert.equal(query.get('page'), '2');
});

test('обратные диапазоны отклоняются, равные границы разрешены', () => {
  assert.notEqual(validateFilters({ ...defaults, date_from: '2027-03-21', date_to: '2027-03-20' }), '');
  assert.notEqual(validateFilters({ ...defaults, price_min: '100', price_max: '0' }), '');
  assert.equal(validateFilters({ ...defaults, date_from: '2027-03-20', date_to: '2027-03-20', price_min: '0', price_max: '0' }), '');
});
