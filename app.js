const sidebar = document.getElementById("sidebar");

const map = L.map("map", { zoomControl: true }).setView([40.735, -73.995], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

let activeMarker = null;

function renderPlaceholder() {
  sidebar.innerHTML = `
    <div class="sidebar-placeholder">
      <h1>MSC-10368 Map UX Spike</h1>
      <p>Fake-data proof of concept replicating the Sales Companion search map: circles on the map, click one to open its details here on the left.</p>
      <p class="hint">Click any circle on the map to get started.</p>
    </div>
  `;
}

function renderPropertyPanel(hotel) {
  sidebar.innerHTML = `
    <div class="property-panel">
      <div class="property-panel__header">
        <div>
          <div class="brand-tag">
            <span class="brand-tag__dot" style="background:${hotel.brandColor}"></span>
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

  document.getElementById("closePanel").addEventListener("click", () => {
    renderPlaceholder();
    if (activeMarker) {
      activeMarker.setStyle({ weight: 1 });
      activeMarker = null;
    }
  });
}

FAKE_HOTELS.forEach((hotel) => {
  const marker = L.circleMarker([hotel.lat, hotel.lng], {
    radius: 12,
    color: hotel.brandColor,
    fillColor: hotel.brandColor,
    fillOpacity: 0.85,
    weight: 1,
  }).addTo(map);

  marker.bindTooltip(hotel.name, { direction: "top" });

  marker.on("click", () => {
    if (activeMarker) {
      activeMarker.setStyle({ weight: 1 });
    }
    marker.setStyle({ weight: 3 });
    activeMarker = marker;
    renderPropertyPanel(hotel);
  });
});

const legend = L.control({ position: "bottomleft" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  const brands = [...new Map(FAKE_HOTELS.map((h) => [h.brandLabel, h.brandColor])).entries()];
  div.innerHTML = `
    <div class="legend-title">Collections</div>
    ${brands
      .map(
        ([label, color]) =>
          `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${label}</div>`
      )
      .join("")}
  `;
  return div;
};
legend.addTo(map);
