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
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

form?.addEventListener('submit', async event => {
  event.preventDefault();

  const formData = new FormData(form);
  if (formData.get('fax_number')) {
    status.textContent = 'Thank you. Your quote request has been received.';
    form.reset();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.innerHTML;
  const optionalValue = key => String(formData.get(key) || '').trim() || null;
  const payload = {
    name: String(formData.get('name') || '').trim(),
    company: String(formData.get('company') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    freight_type: String(formData.get('freight_type') || '').trim(),
    freight_weight: String(formData.get('freight_weight') || '').trim(),
    freight_dimensions: String(formData.get('freight_dimensions') || '').trim(),
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
