const DASHBOARD_API_URL = 'https://evdmcrrzuqfotlmtpxjs.supabase.co/functions/v1/vessel-dashboard-api';
const DASHBOARD_TOKEN_KEY = 'vessel_dashboard_session';
let dashboardToken = localStorage.getItem(DASHBOARD_TOKEN_KEY) || '';

async function apiRequest(action, payload = {}, authenticated = true) {
  const response = await fetch(DASHBOARD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated && dashboardToken ? { Authorization: `Bearer ${dashboardToken}` } : {})
    },
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && authenticated) {
    dashboardToken = '';
    localStorage.removeItem(DASHBOARD_TOKEN_KEY);
    showLogin();
  }
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}


const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const requestList = document.querySelector('#request-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const toast = document.querySelector('#toast');

const fleetModal = document.querySelector('#fleet-modal');
const fleetForm = document.querySelector('#fleet-form');
const fleetList = document.querySelector('#fleet-list');


const statusLabels = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', confirmed: 'Confirmed', closed: 'Closed' };
let quoteRequests = [];
let sessions = [];
let fleetTrucks = [];
let toastTimer;

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function showRegistrationWarnings(expiredTrucks) {
  const alert = document.querySelector('#registration-alert');
  const message = document.querySelector('#registration-alert-text');
  const unseen = expiredTrucks.filter(truck => {
    const key = `vessel_registration_warning_${truck.id}_${truck.registration_expires_on}`;
    return !localStorage.getItem(key);
  });
  if (!unseen.length) {
    alert.hidden = true;
    return;
  }
  message.textContent = unseen.map(truck => `${truck.unit_number} · ${truck.name} (${new Date(`${truck.registration_expires_on}T12:00:00`).toLocaleDateString('en-US')})`).join('; ');
  unseen.forEach(truck => localStorage.setItem(`vessel_registration_warning_${truck.id}_${truck.registration_expires_on}`, 'shown'));
  alert.hidden = false;
}

document.querySelector('#registration-alert-close').addEventListener('click', () => {
  document.querySelector('#registration-alert').hidden = true;
});

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
}

async function showDashboard(username) {
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector('#user-email').textContent = username || 'Authorized user';
  await loadDashboard();
}

async function initialize() {
  if (!dashboardToken) return showLogin();
  try {
    const session = await apiRequest('session');
    await showDashboard(session.username);
  } catch {
    showLogin();
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  button.disabled = true;
  button.textContent = 'Signing in...';
  loginError.textContent = '';

  try {
    const data = await apiRequest('login', {
      username: String(formData.get('username') || '').trim(),
      password: String(formData.get('password') || '')
    }, false);
    dashboardToken = data.token;
    localStorage.setItem(DASHBOARD_TOKEN_KEY, dashboardToken);
    loginForm.reset();
    await showDashboard(data.username);
  } catch (error) {
    loginError.textContent = error.message || 'Invalid username or password.';
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign in <span>→</span>';
  }
});

document.querySelector('#logout-btn').addEventListener('click', () => {
  dashboardToken = '';
  localStorage.removeItem(DASHBOARD_TOKEN_KEY);
  quoteRequests = [];
  sessions = [];
  fleetTrucks = [];
  showLogin();
});

document.querySelector('#refresh-btn').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  await loadDashboard();
  event.currentTarget.disabled = false;
  showToast('Dashboard refreshed.');
});

