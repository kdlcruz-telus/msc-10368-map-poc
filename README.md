# MSC-10368 Map UX Spike (POC)

A small, standalone proof of concept replicating the core UX of Sales
Companion's search map — a map with property circles, and clicking a circle
opens that property's details in a panel on the left — using entirely fake
data. Built to support the investigation in
[MSC-10368](https://maark.atlassian.net/browse/MSC-10368) (changing the
search map's displayed distance from linear to driving distance), as a base
to prototype distance-related UX ideas on top of.

**Live demo:** https://kdlcruz-telus.github.io/msc-10368-map-poc/

## What this is

- Plain HTML/CSS/JS, no build step, no framework.
- [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles (no API key
  required).
- All hotel names, brands, addresses, and phone numbers are fictional.
- No backend, no distance calculation yet — that's the next iteration on top
  of this base.

## Running locally

Just open `index.html` in a browser, or serve the folder with any static
file server, e.g.:

```bash
npx serve .
```

## Deployment

Served via GitHub Pages from the `main` branch root — any push to `main`
updates the live site.
