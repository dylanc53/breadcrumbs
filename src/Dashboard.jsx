import mapboxgl from 'mapbox-gl'

const STATUS_COLORS = { cold: '2563eb', warm: 'f59e0b', hot: 'dc2626' }

function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA')
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA')
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

function pathMiles(path) {
  let m = 0
  for (let i = 1; i < path.length; i++) m += haversineMeters(path[i - 1], path[i])
  return m / 1609.34
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

// High-res static Mapbox preview of the ~15 most recent pins (or the
// territory when there are none yet). 1280@2x is the largest Mapbox serves.
function previewUrl(visits) {
  const token = mapboxgl.accessToken
  const style = 'mapbox/satellite-streets-v12'
  const recent = visits.slice(-15)
  if (!recent.length) {
    return `https://api.mapbox.com/styles/v1/${style}/static/-89.95,34.98,8.6,0/1280x640@2x?access_token=${token}`
  }
  if (recent.length === 1) {
    const v = recent[0]
    return `https://api.mapbox.com/styles/v1/${style}/static/pin-l+${STATUS_COLORS[v.status]}(${v.lng.toFixed(5)},${v.lat.toFixed(5)})/${v.lng.toFixed(5)},${v.lat.toFixed(5)},15.5,0/1280x640@2x?access_token=${token}`
  }
  const overlays = recent
    .map(
      (v) =>
        `pin-l+${STATUS_COLORS[v.status] ?? '7c3aed'}(${v.lng.toFixed(5)},${v.lat.toFixed(5)})`
    )
    .join(',')
  return `https://api.mapbox.com/styles/v1/${style}/static/${overlays}/auto/1280x640@2x?padding=100&access_token=${token}`
}

export default function Dashboard({
  profile,
  org,
  teammates,
  visits,
  routes,
  repColor,
  activeRoute,
  onOpenMap,
  onAccount,
}) {
  const today = todayKey()
  const todayVisits = visits.filter((v) => dayKey(v.createdAt) === today)
  const todayRoutes = routes.filter((r) => dayKey(r.startedAt) === today)
  const todayMiles = todayRoutes.reduce((sum, r) => sum + pathMiles(r.path), 0)
  const hotTotal = visits.filter((v) => v.status === 'hot').length

  const kpis = [
    { label: 'Doors today', value: todayVisits.length },
    {
      label: 'Hot today',
      value: todayVisits.filter((v) => v.status === 'hot').length,
    },
    { label: 'Miles today', value: todayMiles.toFixed(1) },
    { label: 'Hot leads all-time', value: hotTotal },
  ]

  function repStats(repId) {
    const mine = visits.filter((v) => v.repId === repId)
    const last = mine[mine.length - 1]
    return {
      pins: mine.length,
      hot: mine.filter((v) => v.status === 'hot').length,
      lastSeen: last ? timeAgo(last.createdAt) : 'no pins yet',
    }
  }

  return (
    <div className="dash">
      <header className="dash-head">
        <span className="dash-brand">🍞 {org?.name ?? 'Breadcrumbs'}</span>
        <button className="map-chip" onClick={onAccount}>
          👤 {profile.name.split(' ')[0]}
        </button>
      </header>

      {activeRoute && (
        <button className="selling-banner" onClick={() => onOpenMap('me')}>
          🟢 Selling session in progress — open map
        </button>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <span className="kpi-value">{k.value}</span>
            <span className="kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      <button className="map-preview" onClick={() => onOpenMap()}>
        <img src={previewUrl(visits)} alt="Team map" loading="lazy" />
        <span className="map-preview-cta">Open map →</span>
      </button>

      <p className="dash-section">Team</p>
      <div className="dash-roster">
        <button className="day-row" onClick={() => onOpenMap('team')}>
          <span className="day-label">👥 Whole team</span>
          <span className="day-meta">
            {visits.length} pins · {routes.length} routes
          </span>
        </button>
        {teammates.map((t) => {
          const s = repStats(t.id)
          const isMe = t.id === profile.id
          return (
            <button
              className="day-row"
              key={t.id}
              onClick={() => onOpenMap(isMe ? 'me' : t.id)}
            >
              <span className="day-label">
                <span className="rep-swatch" style={{ background: repColor(t.id) }} />
                {t.name}
                {isMe ? ' (you)' : ''}
                {t.role === 'manager' ? ' ★' : ''}
              </span>
              <span className="day-meta">
                {s.pins} pins · {s.hot} hot · {s.lastSeen}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
