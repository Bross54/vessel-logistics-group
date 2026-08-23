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
  if (formData.get('website')) {
    status.textContent = 'Thank you. Your quote request has been received.';
    form.reset();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.innerHTML;
  const optionalValue = key => String(formData.get(key) || '').trim() || null;
  const payload = {
    name: String(formData.get('name') || '').trim(),
    company: optionalValue('company'),
    email: String(formData.get('email') || '').trim(),
    phone: optionalValue('phone'),
    pickup_city_state: optionalValue('pickup_city_state'),
    delivery_city_state: optionalValue('delivery_city_state'),
    load_details: optionalValue('load_details'),
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
