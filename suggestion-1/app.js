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
  clearDistanceBox();
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
// Distance feature below.
function handleHotelClick(hotel, marker) {
  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = true;
  clearDistanceBox();
  renderPropertyPanel(hotel);
}

// POIs behave normally (open their own panel) UNLESS the Distance toggle is
// on AND a hotel is currently selected — then clicking a POI shows a fake
// distance box from that hotel instead of opening the POI's own panel.
function handlePoiClick(poi, marker) {
  if (distanceModeActive) {
    if (activeIsHotel && activeMarker) {
      showDistanceBoxFor(poi, marker);
    }
    return;
  }

  activeMarker?._icon?.classList.remove("marker-badge--active");
  marker._icon?.classList.add("marker-badge--active");
  activeMarker = marker;
  activeIsHotel = false;
  renderPoiPanel(poi);
}

const allBounds = [];

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

// --- Distance Toggle (MSC-10368 idea II) ---
// The reference point is always whichever hotel is currently open in the
// sidebar. With the toggle on, clicking a point of interest shows a distance
// box (styled like the original) instead of opening that POI's own panel.
// Clicking a different hotel just selects it, same as normal browsing.

let distanceBoxMarker = null;
let distanceBoxPoiId = null;

function clearDistanceBox() {
  if (distanceBoxMarker) {
    map.removeLayer(distanceBoxMarker);
    distanceBoxMarker = null;
    distanceBoxPoiId = null;
  }
}

function showDistanceBoxFor(poi, marker) {
  if (distanceBoxPoiId === poi.id) {
    clearDistanceBox();
    return;
  }

  clearDistanceBox();

  const miles = map.distance(activeMarker.getLatLng(), marker.getLatLng()) / 1609.34;

  const icon = L.divIcon({
    className: "distance-box-icon",
    html: `
      <div class="distance-box">
        <div class="distance-box__value">${miles.toFixed(2)} miles away</div>
        <div class="distance-box__name">${poi.name}</div>
      </div>
    `,
    iconSize: [170, 46],
    iconAnchor: [-22, 23],
  });

  distanceBoxMarker = L.marker(marker.getLatLng(), {
    icon,
    interactive: false,
    zIndexOffset: 1000,
    keyboard: false,
  }).addTo(map);
  distanceBoxPoiId = poi.id;
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
    <div class="distance-toggle-hint">Select a hotel, then click a point of interest</div>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
distanceControl.addTo(map);

const distanceControlEl = distanceControl.getContainer();

document.getElementById("distanceToggle").addEventListener("change", (event) => {
  distanceModeActive = event.target.checked;
  distanceControlEl.classList.toggle("distance-toggle-control--active", distanceModeActive);
  if (!distanceModeActive) {
    clearDistanceBox();
  }
});
