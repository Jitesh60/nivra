// Chat: signed-in people opening their inbox, reading a conversation,
// sending a message (within the 30-a-minute limit) and marking it read.
// The API must run with OTP_DEV_BYPASS_CODE=000000 on a seeded load database.
//
//   docker run --rm --network host -v "$PWD/infra/load:/load" grafana/k6 run /load/chat.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'http://localhost:3000';
const CODE = __ENV.OTP_CODE || '000000';
const USERS = Number(__ENV.VUS || 40);
const json = { 'Content-Type': 'application/json' };

export const options = {
  setupTimeout: '5m',
  scenarios: {
    chat: {
      executor: 'constant-vus',
      vus: USERS,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:inbox}': ['p(95)<250'],
    'http_req_duration{name:messages}': ['p(95)<250'],
    'http_req_duration{name:send}': ['p(95)<300'],
  },
};

function post(path, body, token, ip, name) {
  return http.post(`${API}/v1${path}`, JSON.stringify(body), {
    headers: {
      ...json,
      'X-Forwarded-For': ip,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    tags: { name },
  });
}

/** Signs up USERS borrowers (phone + email by the dev bypass code) and opens one chat each. */
export function setup() {
  const run = String(Date.now()).slice(-6);
  const listings = http
    .get(`${API}/v1/search?q=tent&lat=18.5074&lng=73.8077&radiusKm=25`, {
      headers: { 'X-Forwarded-For': '10.255.0.1' },
    })
    .json('items');
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const ip = `10.254.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    const phone = `+918${run}${String(i).padStart(3, '0')}`;
    const { challengeId } = post('/auth/otp/request', { phone }, null, ip, 'setup').json();
    const login = post(
      '/auth/otp/verify',
      { challengeId, code: CODE, deviceId: `load-${run}-${i}`, deviceName: 'k6' },
      null,
      ip,
      'setup',
    ).json();
    const token = login.accessToken;
    http.patch(`${API}/v1/me`, JSON.stringify({ name: `Load Borrower ${i}` }), {
      headers: { ...json, Authorization: `Bearer ${token}` },
    });
    const email = post(
      '/auth/email/otp/request',
      { email: `b-${run}-${i}@load.sajha.test` },
      token,
      ip,
      'setup',
    ).json();
    post(
      '/auth/email/otp/verify',
      { challengeId: email.challengeId, code: CODE },
      token,
      ip,
      'setup',
    );
    const listing = listings[i % listings.length];
    const convo = post('/conversations', { listingId: listing.id }, token, ip, 'setup').json();
    users.push({ token, ip, conversationId: convo.id });
  }
  return { users };
}

export default function (data) {
  const me = data.users[(__VU - 1) % data.users.length];
  const auth = { Authorization: `Bearer ${me.token}`, 'X-Forwarded-For': me.ip };

  const inbox = http.get(`${API}/v1/conversations`, { headers: auth, tags: { name: 'inbox' } });
  check(inbox, { 'inbox 200': (r) => r.status === 200 });
  const thread = http.get(`${API}/v1/conversations/${me.conversationId}/messages?limit=30`, {
    headers: auth,
    tags: { name: 'messages' },
  });
  check(thread, { 'messages 200': (r) => r.status === 200 });
  const sent = http.post(
    `${API}/v1/conversations/${me.conversationId}/messages`,
    JSON.stringify({
      type: 'TEXT',
      body: `Is it free next weekend? (${__ITER})`,
      clientId: `k6-${__VU}-${__ITER}-${Date.now()}`,
    }),
    { headers: { ...json, ...auth }, tags: { name: 'send' } },
  );
  check(sent, { 'send 201': (r) => r.status === 201 });
  const upTo = sent.status === 201 ? sent.json('id') : null;
  if (!upTo) return;
  const read = http.post(
    `${API}/v1/conversations/${me.conversationId}/read`,
    JSON.stringify({ upTo }),
    {
      headers: { ...json, ...auth },
      tags: { name: 'read' },
    },
  );
  check(read, { 'read 2xx': (r) => r.status >= 200 && r.status < 300 });
  const unread = http.get(`${API}/v1/me/unread`, { headers: auth, tags: { name: 'unread' } });
  check(unread, { 'unread 200': (r) => r.status === 200 });
  // Stay under 30 messages a minute per person.
  sleep(2.5);
}
