import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const SUPABASE_URL = 'https://evdmcrrzuqfotlmtpxjs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ci1j_1o0-B_yNtvnwqcHgQ_7uUBdAet';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const requestList = document.querySelector('#request-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const toast = document.querySelector('#toast');

const statusLabels = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', closed: 'Closed' };
let quoteRequests = [];
let sessions = [];
let toastTimer;

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
}

async function showDashboard(user) {
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector('#user-email').textContent = user.email || 'Authorized user';
  await loadDashboard();
}

async function initialize() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return showLogin();
  await showDashboard(data.user);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  button.disabled = true;
  button.textContent = 'Signing in...';
  loginError.textContent = '';

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  });

  button.disabled = false;
  button.innerHTML = 'Sign in <span>→</span>';
  if (error || !data.user) {
    loginError.textContent = 'Invalid email or password.';
    return;
  }

  loginForm.reset();
  await showDashboard(data.user);
});

document.querySelector('#logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  quoteRequests = [];
  sessions = [];
  showLogin();
});

document.querySelector('#refresh-btn').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  await loadDashboard();
  event.currentTarget.disabled = false;
  showToast('Dashboard refreshed.');
});

async function loadDashboard() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const [quotesResult, eventsResult] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('id,name,company,email,freight_type,freight_weight,freight_dimensions,pickup_city_state,delivery_city_state,load_details,additional_comment,status,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('page_events')
      .select('session_id,visitor_id,event_type,duration_seconds,occurred_at')
      .gte('occurred_at', since.toISOString())
      .order('occurred_at', { ascending: true })
  ]);

  if (quotesResult.error || eventsResult.error) {
    console.error('Dashboard load failed:', quotesResult.error || eventsResult.error);
    showToast('Could not load dashboard data.', true);
    return;
  }

  quoteRequests = quotesResult.data || [];
  sessions = aggregateSessions(eventsResult.data || []);
  renderStatistics();
  renderAnalytics();
  renderRequests();
}

function aggregateSessions(events) {
  const map = new Map();
  events.forEach(event => {
    const current = map.get(event.session_id) || {
      sessionId: event.session_id,
      visitorId: event.visitor_id,
      startedAt: event.occurred_at,
      duration: 0
    };
    if (new Date(event.occurred_at) < new Date(current.startedAt)) current.startedAt = event.occurred_at;
    current.duration = Math.max(current.duration, Number(event.duration_seconds) || 0);
    map.set(event.session_id, current);
  });
  return [...map.values()];
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(seconds || 0));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function renderStatistics() {
  const uniqueVisitors = new Set(sessions.map(session => session.visitorId)).size;
  const average = sessions.length ? sessions.reduce((sum, session) => sum + session.duration, 0) / sessions.length : 0;
  document.querySelector('#stat-visitors').textContent = uniqueVisitors;
  document.querySelector('#stat-time').textContent = formatDuration(average);
  document.querySelector('#stat-quotes').textContent = quoteRequests.length;
  document.querySelector('#stat-new').textContent = quoteRequests.filter(request => request.status === 'new').length;
}

function buildDays() {
  const days = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    days.push({ date, key: dateKey(date) });
  }
  return days;
}