async function loadDashboard() {
  let data;
  try {
    data = await apiRequest('dashboard');
  } catch (error) {
    console.error('Dashboard load failed:', error);
    showToast('Could not load dashboard data.', true);
    return;
  }

  quoteRequests = data.quoteRequests || [];
  sessions = aggregateSessions(data.events || []);
  fleetTrucks = data.fleetTrucks || [];
  showRegistrationWarnings(data.expiredTrucks || []);
  renderStatistics();
  renderAnalytics();
  renderRequests();
  renderFleet();
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

function packageGroupsText(groups) {
  if (!Array.isArray(groups) || !groups.length) return 'No structured package data (legacy inquiry).';
  return groups.map((group, index) => `${index + 1}. ${group.quantity} × ${group.packaging_type} — ${group.description}; ${group.weight_each_lb} lb each; ${group.length_each_in} × ${group.width_each_in} × ${group.height_each_in} in each`).join('\n');
}

function createRequestItem(request) {
  const item = document.createElement('details');
  const safeStatus = Object.hasOwn(statusLabels, request.status) ? request.status : 'new';
  item.className = `request-item status-${safeStatus}`;

  const summary = document.createElement('summary');
  summary.className = 'request-summary';
  summary.append(
    createTextElement('strong', '', request.name),
    createTextElement('span', '', request.freight_type || 'No subject'),
    createTextElement('span', '', request.email || request.phone || 'No contact'),
    createTextElement('span', 'chevron', '+')
  );

  const details = document.createElement('div');
  details.className = 'request-details';
  const infoGrid = document.createElement('div');
  infoGrid.className = 'info-grid';
  infoGrid.append(
    createInfoItem('EMAIL', request.email),
    createInfoItem('PHONE', request.phone || request.phone_e164),
    createInfoItem('SUBJECT', request.freight_type),
    createInfoItem('RECEIVED', new Date(request.created_at).toLocaleString('en-US')),
    createInfoItem('STATUS', statusLabels[request.status] || request.status)
  );

  const messages = document.createElement('div');
  messages.className = 'message-grid';
  messages.append(
    createMessageBlock('MESSAGE', request.load_details || 'No message provided.'),
    createMessageBlock('SMS CONSENT', request.additional_comment || 'No SMS consent record.')
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
    option.disabled = request.status === 'confirmed' && !['confirmed', 'closed'].includes(value);
    select.append(option);
  });
  select.addEventListener('change', () => updateStatus(request, select.value, select));
  statusControl.append(select);

  const actionButtons = document.createElement('div');
  actionButtons.className = 'item-action-buttons';

  const contact = document.createElement('button');
  contact.type = 'button';
  contact.className = 'contact-btn';
  contact.textContent = 'Contact →';
  const subject = `Re: ${request.freight_type || 'Your message to Vessel Logistics'}`;
  const body = `Hi ${request.name},\n\nThank you for contacting Vessel Logistics.\n\n`;
  const mailUrl = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  contact.addEventListener('click', async () => {
    contact.disabled = true;
    contact.textContent = 'Opening email...';
    if (request.status === 'new') {
      const updated = await updateStatus(request, 'contacted', null, false);
      if (!updated) {
        contact.disabled = false;
        contact.textContent = 'Contact →';
        return;
      }
    }
    window.location.href = mailUrl;
    window.setTimeout(renderRequests, 250);
  });

  const call = document.createElement('button');
  call.type = 'button';
  call.className = 'call-btn';
  call.textContent = 'Call';
  call.disabled = !(request.phone_e164 || request.phone);
  call.addEventListener('click', () => {
    window.location.href = `tel:${request.phone_e164 || String(request.phone).replace(/[^+\d]/g, '')}`;
  });

  actionButtons.append(contact, call);
  actions.append(statusControl, actionButtons);
  details.append(infoGrid, messages, actions);
  item.append(summary, details);
  return item;
}

async function updateStatus(request, nextStatus, select = null, rerender = true) {
  const previous = request.status;
  if (previous === nextStatus) return true;
  if (select) select.disabled = true;
  let error = null;
  try {
    await apiRequest('status', { requestId: request.id, status: nextStatus, quoteId: null });
  } catch (requestError) {
    error = requestError;
  }
  if (select) select.disabled = false;

  if (error) {
    if (select) select.value = previous;
    console.error('Status update failed:', error);
    showToast(error.message || 'Status update failed.', true);
    return false;
  }

  request.status = nextStatus;
  if (['confirmed', 'closed'].includes(nextStatus)) await loadDashboard();
  renderStatistics();
  if (rerender) renderRequests();
  showToast('Status updated.');
  return true;
}

