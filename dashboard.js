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

const DEMO_COMPANY_DETAILS = Object.freeze({
  name: 'Vessel Logistics Group LLC',
  address: '2800 Logistics Parkway, Chicago, IL 60608',
  phone: '+1 (312) 555-0188',
  email: 'billing@vessellogistics.demo',
  usdot: 'USDOT 1234567',
  mc: 'MC 765432',
  bank: 'First American Demo Bank',
  paymentMethod: 'ACH or domestic wire transfer',
  routingNumber: '000000000 (DEMO)',
  accountNumber: '****0042 (DEMO)'
});

const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const requestList = document.querySelector('#request-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const toast = document.querySelector('#toast');
const quoteModal = document.querySelector('#quote-modal');
const quoteForm = document.querySelector('#quote-form');
const quoteResult = document.querySelector('#quote-result');
const lineItems = document.querySelector('#line-items');
const taxRateInput = document.querySelector('#tax-rate');
const truckSelect = document.querySelector('#quote-trucks');
const truckAllocations = document.querySelector('#truck-allocations');
const fleetModal = document.querySelector('#fleet-modal');
const fleetForm = document.querySelector('#fleet-form');
const fleetList = document.querySelector('#fleet-list');

const statusLabels = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', confirmed: 'Confirmed', closed: 'Closed' };
let quoteRequests = [];
let sessions = [];
let fleetTrucks = [];
let freightQuotes = [];
let toastTimer;
let activeInquiry = null;
let activeQuoteMeta = null;
let generatedQuote = null;

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
  freightQuotes = [];
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
  freightQuotes = data.freightQuotes || [];
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
    createInfoItem('PHONE', request.phone || request.phone_e164),
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
    createMessageBlock('PACKAGING', packageGroupsText(request.package_groups)),
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
  const subject = `Vessel Logistics — ${request.freight_type || 'Freight'} quote request`;
  const body = `Hi ${request.name},\n\nThank you for contacting Vessel Logistics regarding your shipment from ${request.pickup_city_state || 'the pickup location'} to ${request.delivery_city_state || 'the destination'}.\n\n`;
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

  const makeQuote = document.createElement('button');
  makeQuote.type = 'button';
  makeQuote.className = 'make-quote-btn';
  makeQuote.textContent = 'Make a quote';
  makeQuote.disabled = !['quoted', 'confirmed'].includes(request.status);
  makeQuote.title = ['quoted', 'confirmed'].includes(request.status) ? 'Create a prepayment quote' : 'Set status to Quoted to enable';
  makeQuote.addEventListener('click', () => openQuoteModal(request));

  actionButtons.append(contact, call, makeQuote);
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
    const latestQuote = freightQuotes.find(quote => quote.quote_request_id === request.id && Array.isArray(quote.truck_ids) && quote.truck_ids.length);
    if (nextStatus === 'confirmed' && !latestQuote) throw new Error('Create and save a quote with at least one truck first.');
    await apiRequest('status', { requestId: request.id, status: nextStatus, quoteId: latestQuote?.id || null });
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

function randomQuoteNumber() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const suffix = String(values[0] % 1000000).padStart(6, '0');
  return `VLG-${new Date().getFullYear()}-${suffix}`;
}

function setQuoteField(name, value) {
  const field = quoteForm.elements.namedItem(name);
  if (field) field.value = value || '';
}

function createLineItem(values = {}) {
  const row = document.createElement('div');
  row.className = 'line-item';

  const description = document.createElement('input');
  description.type = 'text';
  description.className = 'line-description';
  description.placeholder = 'Freight transportation';
  description.maxLength = 240;
  description.required = true;
  description.value = values.description || '';

  const quantity = document.createElement('input');
  quantity.type = 'number';
  quantity.className = 'line-quantity';
  quantity.placeholder = '1';
  quantity.min = '0.01';
  quantity.step = '0.01';
  quantity.required = true;
  quantity.value = values.quantity || '';

  const unitPrice = document.createElement('input');
  unitPrice.type = 'number';
  unitPrice.className = 'line-price';
  unitPrice.placeholder = '0.00';
  unitPrice.min = '0';
  unitPrice.step = '0.01';
  unitPrice.required = true;
  unitPrice.value = values.unitPrice || '';

  const amount = document.createElement('span');
  amount.className = 'line-amount';
  amount.textContent = '$0.00';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-line-item';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Remove pricing item');
  remove.addEventListener('click', () => {
    row.remove();
    updateLineItemControls();
    calculateQuoteTotals();
  });

  [quantity, unitPrice].forEach(input => input.addEventListener('input', calculateQuoteTotals));
  row.append(description, quantity, unitPrice, amount, remove);
  lineItems.append(row);
  updateLineItemControls();
  calculateQuoteTotals();
  return row;
}

