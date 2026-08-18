const sidebar = document.getElementById("sidebar");

const map = L.map("map", { zoomControl: true }).setView([40.734, -73.994], 13);

// CARTO Voyager: free, no API key, and visually close to Google Maps'
// default roadmap style (light background, colored roads, clear labels).
L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  }
).addTo(map);

const RADIUS_MILES = 0.3;
const METERS_PER_MILE = 1609.34;

let activeMarker = null;
let activeIsHotel = false;
let distanceModeActive = false;

sidebar.addEventListener("transitionend", (event) => {
  if (event.propertyName === "width") {
    map.invalidateSize();
  }
});

function openSidebar() {
  sidebar.classList.add("sidebar--open");
}

function renderPropertyPanel(hotel) {
  sidebar.innerHTML = `
    <div class="property-panel">
      <div class="property-panel__header">
        <div>
          <div class="brand-tag">
            <span class="brand-tag__badge" style="background:${hotel.brandColor}">${hotel.letter}</span>
            ${hotel.brandLabel}
          </div>
          <h2 class="property-panel__name">${hotel.name}</h2>
        </div>
        <button class="property-panel__close" id="closePanel" aria-label="Close">✕</button>
      </div>
      <div class="property-panel__row">
        <span class="property-panel__row-label">Address</span>
        <span>${hotel.address}</span>
      </div>
      <div class="property-panel__row">
        <span class="property-panel__row-label">Phone</span>
        <span>${hotel.phone}</span>
      </div>
    </div>
  `;

  openSidebar();
  document.getElementById("closePanel").addEventListener("click", closePanel);
}

function renderPoiPanel(poi) {
  sidebar.innerHTML = `
    <div class="property-panel">
      <div class="property-panel__header">
        <div>
          <div class="brand-tag">
            <span class="brand-tag__badge brand-tag__badge--icon" style="background:${poi.color}">${poi.icon}</span>
            ${poi.category}
          </div>
          <h2 class="property-panel__name">${poi.name}</h2>
        </div>
        <button class="property-panel__close" id="closePanel" aria-label="Close">✕</button>
      </div>
      <p class="hint">Fake point of interest — no address/phone in this POC.</p>
    </div>
  `;

  openSidebar();
  document.getElementById("closePanel").addEventListener("click", closePanel);
}

function closePanel() {
  sidebar.classList.remove("sidebar--open");
  if (activeMarker) {
    activeMarker._icon?.classList.remove("marker-badge--active");
    activeMarker = null;
  }
  activeIsHotel = false;
  clearDistanceRadiusAndMarkers();
}

