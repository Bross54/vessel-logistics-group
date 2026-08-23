const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
const form = document.querySelector('#demo-form');
const status = document.querySelector('.form-status');
const packageGroups = document.querySelector('#package-groups');
const packageTemplate = document.querySelector('#package-group-template');
const totalPackages = document.querySelector('#total-packages');
const totalWeight = document.querySelector('#total-weight');
const SUPABASE_URL = 'https://evdmcrrzuqfotlmtpxjs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ci1j_1o0-B_yNtvnwqcHgQ_7uUBdAet';

const setHeader = () => header.classList.toggle('scrolled', window.scrollY > 30);
setHeader();
window.addEventListener('scroll', setHeader, { passive: true });

toggle?.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
});

document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  });
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

function formatUsPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeUsPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '');
  return /^[2-9]\d{9}$/.test(digits) ? `+1${digits}` : null;
}

function updateCargoTotals() {
  const groups = [...packageGroups.querySelectorAll('.package-group')];
  const packageCount = groups.reduce((sum, group) => sum + (Number(group.querySelector('.package-quantity').value) || 0), 0);
  const weight = groups.reduce((sum, group) => {
    return sum + (Number(group.querySelector('.package-quantity').value) || 0) * (Number(group.querySelector('.package-weight').value) || 0);
  }, 0);
  totalPackages.value = packageCount;
  totalWeight.value = Math.round(weight * 100) / 100;
  groups.forEach(group => {
    group.querySelector('.remove-package-group').disabled = groups.length === 1;
  });
}

function addPackageGroup(values = {}) {
  const fragment = packageTemplate.content.cloneNode(true);
  const group = fragment.querySelector('.package-group');
  const type = group.querySelector('.package-type');
  type.value = values.packaging_type || '';
  group.querySelector('.package-type-other').value = values.packaging_type_other || '';
  group.querySelector('.package-description').value = values.description || '';
  group.querySelector('.package-quantity').value = values.quantity || 1;
  group.querySelector('.package-weight').value = values.weight_each_lb || '';
  group.querySelector('.package-length').value = values.length_each_in || '';
  group.querySelector('.package-width').value = values.width_each_in || '';
  group.querySelector('.package-height').value = values.height_each_in || '';

  const toggleOther = () => {
    const otherField = group.querySelector('.other-package-field');
    const otherInput = group.querySelector('.package-type-other');
    otherField.hidden = type.value !== 'Other';
    otherInput.required = type.value === 'Other';
  };
  type.addEventListener('change', toggleOther);
  group.querySelectorAll('input').forEach(input => input.addEventListener('input', updateCargoTotals));
  group.querySelector('.remove-package-group').addEventListener('click', () => {
    group.remove();
    updateCargoTotals();
  });
  toggleOther();
  packageGroups.append(group);
  updateCargoTotals();
}

function collectPackageGroups() {
  return [...packageGroups.querySelectorAll('.package-group')].map((group, index) => {
    const selectedType = group.querySelector('.package-type').value;
    return {
      id: `group-${index + 1}`,
      packaging_type: selectedType === 'Other' ? group.querySelector('.package-type-other').value.trim() : selectedType,
      description: group.querySelector('.package-description').value.trim(),
      quantity: Number(group.querySelector('.package-quantity').value),
      weight_each_lb: Number(group.querySelector('.package-weight').value),
      length_each_in: Number(group.querySelector('.package-length').value),
      width_each_in: Number(group.querySelector('.package-width').value),
      height_each_in: Number(group.querySelector('.package-height').value)
    };
  });
}

document.querySelector('#add-package-group')?.addEventListener('click', () => addPackageGroup());
form?.elements.namedItem('phone')?.addEventListener('input', event => {
  event.currentTarget.value = formatUsPhone(event.currentTarget.value);
  event.currentTarget.setCustomValidity('');
});
addPackageGroup();

