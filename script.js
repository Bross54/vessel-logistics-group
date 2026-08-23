const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
const form = document.querySelector('#demo-form');
const status = document.querySelector('.form-status');
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
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

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

form?.elements.namedItem('phone')?.addEventListener('input', event => {
  event.currentTarget.value = formatUsPhone(event.currentTarget.value);
  event.currentTarget.setCustomValidity('');
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(form);

  if (formData.get('fax_number')) {
    status.textContent = 'Thank you. Your message has been received.';
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

  if (formData.get('sms_consent') !== 'yes') {
    form.elements.namedItem('sms_consent').reportValidity();
    return;
  }

  const firstName = String(formData.get('first_name') || '').trim();
  const lastName = String(formData.get('last_name') || '').trim();
  const subject = String(formData.get('subject') || '').trim();
  const payload = {
    name: `${firstName} ${lastName}`.trim(),
    company: 'Website contact',
    email: String(formData.get('email') || '').trim(),
    phone: formatUsPhone(phoneInput.value),
    phone_e164: phoneE164,
    freight_type: subject,
    load_details: String(formData.get('message') || '').trim(),
    additional_comment: `SMS consent provided: Yes · ${new Date().toISOString()}`,
    source_page: 'vessel-logistics-website'
  };

  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.innerHTML;
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
    status.textContent = 'Thank you. Your message has been received.';
    form.reset();
  } catch (error) {
    console.error('Contact form submission failed:', error);
    status.textContent = 'We could not send your message. Please try again in a moment.';
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
      body: JSON.stringify({ session_id: sessionId, visitor_id: visitorId, event_type: eventType, duration_seconds: durationSeconds, page_path: window.location.pathname })
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