function renderAnalytics() {
  const days = buildDays();
  const visitorsByDay = new Map(days.map(day => [day.key, new Set()]));
  const sessionsByDay = new Map(days.map(day => [day.key, []]));

  sessions.forEach(session => {
    const key = dateKey(new Date(session.startedAt));
    visitorsByDay.get(key)?.add(session.visitorId);
    sessionsByDay.get(key)?.push(session.duration);
  });

  const visitorData = days.map(day => ({ date: day.date, value: visitorsByDay.get(day.key).size }));
  const durationData = days.map(day => {
    const values = sessionsByDay.get(day.key);
    return { date: day.date, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
  });

  const totalVisitors = new Set(sessions.map(session => session.visitorId)).size;
  const overallAverage = sessions.length ? sessions.reduce((sum, session) => sum + session.duration, 0) / sessions.length : 0;
  document.querySelector('#visitors-total').textContent = `${totalVisitors} unique`;
  document.querySelector('#time-average').textContent = formatDuration(overallAverage);

  renderChart(document.querySelector('#visitors-chart'), visitorData, value => String(value));
  renderChart(document.querySelector('#time-chart'), durationData, formatDuration);
}

function renderChart(container, data, valueFormatter) {
  container.replaceChildren();
  const max = Math.max(...data.map(item => item.value), 1);

  data.forEach((item, index) => {
    const column = document.createElement('div');
    column.className = 'chart-column';
    column.title = `${item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${valueFormatter(item.value)}`;

    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = item.value ? valueFormatter(item.value) : '';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${Math.max(2, (item.value / max) * 175)}px`;
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = index % 5 === 0 || index === data.length - 1
      ? item.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
      : '';

    column.append(value, bar, label);
    container.append(column);
  });
}

searchInput.addEventListener('input', renderRequests);

function renderRequests() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = quoteRequests.filter(request => {
    const haystack = [
      request.name, request.company, request.email, request.freight_type,
      request.pickup_city_state, request.delivery_city_state, request.load_details
    ].filter(Boolean).join(' ').toLowerCase();
    return !term || haystack.includes(term);
  });

  requestList.replaceChildren();
  emptyState.hidden = filtered.length > 0;

  filtered.forEach(request => requestList.append(createRequestItem(request)));
  document.querySelector('#request-count').textContent = `${filtered.length} inquir${filtered.length === 1 ? 'y' : 'ies'}`;
}

function createTextElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value || 'Not provided';
  return element;
}

function createInfoItem(label, value) {
  const item = document.createElement('div');
  item.className = 'info-item';
  item.append(createTextElement('span', '', label), createTextElement('strong', '', value));
  return item;
}

function createMessageBlock(label, value) {
  const block = document.createElement('div');
  block.className = 'message-block';
  block.append(createTextElement('span', '', label), createTextElement('p', '', value));
  return block;
}

function createRequestItem(request) {
  const item = document.createElement('details');
  item.className = 'request-item';

  const summary = document.createElement('summary');
  summary.className = 'request-summary';
  summary.append(
    createTextElement('strong', '', request.name),
    createTextElement('span', '', request.company),
    createTextElement('span', '', request.freight_type || 'General Freight'),
    createTextElement('span', 'chevron', '+')
  );

  const details = document.createElement('div');
  details.className = 'request-details';
  const infoGrid = document.createElement('div');
  infoGrid.className = 'info-grid';
  infoGrid.append(
    createInfoItem('EMAIL', request.email),
    createInfoItem('WEIGHT', request.freight_weight),
    createInfoItem('DIMENSIONS', request.freight_dimensions),
    createInfoItem('RECEIVED', new Date(request.created_at).toLocaleString('en-US')),
    createInfoItem('ORIGIN', request.pickup_city_state),
    createInfoItem('DESTINATION', request.delivery_city_state),
    createInfoItem('FREIGHT TYPE', request.freight_type),
    createInfoItem('STATUS', statusLabels[request.status] || request.status)
  );

  const messages = document.createElement('div');
  messages.className = 'message-grid';
  messages.append(
    createMessageBlock('FREIGHT DETAILS', request.load_details || 'No freight details provided.'),
    createMessageBlock('ADDITIONAL COMMENT', request.additional_comment || 'No additional comment.')
  );

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const statusControl = document.createElement('label');
  statusControl.className = 'status-control';
  statusControl.append(document.createTextNode('STATUS'));
  const select = document.createElement('select');
  Object.entries(statusLabels).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = request.status === value;
    select.append(option);
  });
  select.addEventListener('change', () => updateStatus(request, select.value, select));
  statusControl.append(select);

  const contact = document.createElement('a');
  contact.className = 'contact-btn';
  contact.textContent = 'Contact →';
  const subject = `Vessel Logistics — ${request.freight_type || 'Freight'} quote request`;
  const body = `Hi ${request.name},\n\nThank you for contacting Vessel Logistics regarding your shipment from ${request.pickup_city_state || 'the pickup location'} to ${request.delivery_city_state || 'the destination'}.\n\n`;
  contact.href = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  actions.append(statusControl, contact);
  details.append(infoGrid, messages, actions);
  item.append(summary, details);
  return item;
}

async function updateStatus(request, nextStatus, select) {
  const previous = request.status;
  select.disabled = true;
  const { error } = await supabase.from('quote_requests').update({ status: nextStatus }).eq('id', request.id);
  select.disabled = false;

  if (error) {
    select.value = previous;
    console.error('Status update failed:', error);
    showToast('Status update failed.', true);
    return;
  }

  request.status = nextStatus;
  renderStatistics();
  showToast('Status updated.');
}

initialize();