form?.addEventListener('submit', async event => {
  event.preventDefault();

  const formData = new FormData(form);
  if (formData.get('fax_number')) {
    status.textContent = 'Thank you. Your quote request has been received.';
    form.reset();
    return;
  }

  const phoneInput = form.elements.namedItem('phone');
  const phoneE164 = normalizeUsPhone(phoneInput.value);
  if (!phoneE164) {
    phoneInput.setCustomValidity('Enter a valid 10-digit U.S. phone number.');
    phoneInput.reportValidity();
    return;
  }

  const groups = collectPackageGroups();
  const calculatedWeight = groups.reduce((sum, group) => sum + group.quantity * group.weight_each_lb, 0);
  if (!groups.length || groups.some(group => !group.packaging_type || !group.description || group.quantity <= 0 || group.weight_each_lb <= 0 || group.length_each_in <= 0 || group.width_each_in <= 0 || group.height_each_in <= 0) || calculatedWeight <= 0) {
    status.textContent = 'Complete all cargo package information.';
    form.reportValidity();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.innerHTML;
  const optionalValue = key => String(formData.get(key) || '').trim() || null;
  const payload = {
    name: String(formData.get('name') || '').trim(),
    company: String(formData.get('company') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    phone: formatUsPhone(phoneInput.value),
    phone_e164: phoneE164,
    freight_type: String(formData.get('freight_type') || '').trim(),
    freight_weight: `${calculatedWeight.toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`,
    freight_dimensions: `${formData.get('total_length_in')} × ${formData.get('total_width_in')} × ${formData.get('total_height_in')} in`,
    total_length_in: Number(formData.get('total_length_in')),
    total_width_in: Number(formData.get('total_width_in')),
    total_height_in: Number(formData.get('total_height_in')),
    total_weight_lb: Math.round(calculatedWeight * 100) / 100,
    package_groups: groups,
    pickup_city_state: String(formData.get('pickup_city_state') || '').trim(),
    delivery_city_state: String(formData.get('delivery_city_state') || '').trim(),
    load_details: String(formData.get('load_details') || '').trim(),
    additional_comment: optionalValue('additional_comment'),
    source_page: 'vessel-logistics-website'
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';
  status.textContent = '';

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/quote_requests`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    status.textContent = 'Thank you. Your quote request has been received.';
    form.reset();
    packageGroups.replaceChildren();
    addPackageGroup();
  } catch (error) {
    console.error('Quote request submission failed:', error);
    status.textContent = 'We could not send your request. Please try again in a moment.';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonText;
  }
});

document.querySelector('#year').textContent = new Date().getFullYear();

function getOrCreateVisitorId() {
  const storageKey = 'vessel_visitor_id';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(storageKey, created);
  return created;
}

function startHomepageAnalytics() {
  if (!['/', '/index.html'].includes(window.location.pathname)) return;

  const visitorId = getOrCreateVisitorId();
  const sessionId = crypto.randomUUID();
  const startedAt = Date.now();
  let lastDurationSent = -1;

  const sendEvent = (eventType, keepalive = false) => {
    const durationSeconds = Math.min(43200, Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    if (eventType === 'heartbeat' && durationSeconds === lastDurationSent) return;
    lastDurationSent = durationSeconds;

    fetch(`${SUPABASE_URL}/rest/v1/page_events`, {
      method: 'POST',
      keepalive,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        session_id: sessionId,
        visitor_id: visitorId,
        event_type: eventType,
        duration_seconds: durationSeconds,
        page_path: window.location.pathname
      })
    }).catch(() => {});
  };

  sendEvent('session_start');
  const heartbeat = window.setInterval(() => {
    if (document.visibilityState === 'visible') sendEvent('heartbeat');
  }, 30000);

  window.addEventListener('pagehide', () => {
    window.clearInterval(heartbeat);
    sendEvent('session_end', true);
  }, { once: true });
}

startHomepageAnalytics();
