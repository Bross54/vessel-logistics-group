import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const SUPABASE_URL = 'https://evdmcrrzuqfotlmtpxjs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ci1j_1o0-B_yNtvnwqcHgQ_7uUBdAet';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const requestsBody = document.querySelector('#requests-body');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const statusFilter = document.querySelector('#status-filter');
const dialog = document.querySelector('#request-dialog');
const toast = document.querySelector('#toast');

let requests = [];
let filteredRequests = [];
let toastTimer;

const statusLabels = {
  new: 'New',
  contacted: 'Contacted',
  quoted: 'Quoted',
  closed: 'Closed'
};

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
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
  await loadRequests();
}

async function initialize() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    showLogin();
    return;
  }
  await showDashboard(data.user);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);

  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';
  loginError.textContent = '';

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  });

  submitButton.disabled = false;
  submitButton.innerHTML = 'Sign in <span>→</span>';

  if (error || !data.user) {
    loginError.textContent = 'Invalid email or password.';
    return;
  }

  loginForm.reset();
  await showDashboard(data.user);
});

document.querySelector('#logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  requests = [];
  showLogin();
});

document.querySelector('#refresh-btn').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  await loadRequests();
  event.currentTarget.disabled = false;
  showToast('Dashboard refreshed.');
});

async function loadRequests() {
  const { data, error } = await supabase
    .from('quote_requests')
    .select('id,name,company,email,phone,pickup_city_state,delivery_city_state,load_details,status,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Unable to load requests:', error);
    showToast('Could not load quote requests.', true);
    return;
  }

  requests = data || [];
  updateStatistics();
  renderChart();
  renderPipeline();
  applyFilters();
}

function updateStatistics() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  document.querySelector('#stat-total').textContent = requests.length;
  document.querySelector('#stat-new').textContent = countStatus('new');
  document.querySelector('#stat-contacted').textContent = countStatus('contacted');
  document.querySelector('#stat-quoted').textContent = countStatus('quoted');
  document.querySelector('#stat-month').textContent = requests.filter(item => new Date(item.created_at).getTime() >= thirtyDaysAgo).length;
}

function countStatus(status) {
  return requests.filter(item => item.status === status).length;
}

