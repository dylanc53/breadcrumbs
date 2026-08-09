import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from './supabase'
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
const IMPORT_FLAG = 'breadcrumbs-import-done'

function visitFromDb(r) {
  return {
    id: r.id,
    repId: r.rep_id,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    neighborhood: r.neighborhood,
    city: r.city,
    zip: r.zip,
    status: r.status,
    note: r.note ?? '',
    routeId: r.route_id,
    createdAt: r.created_at,
  }
}

function routeFromDb(r) {
  return {
    id: r.id,
    repId: r.rep_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    path: r.path ?? [],
  }
}

// Distinct line colors per rep in team views
const REP_COLORS = [
  '#a855f7',
  '#0ea5e9',
  '#f97316',
  '#14b8a6',
  '#e11d48',
  '#84cc16',
  '#6366f1',
  '#d946ef',
]

function initialsOf(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

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

export default function App({ profile, org, onSignOut }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const draftMarkerRef = useRef(null)
  const routesGeojsonRef = useRef({ type: 'FeatureCollection', features: [] })
  const openPanelRef = useRef(null)

  const [visits, setVisits] = useState([])
  const [draft, setDraft] = useState(null) // { lat, lng } while the form is open
  const [draftGeo, setDraftGeo] = useState(null) // null = looking up, { address: null } = not found
  const [status, setStatus] = useState('warm')
  const [note, setNote] = useState('')
  const [mapStyle, setMapStyle] = useState('satellite')

  const [routes, setRoutes] = useState([])
  const [activeRoute, setActiveRoute] = useState(() =>
    loadJson(ACTIVE_ROUTE_KEY, null)
  )
  const [dayFilter, setDayFilter] = useState('today') // 'today' | 'all' | 'YYYY-MM-DD'
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editingVisitId, setEditingVisitId] = useState(null)
  const [editStatus, setEditStatus] = useState('warm')
  const [editNote, setEditNote] = useState('')
  const [teammates, setTeammates] = useState([])
  const [viewRep, setViewRep] = useState('me') // 'me' | 'team' | a rep's id
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewOpen, setViewOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const openPanel = draft
    ? 'visit'
    : editingVisitId
      ? 'edit'
      : selectedRouteId
        ? 'route'
        : historyOpen
          ? 'history'
          : viewOpen
            ? 'view'
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

  // Load this rep's data from the shared DB; first login on a device that has
  // pre-account pins/routes in localStorage offers a one-time import
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Whole team's data; security rules scope these to the org
      const [{ data: vRows }, { data: rRows }, { data: pRows }] =
        await Promise.all([
          supabase.from('visits').select('*').order('created_at'),
          supabase
            .from('routes')
            .select('*')
            .not('ended_at', 'is', null)
            .order('started_at'),
          supabase.from('profiles').select('*').order('created_at'),
        ])
      if (cancelled) return
      setTeammates(pRows ?? [])
      const dbVisits = (vRows ?? []).map(visitFromDb)
      const dbRoutes = (rRows ?? []).map(routeFromDb)

      const localVisits = loadJson(VISITS_KEY, [])
      const localRoutes = loadJson(ROUTES_KEY, [])
      if (
        !localStorage.getItem(IMPORT_FLAG) &&
        (localVisits.length || localRoutes.length)
      ) {
        localStorage.setItem(IMPORT_FLAG, '1')
        if (
          confirm(
            `Found ${localVisits.length} pins and ${localRoutes.length} routes saved on this device from before your account. Import them now?`
          )
        ) {
          const routeIdMap = {}
          for (const r of localRoutes.filter((x) => x.path?.length >= 2)) {
            const { data } = await supabase
              .from('routes')
              .insert({
                org_id: profile.org_id,
                rep_id: profile.id,
                started_at: r.startedAt,
                ended_at: r.endedAt ?? r.startedAt,
                path: r.path,
              })
              .select()
              .single()
            if (data) {
              routeIdMap[r.id] = data.id
              dbRoutes.push(routeFromDb(data))
            }
          }
          for (const v of localVisits) {
            const { data } = await supabase
              .from('visits')
              .insert({
                org_id: profile.org_id,
                rep_id: profile.id,
                route_id: routeIdMap[v.routeId] ?? null,
                lat: v.lat,
                lng: v.lng,
                address: v.address ?? null,
                neighborhood: v.neighborhood ?? null,
                city: v.city ?? null,
                zip: v.zip ?? null,
                status: v.status,
                note: v.note ?? '',
                created_at: v.createdAt,
              })
              .select()
              .single()
            if (data) dbVisits.push(visitFromDb(data))
          }
          localStorage.removeItem(VISITS_KEY)
          localStorage.removeItem(ROUTES_KEY)
        }
      }

      if (!cancelled) {
        setVisits(dbVisits)
        setRoutes(dbRoutes)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [profile.id, profile.org_id])

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
          'line-color': ['get', 'color'],
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
        setEditingVisitId(null)
        setSelectedRouteId(lineHits[0].properties.routeId)
        return
      }
      // Tapping the map with a panel open just closes it — no accidental pins
      if (['route', 'history', 'edit', 'view'].includes(openPanelRef.current)) {
        setSelectedRouteId(null)
        setHistoryOpen(false)
        setEditingVisitId(null)
        setViewOpen(false)
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

  const repMatches = (repId) =>
    viewRep === 'team'
      ? true
      : viewRep === 'me'
        ? repId === profile.id
        : repId === viewRep
  const repName = (repId) =>
    teammates.find((t) => t.id === repId)?.name ?? 'Teammate'
  const repColor = (repId) =>
    REP_COLORS[
      Math.max(0, teammates.findIndex((t) => t.id === repId)) %
        REP_COLORS.length
    ]

  const visibleVisits = visits.filter(
    (v) =>
      repMatches(v.repId) &&
      (statusFilter === 'all' || v.status === statusFilter)
  )

  // Saved pins — status-colored circles with the rep's initials;
  // tapping one opens the edit sheet
  useEffect(() => {
    if (!mapRef.current) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = visibleVisits.map((v) => {
      const el = document.createElement('div')
      el.className = 'pin-marker'
      el.style.background = STATUS_COLORS[v.status]
      el.textContent = initialsOf(repName(v.repId))
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setDraft(null)
        setSelectedRouteId(null)
        setHistoryOpen(false)
        setViewOpen(false)
        setEditingVisitId(v.id)
        setEditStatus(v.status)
        setEditNote(v.note ?? '')
      })
      return new mapboxgl.Marker({ element: el })
        .setLngLat([v.lng, v.lat])
        .addTo(mapRef.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, viewRep, statusFilter, teammates])

  // Push visible route lines to the map, colored per rep
  useEffect(() => {
    const visible = routes.filter((r) => {
      if (!repMatches(r.repId)) return false
      if (dayFilter === 'all') return true
      const target = dayFilter === 'today' ? todayKey() : dayFilter
      return dayKey(r.startedAt) === target
    })
    const features = visible.map((r) =>
      routeFeature(
        r,
        r.id === selectedRouteId ? '#f472b6' : repColor(r.repId),
        r.id === selectedRouteId
      )
    )
    if (activeRoute?.path.length >= 2) {
      features.push(routeFeature(activeRoute, '#10b981', false))
    }
    const fc = { type: 'FeatureCollection', features }
    routesGeojsonRef.current = fc
    mapRef.current?.getSource('routes')?.setData(fc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, activeRoute, dayFilter, selectedRouteId, viewRep, teammates])

  // While selling: record GPS breadcrumbs and survive page refreshes
  useEffect(() => {
    if (!activeRoute) return
    saveJson(ACTIVE_ROUTE_KEY, activeRoute)
  }, [activeRoute])

  // Back up the in-progress path to the DB every 5 points so a dead
  // battery mid-session doesn't lose the whole route
  useEffect(() => {
    const len = activeRoute?.path.length ?? 0
    if (!activeRoute?.id || len < 2 || len % 5 !== 0) return
    supabase
      .from('routes')
      .update({ path: activeRoute.path })
      .eq('id', activeRoute.id)
      .then(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.path.length])

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

  async function startSelling() {
    const startedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('routes')
      .insert({
        org_id: profile.org_id,
        rep_id: profile.id,
        started_at: startedAt,
        path: [],
      })
      .select()
      .single()
    if (error) {
      alert(`Could not start route: ${error.message}`)
      return
    }
    setDayFilter('today')
    setViewRep('me')
    setActiveRoute({
      id: data.id,
      repId: profile.id,
      startedAt,
      endedAt: null,
      path: [],
    })
  }

  async function stopSelling() {
    const finished = { ...activeRoute, endedAt: new Date().toISOString() }
    setActiveRoute(null)
    localStorage.removeItem(ACTIVE_ROUTE_KEY)
    if (finished.path.length >= 2) {
      const { error } = await supabase
        .from('routes')
        .update({ ended_at: finished.endedAt, path: finished.path })
        .eq('id', finished.id)
      if (error) {
        alert(`Could not save route: ${error.message}`)
        return
      }
      setRoutes([...routes, finished])
    } else {
      await supabase.from('routes').delete().eq('id', finished.id)
      alert("Route was too short to save — looks like you didn't move yet.")
    }
  }

  async function handleSave() {
    const { data, error } = await supabase
      .from('visits')
      .insert({
        org_id: profile.org_id,
        rep_id: profile.id,
        route_id: activeRoute?.id ?? null,
        lat: draft.lat,
        lng: draft.lng,
        address: draftGeo?.address ?? null,
        neighborhood: draftGeo?.neighborhood ?? null,
        city: draftGeo?.city ?? null,
        zip: draftGeo?.zip ?? null,
        status,
        note: note.trim(),
      })
      .select()
      .single()
    if (error) {
      alert(`Could not save visit: ${error.message}`)
      return
    }
    setVisits([...visits, visitFromDb(data)])
    closeForm()
  }

  function closeForm() {
    setDraft(null)
    setNote('')
    setStatus('warm')
  }

  async function saveEdit() {
    const { error } = await supabase
      .from('visits')
      .update({ status: editStatus, note: editNote.trim() })
      .eq('id', editingVisitId)
    if (error) {
      alert(`Could not save changes: ${error.message}`)
      return
    }
    setVisits(
      visits.map((v) =>
        v.id === editingVisitId
          ? { ...v, status: editStatus, note: editNote.trim() }
          : v
      )
    )
    setEditingVisitId(null)
  }

  async function deleteVisit() {
    if (!confirm('Delete this pin and its note?')) return
    const { error } = await supabase
      .from('visits')
      .delete()
      .eq('id', editingVisitId)
    if (error) {
      alert(`Could not delete: ${error.message}`)
      return
    }
    setVisits(visits.filter((v) => v.id !== editingVisitId))
    setEditingVisitId(null)
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

  function showAccount() {
    const teamInfo = org
      ? `\nTeam: ${org.name}\nJoin code (give this to new reps): ${org.join_code}`
      : ''
    if (confirm(`Signed in as ${profile.name}${teamInfo}\n\nSign out?`)) {
      onSignOut()
    }
  }

  function openHistory() {
    setDraft(null)
    setSelectedRouteId(null)
    setViewOpen(false)
    setHistoryOpen((open) => !open)
  }

  function openViewPicker() {
    setDraft(null)
    setSelectedRouteId(null)
    setHistoryOpen(false)
    setViewOpen((open) => !open)
  }

  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ??
    (activeRoute?.id === selectedRouteId ? activeRoute : null)
  const selectedRouteVisits = selectedRoute
    ? visits.filter(
        (v) =>
          v.repId === selectedRoute.repId &&
          dayKey(v.createdAt) === dayKey(selectedRoute.startedAt)
      )
    : []

  const editingVisit = visits.find((v) => v.id === editingVisitId)
  const editingIsMine = editingVisit?.repId === profile.id
  const canEditVisit = editingIsMine || profile.role === 'manager'
  const viewLabel =
    viewRep === 'me'
      ? 'My pins'
      : viewRep === 'team'
        ? 'Team'
        : repName(viewRep).split(' ')[0]

  // Calendar: route-line count per day, plus the grid for the shown month
  const routeCounts = routes.reduce((acc, r) => {
    const key = dayKey(r.startedAt)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const firstWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
  const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
  const calCells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const monthLabel = new Date(calMonth.y, calMonth.m).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric' }
  )

  function shiftMonth(delta) {
    setCalMonth(({ y, m }) => {
      const d = new Date(y, m + delta)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
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

      <div className="top-left">
        <button className="map-chip" onClick={toggleMapStyle}>
          {mapStyle === 'satellite' ? '🗺️ Map' : '🛰️ Satellite'}
        </button>
        <button className="map-chip" onClick={openHistory}>
          📅 History
        </button>
        <button className="map-chip" onClick={openViewPicker}>
          👥 {viewLabel}
          {statusFilter !== 'all' ? ` · ${statusFilter}` : ''}
        </button>
        <button className="map-chip" onClick={showAccount}>
          👤 {profile.name.split(' ')[0]}
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

      {openPanel === 'edit' && editingVisit && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-address">
            {editingVisit.address ??
              `${editingVisit.lat.toFixed(5)}, ${editingVisit.lng.toFixed(5)}`}
          </p>
          <p className="sheet-sub">
            {editingIsMine ? 'Your pin' : `Pinned by ${repName(editingVisit.repId)}`}
            {' · '}
            {formatDay(dayKey(editingVisit.createdAt))} ·{' '}
            {formatTime(editingVisit.createdAt)}
          </p>
          {canEditVisit ? (
            <>
              <div className="status-row">
                {Object.keys(STATUS_COLORS).map((s) => (
                  <button
                    key={s}
                    className={`status-btn ${s} ${editStatus === s ? 'active' : ''}`}
                    onClick={() => setEditStatus(s)}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <textarea
                className="note-input"
                placeholder="Note (who you talked to, follow-up, etc.)"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={3}
              />
              <div className="action-row">
                <button
                  className="btn cancel"
                  onClick={() => setEditingVisitId(null)}
                >
                  Cancel
                </button>
                <button className="btn save" onClick={saveEdit}>
                  Save changes
                </button>
              </div>
              <button className="delete-link" onClick={deleteVisit}>
                Delete this pin
              </button>
            </>
          ) : (
            <>
              <p className="readonly-status" style={{ color: STATUS_COLORS[editingVisit.status] }}>
                {editingVisit.status.toUpperCase()}
              </p>
              <p className="readonly-note">
                {editingVisit.note || 'No note.'}
              </p>
              <button className="btn cancel" onClick={() => setEditingVisitId(null)}>
                Close
              </button>
            </>
          )}
        </div>
      )}

      {openPanel === 'view' && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-title">Map view</p>
          <div className="scroll-list">
            <button
              className={`day-row ${viewRep === 'me' ? 'row-active' : ''}`}
              onClick={() => setViewRep('me')}
            >
              <span className="day-label">My pins & routes</span>
            </button>
            <button
              className={`day-row ${viewRep === 'team' ? 'row-active' : ''}`}
              onClick={() => setViewRep('team')}
            >
              <span className="day-label">Whole team</span>
              <span className="day-meta">{teammates.length} reps</span>
            </button>
            {teammates
              .filter((t) => t.id !== profile.id)
              .map((t) => (
                <button
                  key={t.id}
                  className={`day-row ${viewRep === t.id ? 'row-active' : ''}`}
                  onClick={() => setViewRep(t.id)}
                >
                  <span className="day-label">
                    <span
                      className="rep-swatch"
                      style={{ background: repColor(t.id) }}
                    />
                    {t.name}
                  </span>
                  <span className="day-meta">
                    {visits.filter((v) => v.repId === t.id).length} pins
                  </span>
                </button>
              ))}
          </div>
          <div className="seg-row">
            {['all', 'cold', 'warm', 'hot'].map((s) => (
              <button
                key={s}
                className={`seg ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn cancel" onClick={() => setViewOpen(false)}>
            Close
          </button>
        </div>
      )}

      {openPanel === 'route' && selectedRoute && (
        <div className="sheet">
          <div className="sheet-handle" />
          <p className="sheet-title">{formatDay(dayKey(selectedRoute.startedAt))}</p>
          <p className="sheet-sub">
            {repName(selectedRoute.repId)}
            {' · '}
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
          <div className="cal-head">
            <button className="cal-nav" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <span className="cal-month">{monthLabel}</span>
            <button className="cal-nav" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <div className="cal-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span className="cal-wd" key={`wd${i}`}>
                {d}
              </span>
            ))}
            {calCells.map((day, i) => {
              if (day === null) return <span key={`pad${i}`} />
              const key = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const count = routeCounts[key]
              return (
                <button
                  key={key}
                  disabled={!count}
                  className={`cal-day ${count ? 'has-routes' : ''} ${
                    dayFilter === key ? 'selected' : ''
                  } ${key === todayKey() ? 'today' : ''}`}
                  onClick={() => {
                    setDayFilter(key)
                    setHistoryOpen(false)
                    focusRoutes(routes.filter((r) => dayKey(r.startedAt) === key))
                  }}
                >
                  <span className="cal-num">{day}</span>
                  {count && <span className="cal-count">{count}</span>}
                </button>
              )
            })}
          </div>
          <p className="hint">Days with a number badge have breadcrumb lines — tap one to see them.</p>
          <button className="btn cancel" onClick={() => setHistoryOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}

function routeFeature(route, color, selected) {
  return {
    type: 'Feature',
    properties: { routeId: route.id, color, selected: !!selected },
    geometry: {
      type: 'LineString',
      coordinates: route.path.map((p) => [p.lng, p.lat]),
    },
  }
}