function updateLineItemControls() {
  const rows = [...lineItems.querySelectorAll('.line-item')];
  rows.forEach(row => {
    row.querySelector('.remove-line-item').disabled = rows.length === 1;
  });
}

function collectLineItems() {
  return [...lineItems.querySelectorAll('.line-item')].map(row => {
    const quantity = Number(row.querySelector('.line-quantity').value) || 0;
    const unitPrice = Number(row.querySelector('.line-price').value) || 0;
    return {
      description: row.querySelector('.line-description').value.trim(),
      quantity,
      unit_price: Math.round(unitPrice * 100) / 100,
      amount: Math.round(quantity * unitPrice * 100) / 100
    };
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function calculateQuoteTotals() {
  const items = collectLineItems();
  [...lineItems.querySelectorAll('.line-item')].forEach((row, index) => {
    row.querySelector('.line-amount').textContent = formatMoney(items[index]?.amount || 0);
  });
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const taxRate = Math.max(0, Math.min(100, Number(taxRateInput.value) || 0));
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  document.querySelector('#quote-subtotal').textContent = formatMoney(subtotal);
  document.querySelector('#quote-tax').textContent = formatMoney(taxAmount);
  document.querySelector('#quote-total').textContent = formatMoney(total);
  return { items, subtotal, taxRate, taxAmount, total };
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

function dimensionsFit(itemDimensions, truckDimensions) {
  const item = itemDimensions.map(Number).sort((a, b) => a - b);
  const truck = truckDimensions.map(Number).sort((a, b) => a - b);
  return item.every((value, index) => value <= truck[index]);
}

function truckMatchesInquiry(truck, inquiry) {
  if (truck.status !== 'available' || registrationState(truck).key === 'expired') return false;
  const groups = Array.isArray(inquiry.package_groups) ? inquiry.package_groups : [];
  if (!groups.length) return true;
  const truckDims = [truck.cargo_length_in, truck.cargo_width_in, truck.cargo_height_in];
  return groups.every(group => dimensionsFit(
    [group.length_each_in, group.width_each_in, group.height_each_in],
    truckDims
  )) && groups.some(group => Number(group.weight_each_lb) <= Number(truck.max_payload_lb));
}

function renderTruckOptions() {
  truckSelect.replaceChildren();
  const matches = fleetTrucks.filter(truck => truckMatchesInquiry(truck, activeInquiry || {}));
  matches.forEach(truck => {
    const option = document.createElement('option');
    option.value = truck.id;
    option.textContent = `${truck.unit_number} · ${truck.name} · ${truck.truck_type} · ${Number(truck.max_payload_lb).toLocaleString()} lb`;
    truckSelect.append(option);
  });
  if (!matches.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No matching available trucks';
    truckSelect.append(option);
  }
  renderTruckAllocations();
}

function renderPackagePreview() {
  const preview = document.querySelector('#quote-package-preview');
  preview.replaceChildren();
  const groups = Array.isArray(activeInquiry?.package_groups) ? activeInquiry.package_groups : [];
  groups.forEach(group => {
    const row = document.createElement('div');
    row.className = 'package-preview-item';
    row.append(
      createTextElement('strong', '', `${group.quantity} × ${group.packaging_type}`),
      createTextElement('span', '', group.description),
      createTextElement('span', '', `${group.weight_each_lb} lb each`),
      createTextElement('span', '', `${group.length_each_in} × ${group.width_each_in} × ${group.height_each_in} in`)
    );
    preview.append(row);
  });
}

function renderTruckAllocations() {
  const selectedIds = [...truckSelect.selectedOptions].map(option => option.value);
  const panel = document.querySelector('#truck-allocation-panel');
  const groups = Array.isArray(activeInquiry?.package_groups) ? activeInquiry.package_groups : [];
  panel.hidden = !selectedIds.length || !groups.length;
  truckAllocations.replaceChildren();
  selectedIds.forEach(truckId => {
    const truck = fleetTrucks.find(item => item.id === truckId);
    if (!truck) return;
    const card = document.createElement('div');
    card.className = 'truck-allocation';
    card.dataset.truckId = truck.id;
    card.append(createTextElement('strong', '', `${truck.unit_number} · ${truck.name}`));
    const grid = document.createElement('div');
    grid.className = 'allocation-grid';
    groups.forEach((group, index) => {
      const label = document.createElement('label');
      label.textContent = `${group.packaging_type} · ${group.description}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'allocation-quantity';
      input.dataset.groupIndex = String(index);
      input.min = '0';
      input.max = String(group.quantity);
      input.step = '1';
      input.value = selectedIds.length === 1 ? String(group.quantity) : '0';
      input.required = true;
      input.addEventListener('input', updateAllocationCapacity);
      label.append(input);
      grid.append(label);
    });
    const capacity = createTextElement('div', 'allocation-capacity', '0 lb assigned');
    card.append(grid, capacity);
    truckAllocations.append(card);
  });
  updateAllocationCapacity();
}

function updateAllocationCapacity() {
  const groups = Array.isArray(activeInquiry?.package_groups) ? activeInquiry.package_groups : [];
  truckAllocations.querySelectorAll('.truck-allocation').forEach(card => {
    const truck = fleetTrucks.find(item => item.id === card.dataset.truckId);
    const weight = [...card.querySelectorAll('.allocation-quantity')].reduce((sum, input) => {
      const group = groups[Number(input.dataset.groupIndex)];
      return sum + (Number(input.value) || 0) * (Number(group?.weight_each_lb) || 0);
    }, 0);
    const capacity = card.querySelector('.allocation-capacity');
    capacity.textContent = `${weight.toLocaleString('en-US')} / ${Number(truck?.max_payload_lb || 0).toLocaleString('en-US')} lb assigned`;
    capacity.classList.toggle('over-capacity', weight > Number(truck?.max_payload_lb || 0));
  });
}

function collectTruckAllocations() {
  const groups = Array.isArray(activeInquiry?.package_groups) ? activeInquiry.package_groups : [];
  const selectedTrucks = [...truckSelect.selectedOptions].map(option => fleetTrucks.find(truck => truck.id === option.value)).filter(Boolean);
  if (!selectedTrucks.length) throw new Error('Select at least one matching truck.');
  if (selectedTrucks.length === 1 && groups.length) {
    const truck = selectedTrucks[0];
    const totalDims = [activeInquiry.total_length_in, activeInquiry.total_width_in, activeInquiry.total_height_in];
    if (!dimensionsFit(totalDims, [truck.cargo_length_in, truck.cargo_width_in, truck.cargo_height_in]) || Number(activeInquiry.total_weight_lb) > Number(truck.max_payload_lb)) {
      throw new Error('The entire shipment does not fit one truck. Select multiple trucks and split the packages.');
    }
  }
  const allocatedByGroup = groups.map(() => 0);
  const allocations = [...truckAllocations.querySelectorAll('.truck-allocation')].map(card => {
    const truck = selectedTrucks.find(item => item.id === card.dataset.truckId);
    let allocatedWeightLb = 0;
    const packages = [...card.querySelectorAll('.allocation-quantity')].map(input => {
      const groupIndex = Number(input.dataset.groupIndex);
      const quantity = Number(input.value) || 0;
      allocatedByGroup[groupIndex] += quantity;
      allocatedWeightLb += quantity * Number(groups[groupIndex]?.weight_each_lb || 0);
      return { group_id: groups[groupIndex]?.id || `group-${groupIndex + 1}`, group_index: groupIndex, packaging_type: groups[groupIndex]?.packaging_type, description: groups[groupIndex]?.description, quantity };
    }).filter(item => item.quantity > 0);
    if (allocatedWeightLb > Number(truck.max_payload_lb)) throw new Error(`${truck.unit_number} exceeds its maximum payload.`);
    return { truck_id: truck.id, unit_number: truck.unit_number, name: truck.name, truck_type: truck.truck_type, plate_number: truck.plate_number, registration_state: truck.registration_state, registration_expires_on: truck.registration_expires_on, max_payload_lb: Number(truck.max_payload_lb), cargo_dimensions_in: [Number(truck.cargo_length_in), Number(truck.cargo_width_in), Number(truck.cargo_height_in)], allocated_weight_lb: allocatedWeightLb, packages };
  });
  groups.forEach((group, index) => {
    if (allocatedByGroup[index] !== Number(group.quantity)) throw new Error(`Allocate all ${group.quantity} ${group.packaging_type} package(s).`);
  });
  return { selectedTrucks, allocations };
}

function resetQuoteModal() {
  quoteForm.reset();
  quoteForm.hidden = false;
  quoteResult.hidden = true;
  lineItems.replaceChildren();
  createLineItem();
  taxRateInput.value = '0';
  calculateQuoteTotals();
  generatedQuote = null;
  truckSelect.replaceChildren();
  truckAllocations.replaceChildren();
}

async function openQuoteModal(request) {
  if (!['quoted', 'confirmed'].includes(request.status)) return;
  activeInquiry = request;
  activeQuoteMeta = null;
  resetQuoteModal();
  quoteModal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('#quote-reference').textContent = 'Preparing reference...';
  renderTruckOptions();
  renderPackagePreview();

  let data;
  try {
    data = (await apiRequest('quote_history', { requestId: request.id })).data;
  } catch (error) {
    console.error('Quote history load failed:', error);
    showToast('Could not load quote history.', true);
    closeQuoteModal();
    return;
  }

  const latest = data?.[0];
  activeQuoteMeta = {
    quoteNumber: latest?.quote_number || randomQuoteNumber(),
    version: latest ? Number(latest.version) + 1 : 1
  };
  document.querySelector('#quote-reference').textContent = `${activeQuoteMeta.quoteNumber} · V${activeQuoteMeta.version}`;
  quoteForm.elements.namedItem('client_name').focus();
}

function closeQuoteModal() {
  quoteModal.hidden = true;
  document.body.classList.remove('modal-open');
  activeInquiry = null;
  activeQuoteMeta = null;
  generatedQuote = null;
}

function fillFromInquiry() {
  if (!activeInquiry) return;
  setQuoteField('client_name', activeInquiry.name);
  setQuoteField('client_company', activeInquiry.company);
  setQuoteField('client_email', activeInquiry.email);
  setQuoteField('client_phone', activeInquiry.phone || activeInquiry.phone_e164);
  setQuoteField('freight_weight', activeInquiry.freight_weight);
  setQuoteField('freight_dimensions', activeInquiry.freight_dimensions);
  setQuoteField('origin', activeInquiry.pickup_city_state);
  setQuoteField('destination', activeInquiry.delivery_city_state);
  const description = [activeInquiry.freight_type, activeInquiry.load_details].filter(Boolean).join('\n');
  setQuoteField('freight_description', description);
  setQuoteField('notes', activeInquiry.additional_comment);
  const firstItem = lineItems.querySelector('.line-item');
  if (firstItem) {
    firstItem.querySelector('.line-description').value = `Freight transportation - ${activeInquiry.freight_type || 'General freight'}`;
    firstItem.querySelector('.line-quantity').value = '1';
    calculateQuoteTotals();
  }
  showToast('Inquiry details added. Review all fields before generating.');
}

function safeFilePart(value) {
  return String(value || 'Client')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'Client';
}

function pdfSafe(value) {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function buildQuotePdf(quote) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) throw new Error('PDF generator failed to load.');

  const doc = new JsPdf({ unit: 'mm', format: 'a4', compress: true });
  const navy = [7, 20, 28];
  const orange = [243, 108, 33];
  const muted = [103, 116, 124];
  const light = [244, 245, 243];
  const left = 16;
  const right = 194;
  let y = 0;

  const drawPageHeader = (continuation = false) => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, 210, continuation ? 24 : 42, 'F');
    doc.setFillColor(...orange);
    doc.rect(0, 0, 5, continuation ? 24 : 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuation ? 16 : 23);
    doc.text('VESSEL', left, continuation ? 15 : 18);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('LOGISTICS GROUP LLC', left, continuation ? 20 : 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuation ? 11 : 18);
    doc.text(continuation ? 'QUOTE CONTINUED' : 'PREPAYMENT QUOTE', right, continuation ? 15 : 17, { align: 'right' });
    if (!continuation) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(pdfSafe(`${quote.quote_number}  |  Version ${quote.version}`), right, 24, { align: 'right' });
      doc.text(pdfSafe(`Issued ${new Date(quote.created_at).toLocaleDateString('en-US')}`), right, 29, { align: 'right' });
      doc.text(pdfSafe(`Valid until ${new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString('en-US')}`), right, 34, { align: 'right' });
    }
  };

  const addContinuationPage = () => {
    doc.addPage();
    drawPageHeader(true);
    return 32;
  };

  const sectionTitle = (title, currentY) => {
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(pdfSafe(title.toUpperCase()), left, currentY);
    doc.setDrawColor(220, 224, 225);
    doc.line(left, currentY + 2, right, currentY + 2);
    return currentY + 8;
  };

  const drawAddressBox = (x, width, title, lines) => {
    doc.setFillColor(...light);
    doc.roundedRect(x, y, width, 34, 1.5, 1.5, 'F');
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(title, x + 5, y + 7);
    doc.setTextColor(20, 31, 39);
    doc.setFontSize(9);
    lines.forEach((line, index) => {
      doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      const wrapped = doc.splitTextToSize(pdfSafe(line), width - 10);
      doc.text(wrapped.slice(0, 2), x + 5, y + 14 + index * 5);
    });
  };

  drawPageHeader();
  y = 51;
  drawAddressBox(left, 86, 'FROM', [DEMO_COMPANY_DETAILS.name, DEMO_COMPANY_DETAILS.address, `${DEMO_COMPANY_DETAILS.phone}  |  ${DEMO_COMPANY_DETAILS.email}`]);
  drawAddressBox(108, 86, 'BILL TO', [quote.client_company, quote.client_name, `${quote.client_email}  |  ${quote.client_phone || 'Phone not provided'}`]);
  y += 43;

  y = sectionTitle('Shipment details', y);
  doc.setFillColor(250, 250, 248);
  const freightLines = doc.splitTextToSize(pdfSafe(quote.freight_description), 166);
  const firstFreightLines = freightLines.slice(0, 26);
  const shipmentHeight = Math.max(37, 28 + firstFreightLines.length * 4);
  doc.rect(left, y, right - left, shipmentHeight, 'F');
  doc.setTextColor(...muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ROUTE', left + 5, y + 7);
  doc.text('TRUCK / EQUIPMENT', left + 5, y + 18);
  doc.text('WEIGHT', 103, y + 18);
  doc.text('DIMENSIONS', 145, y + 18);
  doc.text('FREIGHT', left + 5, y + 29);
  doc.setTextColor(20, 31, 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(pdfSafe(`${quote.origin} to ${quote.destination}`), left + 5, y + 12);
  doc.text(pdfSafe(quote.truck), left + 5, y + 23);
  doc.text(pdfSafe(quote.freight_weight), 103, y + 23);
  doc.text(pdfSafe(quote.freight_dimensions), 145, y + 23);
  doc.text(firstFreightLines, left + 5, y + 34);
  y += shipmentHeight + 10;

  let remainingFreightLines = freightLines.slice(26);
  while (remainingFreightLines.length) {
    y = addContinuationPage();
    y = sectionTitle('Freight details continued', y);
    const chunk = remainingFreightLines.slice(0, 52);
    remainingFreightLines = remainingFreightLines.slice(52);
    doc.setTextColor(35, 45, 52);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(chunk, left + 4, y + 2);
    y += chunk.length * 4 + 10;
  }

  const drawDetailRows = (title, rows) => {
    if (!rows.length) return;
    if (y + 18 > 260) y = addContinuationPage();
    y = sectionTitle(title, y);
    rows.forEach((row, index) => {
      const lines = doc.splitTextToSize(pdfSafe(row), right - left - 9);
      const height = Math.max(8, lines.length * 4 + 4);
      if (y + height > 265) {
        y = addContinuationPage();
        y = sectionTitle(`${title} continued`, y);
      }
      if (index % 2 === 0) {
        doc.setFillColor(248, 248, 246);
        doc.rect(left, y, right - left, height, 'F');
      }
      doc.setTextColor(35, 45, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(lines, left + 4, y + 5.5);
      y += height;
    });
    y += 8;
  };

  const packageRows = (Array.isArray(quote.package_groups) ? quote.package_groups : []).map((group, index) =>
    `${index + 1}. ${group.quantity} x ${group.packaging_type} | ${group.description} | ${group.weight_each_lb} lb each | ${group.length_each_in} x ${group.width_each_in} x ${group.height_each_in} in each`
  );
  drawDetailRows('Package groups', packageRows);

  const allocationRows = (Array.isArray(quote.truck_allocations) ? quote.truck_allocations : []).map(allocation => {
    const packages = (allocation.packages || []).map(item => `${item.quantity} x ${item.packaging_type} (${item.description})`).join('; ');
    return `${allocation.unit_number} - ${allocation.name} | ${allocation.truck_type} | ${Number(allocation.allocated_weight_lb).toLocaleString('en-US')} lb | ${packages}`;
  });
  drawDetailRows('Truck allocation', allocationRows);

  const drawPricingHeader = currentY => {
    doc.setFillColor(...navy);
    doc.rect(left, currentY, right - left, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('DESCRIPTION', left + 4, currentY + 5.2);
    doc.text('QTY', 117, currentY + 5.2, { align: 'right' });
    doc.text('UNIT PRICE', 155, currentY + 5.2, { align: 'right' });
    doc.text('AMOUNT', right - 4, currentY + 5.2, { align: 'right' });
    return currentY + 8;
  };

  y = sectionTitle('Pricing', y);
  y = drawPricingHeader(y);
  quote.line_items.forEach((item, index) => {
    const descriptionLines = doc.splitTextToSize(pdfSafe(item.description), 82);
    const rowHeight = Math.max(9, descriptionLines.length * 4 + 4);
    if (y + rowHeight > 260) {
      y = addContinuationPage();
      y = sectionTitle('Pricing continued', y);
      y = drawPricingHeader(y);
    }
    if (index % 2 === 0) {
      doc.setFillColor(248, 248, 246);
      doc.rect(left, y, right - left, rowHeight, 'F');
    }
    doc.setTextColor(25, 36, 43);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(descriptionLines, left + 4, y + 5.7);
    doc.text(pdfSafe(item.quantity), 117, y + 5.7, { align: 'right' });
    doc.text(formatMoney(item.unit_price), 155, y + 5.7, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(item.amount), right - 4, y + 5.7, { align: 'right' });
    y += rowHeight;
  });

  if (y + 35 > 260) y = addContinuationPage();
  y += 4;
  doc.setDrawColor(215, 219, 220);
  doc.line(125, y, right, y);
  const totals = [
    ['Subtotal', formatMoney(quote.subtotal)],
    [`Tax (${Number(quote.tax_rate)}%)`, formatMoney(quote.tax_amount)],
    ['TOTAL DUE', formatMoney(quote.total)]
  ];
  totals.forEach(([label, value], index) => {
    const rowY = y + 7 + index * 7;
    doc.setTextColor(index === 2 ? 20 : muted[0], index === 2 ? 31 : muted[1], index === 2 ? 39 : muted[2]);
    doc.setFont('helvetica', index === 2 ? 'bold' : 'normal');
    doc.setFontSize(index === 2 ? 10 : 8);
    doc.text(label, 128, rowY);
    doc.text(value, right, rowY, { align: 'right' });
  });
  y += 34;

  if (y + 58 > 266) y = addContinuationPage();
  y = sectionTitle('Payment and terms', y);
  doc.setFillColor(255, 247, 241);
  doc.rect(left, y, right - left, 47, 'F');
  doc.setTextColor(181, 67, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DEMO PAYMENT DETAILS - DO NOT USE FOR A REAL TRANSFER', left + 5, y + 7);
  doc.setTextColor(35, 45, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const paymentLines = [
    `Method: ${DEMO_COMPANY_DETAILS.paymentMethod}`,
    `Bank: ${DEMO_COMPANY_DETAILS.bank}`,
    `Routing: ${DEMO_COMPANY_DETAILS.routingNumber}`,
    `Account: ${DEMO_COMPANY_DETAILS.accountNumber}`,
    `${DEMO_COMPANY_DETAILS.usdot}  |  ${DEMO_COMPANY_DETAILS.mc}`
  ];
  paymentLines.forEach((line, index) => doc.text(pdfSafe(line), left + 5, y + 14 + index * 5));
  const termsLines = doc.splitTextToSize(pdfSafe(quote.payment_terms), 80);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS', 108, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(termsLines.slice(0, 6), 108, y + 20);
  y += 54;

  let remainingTermsLines = termsLines.slice(6);
  while (remainingTermsLines.length) {
    y = addContinuationPage();
    y = sectionTitle('Payment terms continued', y);
    const chunk = remainingTermsLines.slice(0, 52);
    remainingTermsLines = remainingTermsLines.slice(52);
    doc.setTextColor(40, 50, 57);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(chunk, left + 4, y + 2);
    y += chunk.length * 4 + 10;
  }

  if (quote.notes) {
    let noteLines = doc.splitTextToSize(pdfSafe(quote.notes), right - left - 10);
    if (y + 22 > 270) y = addContinuationPage();
    y = sectionTitle('Additional notes', y);
    while (noteLines.length) {
      const availableLines = Math.max(1, Math.floor((270 - y) / 4));
      const chunk = noteLines.slice(0, availableLines);
      noteLines = noteLines.slice(availableLines);
      doc.setTextColor(40, 50, 57);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(chunk, left + 4, y + 2);
      y += chunk.length * 4 + 5;
      if (noteLines.length) {
        y = addContinuationPage();
        y = sectionTitle('Additional notes continued', y);
      }
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 223, 224);
    doc.line(left, 281, right, 281);
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('This prepayment quote uses fictional demo company and banking information.', left, 287);
    doc.text(`Page ${page} of ${pageCount}`, right, 287, { align: 'right' });
  }

  doc.setProperties({
    title: pdfSafe(`${quote.client_company} Quote ${quote.quote_number}`),
    subject: 'Freight prepayment quote',
    author: DEMO_COMPANY_DETAILS.name,
    creator: 'Vessel Logistics Dashboard'
  });
  return doc;
}

function downloadGeneratedQuote() {
  if (!generatedQuote) return;
  const url = URL.createObjectURL(generatedQuote.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = generatedQuote.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sendGeneratedQuote() {
  if (!generatedQuote) return;
  downloadGeneratedQuote();
  const { quote, fileName } = generatedQuote;
  const subject = `Vessel Logistics prepayment quote ${quote.quote_number}`;
  const body = `Hi ${quote.client_name},\n\nPlease find your Vessel Logistics prepayment quote ${quote.quote_number} attached.\n\nThe PDF has been downloaded as ${fileName}. Please attach it to this email before sending.\n\nBest regards,\nVessel Logistics Group LLC`;
  window.location.href = `mailto:${encodeURIComponent(quote.client_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

document.querySelector('#add-line-item').addEventListener('click', () => createLineItem());
truckSelect.addEventListener('change', renderTruckAllocations);
taxRateInput.addEventListener('input', calculateQuoteTotals);
document.querySelector('#fill-inquiry-btn').addEventListener('click', fillFromInquiry);
document.querySelector('#quote-modal-close').addEventListener('click', closeQuoteModal);
document.querySelector('#quote-cancel').addEventListener('click', closeQuoteModal);
document.querySelector('#download-quote-btn').addEventListener('click', downloadGeneratedQuote);
document.querySelector('#send-quote-btn').addEventListener('click', sendGeneratedQuote);
quoteModal.addEventListener('click', event => {
  if (event.target === quoteModal) closeQuoteModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !quoteModal.hidden) closeQuoteModal();
  if (event.key === 'Escape' && !fleetModal.hidden) closeFleetModal();
});

quoteForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeInquiry || !activeQuoteMeta) return;
  if (!window.jspdf?.jsPDF) {
    showToast('PDF generator is unavailable. Refresh and try again.', true);
    return;
  }

  const totals = calculateQuoteTotals();
  if (!totals.items.length || totals.items.some(item => !item.description || item.quantity <= 0 || item.unit_price < 0)) {
    showToast('Complete every pricing item.', true);
    return;
  }

  let truckSelection;
  try {
    truckSelection = collectTruckAllocations();
  } catch (allocationError) {
    showToast(allocationError.message, true);
    return;
  }

  const formData = new FormData(quoteForm);
  const payload = {
    quote_request_id: activeInquiry.id,
    quote_number: activeQuoteMeta.quoteNumber,
    version: activeQuoteMeta.version,
    truck: truckSelection.selectedTrucks.map(truck => `${truck.unit_number} ${truck.truck_type}`).join(', '),
    truck_ids: truckSelection.selectedTrucks.map(truck => truck.id),
    truck_allocations: truckSelection.allocations,
    package_groups: Array.isArray(activeInquiry.package_groups) ? activeInquiry.package_groups : [],
    total_length_in: activeInquiry.total_length_in,
    total_width_in: activeInquiry.total_width_in,
    total_height_in: activeInquiry.total_height_in,
    total_weight_lb: activeInquiry.total_weight_lb,
    freight_dimensions: String(formData.get('freight_dimensions') || '').trim(),
    freight_weight: String(formData.get('freight_weight') || '').trim(),
    freight_description: String(formData.get('freight_description') || '').trim(),
    client_name: String(formData.get('client_name') || '').trim(),
    client_company: String(formData.get('client_company') || '').trim(),
    client_email: String(formData.get('client_email') || '').trim(),
    client_phone: String(formData.get('client_phone') || '').trim(),
    origin: String(formData.get('origin') || '').trim(),
    destination: String(formData.get('destination') || '').trim(),
    line_items: totals.items,
    subtotal: totals.subtotal,
    tax_rate: totals.taxRate,
    tax_amount: totals.taxAmount,
    total: totals.total,
    valid_until: String(formData.get('valid_until') || ''),
    payment_terms: String(formData.get('payment_terms') || '').trim(),
    notes: String(formData.get('notes') || '').trim(),
    company_details: DEMO_COMPANY_DETAILS
  };

  const button = document.querySelector('#generate-quote-btn');
  button.disabled = true;
  button.textContent = 'Saving & generating...';

  let data;
  try {
    data = (await apiRequest('quote_create', payload)).data;
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save & generate PDF';
    console.error('Quote creation failed:', error);
    showToast(error.message || 'Could not save the quote.', true);
    return;
  }
  button.disabled = false;
  button.textContent = 'Save & generate PDF';

  try {
    const pdf = buildQuotePdf(data);
    const fileName = `${safeFilePart(data.client_company)}-Quote-${new Date(data.created_at).toISOString().slice(0, 10)}.pdf`;
    generatedQuote = { quote: data, pdf, blob: pdf.output('blob'), fileName };
    freightQuotes.unshift({ id: data.id, quote_request_id: data.quote_request_id, quote_number: data.quote_number, version: data.version, truck_ids: data.truck_ids, created_at: data.created_at });
    document.querySelector('#quote-file-name').textContent = fileName;
    document.querySelector('#quote-file-meta').textContent = `${data.quote_number} · Version ${data.version} · Saved to Supabase`;
    quoteForm.hidden = true;
    quoteResult.hidden = false;
    document.querySelector('#download-quote-btn').focus();
    showToast('Quote saved and PDF created.');
  } catch (pdfError) {
    console.error('PDF generation failed:', pdfError);
    showToast('Quote was saved, but PDF generation failed.', true);
  }
});

initialize();