function renderPipeline() {
  const container = document.querySelector('#pipeline-list');
  container.replaceChildren();
  const total = Math.max(requests.length, 1);

  Object.entries(statusLabels).forEach(([status, label]) => {
    const count = countStatus(status);
    const row = document.createElement('div');
    row.className = 'pipeline-row';

    const name = document.createElement('strong');
    name.textContent = label;
    const value = document.createElement('span');
    value.textContent = String(count);
    const track = document.createElement('div');
    track.className = 'pipeline-track';
    const fill = document.createElement('i');
    fill.style.width = `${(count / total) * 100}%`;
    track.append(fill);
    row.append(name, value, track);
    container.append(row);
  });
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderChart() {
  const chart = document.querySelector('#activity-chart');
  chart.replaceChildren();
  const days = [];

  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    days.push({
      date,
      key: localDateKey(date),
      count: 0
    });
  }

  const counts = new Map(days.map(day => [day.key, day]));
  requests.forEach(request => {
    const item = counts.get(localDateKey(new Date(request.created_at)));
    if (item) item.count += 1;
  });

  const max = Math.max(...days.map(day => day.count), 1);
  const periodTotal = days.reduce((sum, day) => sum + day.count, 0);
  document.querySelector('#chart-total').textContent = `${periodTotal} request${periodTotal === 1 ? '' : 's'}`;

  days.forEach(day => {
    const column = document.createElement('div');
    column.className = 'chart-column';
    column.title = `${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${day.count}`;

    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = day.count || '';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${Math.max(3, (day.count / max) * 175)}px`;
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = day.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

    column.append(value, bar, label);
    chart.append(column);
  });
}

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  filteredRequests = requests.filter(request => {
    const matchesStatus = status === 'all' || request.status === status;
    const haystack = [
      request.name,
      request.company,
      request.email,
      request.phone,
      request.pickup_city_state,
      request.delivery_city_state,
      request.load_details
    ].filter(Boolean).join(' ').toLowerCase();

    return matchesStatus && (!term || haystack.includes(term));
  });

  renderTable();
}

searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);

function renderTable() {
  requestsBody.replaceChildren();
  emptyState.hidden = filteredRequests.length > 0;

  filteredRequests.forEach(request => {
    const row = document.createElement('tr');

    const received = document.createElement('td');
    received.className = 'date-cell';
    const dateStrong = document.createElement('strong');
    dateStrong.textContent = new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = document.createElement('span');
    time.textContent = new Date(request.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    received.append(dateStrong, time);

    const contact = document.createElement('td');
    contact.className = 'contact-cell';
    const contactName = document.createElement('strong');
    contactName.textContent = request.name;
    const company = document.createElement('span');
    company.textContent = request.company || request.email;
    contact.append(contactName, company);

    const route = document.createElement('td');
    route.className = 'route-cell';
    const origin = document.createElement('strong');
    origin.textContent = request.pickup_city_state || 'Origin not provided';
    const destination = document.createElement('span');
    destination.textContent = request.delivery_city_state ? `→ ${request.delivery_city_state}` : 'Destination not provided';
    route.append(origin, destination);

    const statusCell = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status-select';
    select.setAttribute('aria-label', `Status for ${request.name}`);
    Object.entries(statusLabels).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = request.status === value;
      select.append(option);
    });
    select.addEventListener('change', () => updateStatus(request.id, select.value, select));
    statusCell.append(select);

    const actions = document.createElement('td');
    const view = document.createElement('button');
    view.className = 'view-btn';
    view.type = 'button';
    view.textContent = 'View →';
    view.addEventListener('click', () => openDetails(request));
    actions.append(view);

    row.append(received, contact, route, statusCell, actions);
    requestsBody.append(row);
  });

  const count = filteredRequests.length;
  document.querySelector('#result-count').textContent = `${count} request${count === 1 ? '' : 's'}`;
}

async function updateStatus(id, newStatus, select) {
  const request = requests.find(item => item.id === id);
  if (!request) return;
  const previousStatus = request.status;
  select.disabled = true;

  const { error } = await supabase
    .from('quote_requests')
    .update({ status: newStatus })
    .eq('id', id);

  select.disabled = false;

  if (error) {
    select.value = previousStatus;
    console.error('Unable to update status:', error);
    showToast('Status update failed.', true);
    return;
  }

  request.status = newStatus;
  updateStatistics();
  renderPipeline();
  showToast('Status updated.');
}

function addDetail(container, label, value) {
  const item = document.createElement('div');
  item.className = 'detail-item';
  const key = document.createElement('span');
  key.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value || 'Not provided';
  item.append(key, content);
  container.append(item);
}

function openDetails(request) {
  document.querySelector('#detail-name').textContent = request.name;
  const grid = document.querySelector('#detail-grid');
  grid.replaceChildren();
  addDetail(grid, 'COMPANY', request.company);
  addDetail(grid, 'RECEIVED', new Date(request.created_at).toLocaleString('en-US'));
  addDetail(grid, 'EMAIL', request.email);
  addDetail(grid, 'PHONE', request.phone);
  addDetail(grid, 'PICKUP', request.pickup_city_state);
  addDetail(grid, 'DELIVERY', request.delivery_city_state);
  document.querySelector('#detail-message').textContent = request.load_details || 'No load details provided.';

  const emailLink = document.querySelector('#detail-email');
  emailLink.href = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent('Vessel Logistics — Your freight quote request')}`;

  const phoneLink = document.querySelector('#detail-phone');
  phoneLink.href = request.phone ? `tel:${request.phone.replace(/[^+\d]/g, '')}` : '#';
  phoneLink.hidden = !request.phone;

  dialog.showModal();
}

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

document.querySelector('#export-btn').addEventListener('click', () => {
  if (!filteredRequests.length) {
    showToast('There are no requests to export.', true);
    return;
  }

  const columns = [
    ['Received', 'created_at'],
    ['Name', 'name'],
    ['Company', 'company'],
    ['Email', 'email'],
    ['Phone', 'phone'],
    ['Pickup', 'pickup_city_state'],
    ['Delivery', 'delivery_city_state'],
    ['Load details', 'load_details'],
    ['Status', 'status']
  ];

  const escapeCsv = value => {
    let safeValue = String(value ?? '');
    if (/^[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
    return `"${safeValue.replace(/"/g, '""')}"`;
  };
  const rows = [
    columns.map(([label]) => escapeCsv(label)).join(','),
    ...filteredRequests.map(request => columns.map(([, key]) => escapeCsv(request[key])).join(','))
  ];

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vessel-quote-requests-${localDateKey(new Date())}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('CSV exported.');
});

initialize();