function makeBadgeIcon({ size, background, content, extraClass = "" }) {
  return L.divIcon({
    className: "msc-marker",
    html: `<div class="marker-badge ${extraClass}" style="width:${size}px;height:${size}px;background:${background}">${content}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Hotels always just select/open normally — the toggle never changes this.
// Whichever hotel is currently open is the origin for the simulated batch
// distance lookup below, and selecting a new one re-triggers it.
function handleHotelClick(hotel, marker) {
  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = true;
  if (distanceModeActive) {
    triggerDistanceBatch();
  }
  renderPropertyPanel(hotel);
}

function handlePoiClick(poi, marker) {
  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = false;
  clearDistanceRadiusAndMarkers();
  renderPoiPanel(poi);
}

const allBounds = [];
const poiEntries = [];

FAKE_HOTELS.forEach((hotel) => {
  const marker = L.marker([hotel.lat, hotel.lng], {
    icon: makeBadgeIcon({
      size: 44,
      background: hotel.brandColor,
      content: hotel.letter,
      extraClass: "marker-badge--hotel",
    }),
  }).addTo(map);

  marker.bindTooltip(hotel.name, { direction: "top", offset: [0, -20] });
  marker.on("click", () => handleHotelClick(hotel, marker));

  allBounds.push([hotel.lat, hotel.lng]);
});

FAKE_POIS.forEach((poi) => {
  const marker = L.marker([poi.lat, poi.lng], {
    icon: makeBadgeIcon({
      size: 30,
      background: poi.color,
      content: poi.icon,
      extraClass: "marker-badge--poi",
    }),
  }).addTo(map);

  marker.bindTooltip(poi.name, { direction: "top", offset: [0, -14] });
  marker.on("click", () => handlePoiClick(poi, marker));

  poiEntries.push({ poi, marker });
  allBounds.push([poi.lat, poi.lng]);
});

map.fitBounds(allBounds, { padding: [60, 60], maxZoom: 15 });

const legend = L.control({ position: "bottomleft" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  const hotelItems = FAKE_HOTELS.map(
    (h) =>
      `<div class="legend-item"><span class="legend-dot" style="background:${h.brandColor}">${h.letter}</span>${h.name}</div>`
  ).join("");
  const poiItems = FAKE_POIS.map(
    (p) =>
      `<div class="legend-item"><span class="legend-dot legend-dot--icon" style="background:${p.color}">${p.icon}</span>${p.category}</div>`
  ).join("");
  div.innerHTML = `
    <div class="legend-title">Hotels</div>
    ${hotelItems}
    <div class="legend-title legend-title--spaced">Points of Interest</div>
    ${poiItems}
    <div class="legend-note">Dashed circle = simulated ${RADIUS_MILES} mi batch-distance radius</div>
  `;
  return div;
};
legend.addTo(map);

// --- Distance Toggle (MSC-10368 idea — batched + radius-limited) ---
// This simulates what a real HERE Matrix Routing batch call would give you:
// one request, one origin (the selected hotel), many destinations (POIs
// inside the radius) — instead of one paid call per POI. POIs outside the
// radius fall back to the on-demand "Get Distance" button from suggestion-2,
// so cost stays bounded no matter how many total POIs exist. No real API
// call is made here — timeouts stand in for the network round trip.

const distanceAuxMarkers = new Map(); // poi.id -> { marker, mode: "button" | "loading" | "box" }
let radiusCircle = null;
let batchToken = 0;

function makeDistanceButtonIcon() {
  return L.divIcon({
    className: "distance-aux-icon",
    html: `<div class="distance-icon-badge">Get Distance</div>`,
    iconSize: [92, 26],
    iconAnchor: [-14, 13],
  });
}

function makeDistanceLoadingIcon() {
  return L.divIcon({
    className: "distance-aux-icon",
    html: `<div class="distance-icon-badge distance-icon-badge--loading">Loading…</div>`,
    iconSize: [92, 26],
    iconAnchor: [-14, 13],
  });
}

function makeDistanceBoxIcon(poi, miles) {
  return L.divIcon({
    className: "distance-aux-icon",
    html: `
      <div class="distance-box">
        <div class="distance-box__value">${miles.toFixed(2)} miles away</div>
        <div class="distance-box__name">${poi.name}</div>
      </div>
    `,
    iconSize: [170, 46],
    iconAnchor: [-22, 23],
  });
}

function setToggleHint(text) {
  const hintEl = distanceControlEl?.querySelector(".distance-toggle-hint");
  if (hintEl) hintEl.textContent = text;
}

function clearDistanceRadiusAndMarkers() {
  batchToken += 1; // invalidate any in-flight simulated requests
  if (radiusCircle) {
    map.removeLayer(radiusCircle);
    radiusCircle = null;
  }
  distanceAuxMarkers.forEach(({ marker }) => map.removeLayer(marker));
  distanceAuxMarkers.clear();
  setToggleHint("Select a hotel to auto-show distances for nearby points of interest");
}

function addAuxMarker(poi, marker, mode, miles) {
  const icon = mode === "box" ? makeDistanceBoxIcon(poi, miles) : makeDistanceButtonIcon();
  const auxMarker = L.marker(marker.getLatLng(), { icon, zIndexOffset: 1000 }).addTo(map);
  const entry = { marker: auxMarker, mode };
  distanceAuxMarkers.set(poi.id, entry);

  if (mode === "button") {
    auxMarker.on("click", () => {
      if (distanceAuxMarkers.get(poi.id) !== entry || entry.mode !== "button") return;
      entry.mode = "loading";
      auxMarker.setIcon(makeDistanceLoadingIcon());

      // Simulates a single on-demand routing call for this one POI.
      setTimeout(() => {
        if (distanceAuxMarkers.get(poi.id) !== entry || !activeMarker) return;
        const freshMiles = map.distance(activeMarker.getLatLng(), marker.getLatLng()) / METERS_PER_MILE;
        auxMarker.setIcon(makeDistanceBoxIcon(poi, freshMiles));
        entry.mode = "box";
      }, 350);
    });
  }
}

function triggerDistanceBatch() {
  clearDistanceRadiusAndMarkers();
  if (!distanceModeActive || !activeIsHotel || !activeMarker) return;

  const myToken = ++batchToken;
  const hotelLatLng = activeMarker.getLatLng();

  radiusCircle = L.circle(hotelLatLng, {
    radius: RADIUS_MILES * METERS_PER_MILE,
    color: "#2563eb",
    weight: 2,
    dashArray: "6 6",
    fillColor: "#2563eb",
    fillOpacity: 0.06,
    interactive: false,
  }).addTo(map);

  setToggleHint("Fetching nearby distances (simulated batch call)…");

  // Simulates one Matrix Routing call: one origin (this hotel), many
  // destinations (every POI inside the radius) returned together.
  setTimeout(() => {
    if (myToken !== batchToken) return; // a newer selection superseded this one

    let nearCount = 0;
    poiEntries.forEach(({ poi, marker }) => {
      const miles = map.distance(hotelLatLng, marker.getLatLng()) / METERS_PER_MILE;
      if (miles <= RADIUS_MILES) {
        addAuxMarker(poi, marker, "box", miles);
        nearCount += 1;
      } else {
        addAuxMarker(poi, marker, "button", null);
      }
    });

    setToggleHint(
      `${nearCount} nearby POI(s) auto-shown within ${RADIUS_MILES} mi — click "Get Distance" for the rest`
    );
  }, 600);
}

const distanceControl = L.control({ position: "bottomright" });
distanceControl.onAdd = function () {
  const div = L.DomUtil.create("div", "distance-toggle-control");
  div.innerHTML = `
    <div class="distance-toggle-row">
      <label class="switch">
        <input type="checkbox" id="distanceToggle" />
        <span class="switch-slider"></span>
      </label>
      <span class="distance-toggle-label">Distance</span>
      <span class="distance-toggle-unit">mi</span>
    </div>
    <div class="distance-toggle-hint">Select a hotel to auto-show distances for nearby points of interest</div>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
distanceControl.addTo(map);

const distanceControlEl = distanceControl.getContainer();

document.getElementById("distanceToggle").addEventListener("change", (event) => {
  distanceModeActive = event.target.checked;
  distanceControlEl.classList.toggle("distance-toggle-control--active", distanceModeActive);
  if (distanceModeActive && activeIsHotel && activeMarker) {
    triggerDistanceBatch();
  } else {
    clearDistanceRadiusAndMarkers();
  }
});
