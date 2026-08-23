# Vessel Logistics Group LLC — Demo Website

Responsive freight logistics website with Supabase-backed quote requests, private dashboard, and first-party homepage analytics.

## Included

- Orange Vessel Logistics landing page
- Expanded Request a Quote form for U.S. freight shipments
- Supabase storage for every quote request
- Anonymous homepage session analytics
- Private Supabase Auth dashboard at `/dashboard`
- 30-day visitor and average-session-duration charts
- Searchable, expandable quote list with email contact actions
- Responsive navigation and mobile layout
- Netlify-ready routing and configuration

## Preview locally

Open `index.html` directly in a browser, or run a simple static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The dashboard is available at `http://localhost:8080/dashboard.html`.

## Deploy on Netlify

Import this repository into Netlify. No build command is needed and the publish directory is `.`. The included redirects serve `dashboard.html` at `/dashboard`.

Homepage analytics begin accumulating after the analytics-enabled version is deployed; earlier visit duration cannot be reconstructed.
