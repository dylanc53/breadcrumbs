import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const STATUS_COLORS = {
  cold: '#2563eb',
  warm: '#f59e0b',
  hot: '#dc2626',
}

const STORAGE_KEY = 'breadcrumbs-visits'

const MAP_STYLES = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
}

// Territory: Memphis metro + DeSoto County MS (Southaven, Olive Branch,
// Hernando) with padding for surrounding areas. [west, south] / [east, north]
const TERRITORY_BOUNDS = [
  [-90.35, 34.65],
  [-89.55, 35.45],
]
const TERRITORY_CENTER = [-89.95, 34.98]

function loadVisits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

function saveVisits(visits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visits))
}

// crypto.randomUUID is unavailable on non-HTTPS pages (e.g. phone testing over LAN)
function makeId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
}

const tokenMissing =
  !mapboxgl.accessToken || !mapboxgl.accessToken.startsWith('pk.')

async function reverseGeocode(lat, lng) {
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse` +
    `?longitude=${lng}&latitude=${lat}&types=address&access_token=${mapboxgl.accessToken}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)
  const feature = (await res.json()).features[0]
  if (!feature) return { address: null, neighborhood: null, city: null, zip: null }
  const ctx = feature.properties.context ?? {}
  return {
    address: feature.properties.full_address ?? feature.properties.name,
    neighborhood: ctx.neighborhood?.name ?? null,
    city: ctx.place?.name ?? null,
    zip: ctx.postcode?.name ?? null,
  }
}

export default function App() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const draftMarkerRef = useRef(null)

  const [visits, setVisits] = useState(loadVisits)
  const [draft, setDraft] = useState(null) // { lat, lng } while the form is open
  const [draftGeo, setDraftGeo] = useState(null) // null = looking up, { address: null } = not found
  const [status, setStatus] = useState('warm')
  const [note, setNote] = useState('')
  const [mapStyle, setMapStyle] = useState('satellite')

  // Resolve the tapped point to a street address; re-runs when the pin is dragged
  useEffect(() => {
    setDraftGeo(null)
    if (!draft) return
    let cancelled = false
    reverseGeocode(draft.lat, draft.lng)
      .then((geo) => cancelled || setDraftGeo(geo))
      .catch(() => cancelled || setDraftGeo({ address: null }))
    return () => {
      cancelled = true
    }
  }, [draft])

  useEffect(() => {
    if (tokenMissing || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.satellite,
      center: TERRITORY_CENTER,
      zoom: 10,
      maxBounds: TERRITORY_BOUNDS,
      minZoom: 9,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }))

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    })
    map.addControl(geolocate)
    map.on('load', () => geolocate.trigger())

    map.on('click', (e) => {
      setDraft({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Draft pin follows the tap while the form is open
  useEffect(() => {
    draftMarkerRef.current?.remove()
    draftMarkerRef.current = null
    if (!draft || !mapRef.current) return

    const marker = new mapboxgl.Marker({
      color: STATUS_COLORS[status],
      draggable: true,
    })
      .setLngLat([draft.lng, draft.lat])
      .addTo(mapRef.current)

    marker.on('dragend', () => {
      const pos = marker.getLngLat()
      setDraft({ lat: pos.lat, lng: pos.lng })
    })
    draftMarkerRef.current = marker
  }, [draft, status])

  // Saved pins
  useEffect(() => {
    if (!mapRef.current) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = visits.map((v) => {
      const when = new Date(v.createdAt).toLocaleString()
      const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(
        `<strong class="popup-status popup-${v.status}">${v.status.toUpperCase()}</strong>
         ${v.address ? `<p class="popup-address">${escapeHtml(v.address)}</p>` : ''}
         <p class="popup-note">${escapeHtml(v.note) || '<em>No note</em>'}</p>
         <small class="popup-date">${when}</small>`
      )
      return new mapboxgl.Marker({ color: STATUS_COLORS[v.status] })
        .setLngLat([v.lng, v.lat])
        .setPopup(popup)
        .addTo(mapRef.current)
    })
  }, [visits])

  function handleSave() {
    const visit = {
      id: makeId(),
      lat: draft.lat,
      lng: draft.lng,
      address: draftGeo?.address ?? null,
      neighborhood: draftGeo?.neighborhood ?? null,
      city: draftGeo?.city ?? null,
      zip: draftGeo?.zip ?? null,
      status,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    }
    const next = [...visits, visit]
    setVisits(next)
    saveVisits(next)
    closeForm()
  }

  function closeForm() {
    setDraft(null)
    setNote('')
    setStatus('warm')
  }

  function toggleMapStyle() {
    const next = mapStyle === 'satellite' ? 'streets' : 'satellite'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  function dropAtMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17 })
        setDraft({ lat, lng })
      },
      () => alert('Could not get your location. Tap the map to drop a pin instead.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (tokenMissing) {
    return (
      <div className="token-notice">
        <h1>Breadcrumbs</h1>
        <p>
          Missing Mapbox token. Open <code>.env</code> in the project root and
          replace the placeholder with your token from{' '}
          <a href="https://account.mapbox.com/">account.mapbox.com</a> (starts
          with <code>pk.</code>), then restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <div className="app">
      <div ref={mapContainer} className="map" />

      <button className="style-toggle" onClick={toggleMapStyle}>
        {mapStyle === 'satellite' ? '🗺️ Map' : '🛰️ Satellite'}
      </button>

      {!draft && (
        <button className="fab" onClick={dropAtMyLocation}>
          📍 Pin my location
        </button>
      )}

      {draft && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-address">
            {draftGeo === null
              ? 'Finding address…'
              : draftGeo.address ?? 'No address found — pin saves by location only'}
          </p>
          <div className="status-row">
            {Object.keys(STATUS_COLORS).map((s) => (
              <button
                key={s}
                className={`status-btn ${s} ${status === s ? 'active' : ''}`}
                onClick={() => setStatus(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <textarea
            className="note-input"
            placeholder="Note (who you talked to, follow-up, etc.)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="action-row">
            <button className="btn cancel" onClick={closeForm}>
              Cancel
            </button>
            <button className="btn save" onClick={handleSave}>
              Save visit
            </button>
          </div>
          <p className="hint">Drag the pin to fine-tune its position.</p>
        </div>
      )}
    </div>
  )
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
