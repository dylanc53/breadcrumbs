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

const VISITS_KEY = 'breadcrumbs-visits'
const ROUTES_KEY = 'breadcrumbs-routes'
const ACTIVE_ROUTE_KEY = 'breadcrumbs-active-route'

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// crypto.randomUUID is unavailable on non-HTTPS pages (e.g. phone testing over LAN)
function makeId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
}

function haversineMeters(a, b) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function routeMiles(path) {
  let meters = 0
  for (let i = 1; i < path.length; i++) {
    meters += haversineMeters(path[i - 1], path[i])
  }
  return meters / 1609.34
}

// Local calendar day as YYYY-MM-DD
function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA')
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA')
}

function formatDay(key) {
  const label = new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return key === todayKey() ? `Today · ${label}` : label
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
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
  const routesGeojsonRef = useRef({ type: 'FeatureCollection', features: [] })
  const openPanelRef = useRef(null)

  const [visits, setVisits] = useState(() => loadJson(VISITS_KEY, []))
  const [draft, setDraft] = useState(null) // { lat, lng } while the form is open
  const [draftGeo, setDraftGeo] = useState(null) // null = looking up, { address: null } = not found
  const [status, setStatus] = useState('warm')
  const [note, setNote] = useState('')
  const [mapStyle, setMapStyle] = useState('satellite')

  const [routes, setRoutes] = useState(() => loadJson(ROUTES_KEY, []))
  const [activeRoute, setActiveRoute] = useState(() =>
    loadJson(ACTIVE_ROUTE_KEY, null)
  )
  const [dayFilter, setDayFilter] = useState('today') // 'today' | 'all' | 'YYYY-MM-DD'
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const openPanel = draft
    ? 'visit'
    : selectedRouteId
      ? 'route'
      : historyOpen
        ? 'history'
        : null
  openPanelRef.current = openPanel

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

    // Route breadcrumb lines; style.load fires on init and after every setStyle,
    // which wipes sources, so layers are re-added there
    const ensureRouteLayers = () => {
      if (map.getSource('routes')) return
      map.addSource('routes', {
        type: 'geojson',
        data: routesGeojsonRef.current,
      })
      map.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['get', 'active'],
            '#10b981',
            ['get', 'selected'],
            '#f472b6',
            '#a855f7',
          ],
          'line-width': ['case', ['get', 'selected'], 7, 4],
          'line-opacity': 0.9,
        },
      })
    }
    map.on('style.load', ensureRouteLayers)

    map.on('click', (e) => {
      const lineHits = map.getLayer('route-lines')
        ? map.queryRenderedFeatures(e.point, { layers: ['route-lines'] })
        : []
      if (lineHits.length) {
        setDraft(null)
        setHistoryOpen(false)
        setSelectedRouteId(lineHits[0].properties.routeId)
        return
      }
      // Tapping the map with a panel open just closes it — no accidental pins
      if (openPanelRef.current === 'route' || openPanelRef.current === 'history') {
        setSelectedRouteId(null)
        setHistoryOpen(false)
        return
      }
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

  // Push visible route lines to the map
  useEffect(() => {
    const visible = routes.filter((r) => {
      if (dayFilter === 'all') return true
      const target = dayFilter === 'today' ? todayKey() : dayFilter
      return dayKey(r.startedAt) === target
    })
    const features = visible.map((r) => routeFeature(r, false, r.id === selectedRouteId))
    if (activeRoute?.path.length >= 2) {
      features.push(routeFeature(activeRoute, true, false))
    }
    const fc = { type: 'FeatureCollection', features }
    routesGeojsonRef.current = fc
    mapRef.current?.getSource('routes')?.setData(fc)
  }, [routes, activeRoute, dayFilter, selectedRouteId])

  // While selling: record GPS breadcrumbs and survive page refreshes
  useEffect(() => {
    if (!activeRoute) return
    saveJson(ACTIVE_ROUTE_KEY, activeRoute)
  }, [activeRoute])

  useEffect(() => {
    if (!activeRoute?.id) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: new Date().toISOString(),
        }
        setActiveRoute((prev) => {
          if (!prev) return prev
          const last = prev.path[prev.path.length - 1]
          if (last && haversineMeters(last, pt) < 8) return prev
          return { ...prev, path: [...prev.path, pt] }
        })
      },
      null,
      { enableHighAccuracy: true }
    )
    return () => navigator.geolocation.clearWatch(watchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.id])

  // Keep the screen awake during a selling session so tracking doesn't stop
  useEffect(() => {
    if (!activeRoute?.id) return
    let lock = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        /* not supported or denied — tracking still works while screen is on */
      }
    }
    acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.id])

  function startSelling() {
    setDayFilter('today')
    setActiveRoute({
      id: makeId(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      path: [],
    })
  }

  function stopSelling() {
    const finished = { ...activeRoute, endedAt: new Date().toISOString() }
    setActiveRoute(null)
    localStorage.removeItem(ACTIVE_ROUTE_KEY)
    if (finished.path.length >= 2) {
      const next = [...routes, finished]
      setRoutes(next)
      saveJson(ROUTES_KEY, next)
    } else {
      alert("Route was too short to save — looks like you didn't move yet.")
    }
  }

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
      routeId: activeRoute?.id ?? null,
      createdAt: new Date().toISOString(),
    }
    const next = [...visits, visit]
    setVisits(next)
    saveJson(VISITS_KEY, next)
    closeForm()
  }

  function closeForm() {
    setDraft(null)
    setNote('')
    setStatus('warm')
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

  function toggleMapStyle() {
    const next = mapStyle === 'satellite' ? 'streets' : 'satellite'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  function focusRoutes(list) {
    const points = list.flatMap((r) => r.path)
    if (!points.length) return
    const bounds = new mapboxgl.LngLatBounds()
    points.forEach((p) => bounds.extend([p.lng, p.lat]))
    mapRef.current?.fitBounds(bounds, { padding: 60, maxZoom: 17 })
  }

  function openHistory() {
    setDraft(null)
    setSelectedRouteId(null)
    setHistoryOpen((open) => !open)
  }

  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ??
    (activeRoute?.id === selectedRouteId ? activeRoute : null)
  const selectedRouteVisits = selectedRoute
    ? visits.filter((v) => dayKey(v.createdAt) === dayKey(selectedRoute.startedAt))
    : []

  // Calendar summary: one row per day that has at least one route
  const dayEntries = Object.entries(
    routes.reduce((acc, r) => {
      const key = dayKey(r.startedAt)
      acc[key] = acc[key] ?? { routes: 0, visits: 0 }
      acc[key].routes += 1
      return acc
    }, {})
  )
    .map(([key, info]) => ({
      key,
      routes: info.routes,
      visits: visits.filter((v) => dayKey(v.createdAt) === key).length,
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))

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

      <div className="top-left">
        <button className="map-chip" onClick={toggleMapStyle}>
          {mapStyle === 'satellite' ? '🗺️ Map' : '🛰️ Satellite'}
        </button>
        <button className="map-chip" onClick={openHistory}>
          📅 History
        </button>
        {dayFilter !== 'today' && (
          <button className="map-chip filter" onClick={() => setDayFilter('today')}>
            {dayFilter === 'all' ? 'All time ✕' : `${formatDay(dayFilter)} ✕`}
          </button>
        )}
      </div>

      {!openPanel && (
        <div className="bottom-bar">
          {activeRoute ? (
            <button className="fab stop" onClick={stopSelling}>
              ⏹ Stop · {routeMiles(activeRoute.path).toFixed(1)} mi
            </button>
          ) : (
            <button className="fab start" onClick={startSelling}>
              ▶ Start selling
            </button>
          )}
          <button className="fab" onClick={dropAtMyLocation}>
            📍 Pin
          </button>
        </div>
      )}

      {openPanel === 'visit' && (
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

      {openPanel === 'route' && selectedRoute && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-title">{formatDay(dayKey(selectedRoute.startedAt))}</p>
          <p className="sheet-sub">
            {formatTime(selectedRoute.startedAt)}–
            {selectedRoute.endedAt ? formatTime(selectedRoute.endedAt) : 'now'}
            {' · '}
            {routeMiles(selectedRoute.path).toFixed(1)} mi
            {' · '}
            {selectedRouteVisits.length} visit
            {selectedRouteVisits.length === 1 ? '' : 's'}
          </p>
          <div className="scroll-list">
            {selectedRouteVisits.map((v) => (
              <div className="visit-row" key={v.id}>
                <span
                  className="status-dot"
                  style={{ background: STATUS_COLORS[v.status] }}
                />
                <div className="visit-body">
                  <p className="visit-addr">
                    {v.address ?? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`}
                  </p>
                  {v.note && <p className="visit-note">{v.note}</p>}
                  <small className="visit-time">{formatTime(v.createdAt)}</small>
                </div>
              </div>
            ))}
            {!selectedRouteVisits.length && (
              <p className="empty">No visits logged this day.</p>
            )}
          </div>
          <button className="btn cancel" onClick={() => setSelectedRouteId(null)}>
            Close
          </button>
        </div>
      )}

      {openPanel === 'history' && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-title">Route history</p>
          <div className="seg-row">
            <button
              className={`seg ${dayFilter === 'today' ? 'active' : ''}`}
              onClick={() => setDayFilter('today')}
            >
              Today
            </button>
            <button
              className={`seg ${dayFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setDayFilter('all')
                focusRoutes(routes)
              }}
            >
              All time
            </button>
          </div>
          <div className="scroll-list">
            {dayEntries.map((d) => (
              <button
                className="day-row"
                key={d.key}
                onClick={() => {
                  setDayFilter(d.key)
                  setHistoryOpen(false)
                  focusRoutes(routes.filter((r) => dayKey(r.startedAt) === d.key))
                }}
              >
                <span className="day-label">{formatDay(d.key)}</span>
                <span className="day-meta">
                  {d.routes} route{d.routes === 1 ? '' : 's'} · {d.visits} visit
                  {d.visits === 1 ? '' : 's'}
                </span>
              </button>
            ))}
            {!dayEntries.length && (
              <p className="empty">No routes yet — hit ▶ Start selling and walk.</p>
            )}
          </div>
          <button className="btn cancel" onClick={() => setHistoryOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}

function routeFeature(route, active, selected) {
  return {
    type: 'Feature',
    properties: { routeId: route.id, active, selected },
    geometry: {
      type: 'LineString',
      coordinates: route.path.map((p) => [p.lng, p.lat]),
    },
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