function registrationState(truck) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${truck.registration_expires_on}T12:00:00`);
  const days = Math.ceil((expiry - today) / 86400000);
  if (days < 0) return { key: 'expired', label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, days };
  if (days <= 30) return { key: 'warning', label: `Expires in ${days} day${days === 1 ? '' : 's'}`, days };
  return { key: 'valid', label: `Valid through ${expiry.toLocaleDateString('en-US')}`, days };
}

function resetFleetForm() {
  fleetForm.reset();
  fleetForm.elements.namedItem('id').value = '';
  fleetForm.elements.namedItem('status').value = 'available';
  document.querySelector('#fleet-form-label').textContent = 'NEW TRUCK';
  document.querySelector('#fleet-form-title').textContent = 'Add a truck';
  document.querySelector('#fleet-save').textContent = 'Save truck';
}

function editFleetTruck(truck) {
  Object.entries(truck).forEach(([key, value]) => {
    const field = fleetForm.elements.namedItem(key);
    if (field) field.value = value ?? '';
  });
  document.querySelector('#fleet-form-label').textContent = truck.unit_number;
  document.querySelector('#fleet-form-title').textContent = 'Edit truck';
  document.querySelector('#fleet-save').textContent = 'Update truck';
  fleetForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setFleetStatus(truck, status) {
  let data;
  let registrationExpired = false;
  try {
    const result = await apiRequest('fleet_status', { id: truck.id, status });
    data = result.data;
    registrationExpired = Boolean(result.registrationExpired);
  } catch (error) {
    showToast(error.message || 'Could not update the truck.', true);
    return;
  }
  const index = fleetTrucks.findIndex(item => item.id === truck.id);
  if (index >= 0) fleetTrucks[index] = data;
  renderFleet();
  showToast(registrationExpired ? 'Registration is expired. Truck remains inactive.' : status === 'archived' ? 'Truck archived.' : status === 'available' && truck.status === 'archived' ? 'Truck restored.' : 'Truck status updated.');
}

function renderFleet() {
  if (!fleetList) return;
  fleetList.replaceChildren();
  document.querySelector('#fleet-count').textContent = `${fleetTrucks.length} truck${fleetTrucks.length === 1 ? '' : 's'}`;
  const statusOrder = { available: 0, assigned: 1, maintenance: 2, inactive: 3, archived: 4 };
  [...fleetTrucks].sort((a, b) => (statusOrder[a.status] - statusOrder[b.status]) || a.unit_number.localeCompare(b.unit_number)).forEach(truck => {
    const registration = registrationState(truck);
    const card = document.createElement('article');
    card.className = `fleet-card status-${truck.status} registration-${registration.key}`;
    const head = document.createElement('div');
    head.className = 'fleet-card-head';
    const title = document.createElement('div');
    title.append(createTextElement('h4', '', `${truck.unit_number} · ${truck.name}`), createTextElement('span', '', `${truck.truck_type} · ${truck.plate_number} (${truck.registration_state})`));
    head.append(title, createTextElement('strong', '', statusLabels[truck.status] || truck.status.toUpperCase()));
    const meta = document.createElement('div');
    meta.className = 'fleet-card-meta';
    meta.append(
      createTextElement('span', '', `Payload: ${Number(truck.max_payload_lb).toLocaleString()} lb`),
      createTextElement('span', '', `Cargo: ${truck.cargo_length_in} × ${truck.cargo_width_in} × ${truck.cargo_height_in} in`),
      createTextElement('span', '', registration.label)
    );
    const actions = document.createElement('div');
    actions.className = 'fleet-card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editFleetTruck(truck));
    actions.append(edit);
    if (truck.status === 'archived') {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.textContent = 'Restore';
      restore.addEventListener('click', () => setFleetStatus(truck, 'available'));
      actions.append(restore);
    } else if (truck.status === 'inactive') {
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.textContent = 'Archive';
      archive.addEventListener('click', () => setFleetStatus(truck, 'archived'));
      actions.append(archive);
    } else {
      const disable = document.createElement('button');
      disable.type = 'button';
      disable.textContent = 'Disable';
      disable.addEventListener('click', () => setFleetStatus(truck, 'inactive'));
      actions.append(disable);
    }
    card.append(head, meta, actions);
    fleetList.append(card);
  });
}

function closeFleetModal() {
  fleetModal.hidden = true;
  document.body.classList.remove('modal-open');
  resetFleetForm();
}

document.querySelector('#fleet-btn').addEventListener('click', () => {
  resetFleetForm();
  renderFleet();
  fleetModal.hidden = false;
  document.body.classList.add('modal-open');
});
document.querySelector('#fleet-modal-close').addEventListener('click', closeFleetModal);
document.querySelector('#fleet-form-reset').addEventListener('click', resetFleetForm);
fleetModal.addEventListener('click', event => {
  if (event.target === fleetModal) closeFleetModal();
});
fleetForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(fleetForm);
  const id = String(formData.get('id') || '');
  const payload = {
    name: String(formData.get('name') || '').trim(),
    truck_type: String(formData.get('truck_type') || '').trim(),
    unit_number: String(formData.get('unit_number') || '').trim().toUpperCase(),
    plate_number: String(formData.get('plate_number') || '').trim().toUpperCase(),
    registration_state: String(formData.get('registration_state') || '').trim().toUpperCase(),
    registration_expires_on: String(formData.get('registration_expires_on') || ''),
    status: String(formData.get('status') || 'available'),
    max_payload_lb: Number(formData.get('max_payload_lb')),
    cargo_length_in: Number(formData.get('cargo_length_in')),
    cargo_width_in: Number(formData.get('cargo_width_in')),
    cargo_height_in: Number(formData.get('cargo_height_in')),
    notes: String(formData.get('notes') || '').trim(),
    updated_at: new Date().toISOString()
  };
  const requestedStatus = payload.status;
  const button = document.querySelector('#fleet-save');
  button.disabled = true;
  button.textContent = id ? 'Updating...' : 'Saving...';
  let result;
  try {
    result = await apiRequest('fleet_save', { ...payload, ...(id ? { id } : {}) });
  } catch (error) {
    button.textContent = id ? 'Update truck' : 'Save truck';
    button.disabled = false;
    showToast(error.message || 'Could not save the truck.', true);
    return;
  }
  button.disabled = false;
  const existingIndex = fleetTrucks.findIndex(truck => truck.id === result.data.id);
  if (existingIndex >= 0) fleetTrucks[existingIndex] = result.data;
  else fleetTrucks.push(result.data);
  resetFleetForm();
  renderFleet();
  showToast(result.data.status === 'inactive' && requestedStatus !== 'inactive' ? 'Truck saved as inactive because its registration is expired.' : id ? 'Truck updated.' : 'Truck added.');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !fleetModal.hidden) closeFleetModal();
});

initialize();
