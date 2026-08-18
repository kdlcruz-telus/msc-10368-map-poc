const sidebar = document.getElementById("sidebar");

const map = L.map("map", { zoomControl: true }).setView([40.735, -73.995], 14);

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
  hideDistanceIcons();
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
// Whichever hotel is currently open becomes the reference point for the
// Distance feature below, and selecting a new one resets every revealed
// distance box back to its icon.
function handleHotelClick(hotel, marker) {
  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = true;
  if (distanceModeActive) {
    if (distanceAuxMarkers.size === 0) {
      showDistanceIcons();
    } else {
      resetAllDistanceIcons();
    }
  }
  renderPropertyPanel(hotel);
}

function handlePoiClick(poi, marker) {
  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = false;
  hideDistanceIcons();
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
  `;
  return div;
};
legend.addTo(map);

// --- Distance Toggle (MSC-10368 idea) ---
// The distance icon on each point of interest is only visible when the
// toggle is on AND a hotel is currently selected. Clicking that icon swaps
// it for a distance box showing the real distance from the selected hotel.
// Selecting a different hotel reverts every revealed box back to its icon,
// since the distance is no longer accurate.

const distanceAuxMarkers = new Map(); // poi.id -> { marker, mode: "icon" | "box" }

// Placeholder text button standing in for a real distance icon (TBD design).
function makeDistanceIconIcon() {
  return L.divIcon({
    className: "distance-aux-icon",
    html: `<div class="distance-icon-badge">Get Distance</div>`,
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

function showDistanceIcons() {
  poiEntries.forEach(({ poi, marker }) => {
    const auxMarker = L.marker(marker.getLatLng(), {
      icon: makeDistanceIconIcon(),
      zIndexOffset: 1000,
    }).addTo(map);

    auxMarker.on("click", () => {
      const entry = distanceAuxMarkers.get(poi.id);
      if (!entry || entry.mode !== "icon") return;
      if (!activeIsHotel || !activeMarker) return;

      const miles = map.distance(activeMarker.getLatLng(), marker.getLatLng()) / 1609.34;
      auxMarker.setIcon(makeDistanceBoxIcon(poi, miles));
      entry.mode = "box";
    });

    distanceAuxMarkers.set(poi.id, { marker: auxMarker, mode: "icon" });
  });
}

function hideDistanceIcons() {
  distanceAuxMarkers.forEach(({ marker }) => map.removeLayer(marker));
  distanceAuxMarkers.clear();
}

function resetAllDistanceIcons() {
  distanceAuxMarkers.forEach((entry, poiId) => {
    if (entry.mode === "box") {
      entry.marker.setIcon(makeDistanceIconIcon());
      entry.mode = "icon";
    }
  });
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
    <div class="distance-toggle-hint">Select a hotel, then click "Get Distance" on a point of interest</div>
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
    showDistanceIcons();
  } else {
    hideDistanceIcons();
  }
});
