// Anonymous browsing: home, search (keywords, area, filters, dates) and a
// listing with a quote. Run against a seeded load database (see README.md).
//
//   docker run --rm --network host -v "$PWD/infra/load:/load" grafana/k6 run /load/search.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'http://localhost:3000';
const WORDS = ['tent', 'camera', 'drill', 'poles', 'projector', 'speaker', 'ladder', 'sherwani'];
const AREAS = [
  [18.5074, 73.8077],
  [18.559, 73.7868],
  [18.5679, 73.9143],
  [18.5089, 73.926],
];

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: Number(__ENV.VUS || 50) },
        { duration: __ENV.DURATION || '60s', target: Number(__ENV.VUS || 50) },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:search}': ['p(95)<300'],
    'http_req_duration{name:home}': ['p(95)<300'],
    'http_req_duration{name:listing}': ['p(95)<200'],
  },
};

// Each virtual user is a different phone on a different IP (the API caps
// public reads per IP), as in real traffic.
const ip = () => `10.${__VU % 250}.${Math.floor(__VU / 250)}.${(__ITER % 200) + 1}`;
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export default function () {
  const headers = { 'X-Forwarded-For': ip() };
  const [lat, lng] = AREAS[__VU % AREAS.length];

  const home = http.get(`${API}/v1/home?lat=${lat}&lng=${lng}`, {
    headers,
    tags: { name: 'home' },
  });
  check(home, { 'home 200': (r) => r.status === 200 });
  sleep(1);

  const q = WORDS[Math.floor(Math.random() * WORDS.length)];
  const dated = Math.random() < 0.3 ? `&startDate=${day(7)}&endDate=${day(9)}` : '';
  const search = http.get(
    `${API}/v1/search?q=${q}&lat=${lat}&lng=${lng}&radiusKm=10&sort=relevance${dated}`,
    { headers, tags: { name: 'search' } },
  );
  check(search, { 'search 200': (r) => r.status === 200 });
  const items = search.status === 200 ? search.json('items') : [];
  sleep(1);

  if (items && items.length > 0) {
    const id = items[Math.floor(Math.random() * items.length)].id;
    const listing = http.get(`${API}/v1/listings/${id}`, { headers, tags: { name: 'listing' } });
    check(listing, { 'listing 200': (r) => r.status === 200 });
    http.get(`${API}/v1/listings/${id}/quote?startDate=${day(7)}&endDate=${day(9)}`, {
      headers,
      tags: { name: 'quote' },
    });
  }
  sleep(2);
}
