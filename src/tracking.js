import { Capacitor } from '@capacitor/core'

// One tracking interface, two engines: the Transistorsoft plugin when
// running as the installed iOS/Android app (keeps recording with the
// screen off and the app backgrounded), the browser's watchPosition on
// the web (screen-on only).
//
// Important: while iOS suspends the app the JavaScript layer is frozen,
// so onLocation callbacks stop firing even though the plugin keeps
// recording natively. The recorded points live in the plugin's own
// database — getRecordedPoints() is the source of truth for a route.

export const isNativeApp = Capacitor.isNativePlatform()

let bg = null
let bgSubscription = null
let webWatchId = null

async function plugin() {
  if (!bg) {
    const mod = await import('@transistorsoft/capacitor-background-geolocation')
    bg = mod.default
  }
  return bg
}

function toPoint(location) {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    t: location.timestamp ?? new Date().toISOString(),
  }
}

export async function startTracking(onPoint) {
  if (isNativeApp) {
    const bgl = await plugin()
    bgSubscription = await bgl.onLocation((location) => onPoint(toPoint(location)))
    await bgl.ready({
      desiredAccuracy: bgl.DESIRED_ACCURACY_HIGH,
      distanceFilter: 10, // meters between recorded points
      locationAuthorizationRequest: 'Always',
      pausesLocationUpdatesAutomatically: false, // iOS stops updates otherwise
      stopTimeout: 15, // minutes standing still before GPS naps
      stopOnTerminate: false, // keep recording if iOS kills the app mid-session
      startOnBoot: false,
      showsBackgroundLocationIndicator: true,
      maxDaysToPersist: 3,
    })
    await bgl.start()
  } else {
    webWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        onPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: new Date().toISOString(),
        })
      },
      null,
      { enableHighAccuracy: true }
    )
  }
}

export async function stopTracking() {
  if (bg) {
    await bg.stop()
    bgSubscription?.remove()
    bgSubscription = null
  }
  if (webWatchId !== null) {
    navigator.geolocation.clearWatch(webWatchId)
    webWatchId = null
  }
}

// Everything the plugin recorded since `sinceIso`, including while the
// app was suspended. Native only; the web engine has no such buffer.
export async function getRecordedPoints(sinceIso) {
  if (!isNativeApp) return []
  const bgl = await plugin()
  const records = await bgl.getLocations()
  const since = new Date(sinceIso).getTime()
  return records
    .map(toPoint)
    .filter((p) => new Date(p.t).getTime() >= since)
    .sort((a, b) => new Date(a.t) - new Date(b.t))
}

export async function clearRecordedPoints() {
  if (!isNativeApp) return
  const bgl = await plugin()
  await bgl.destroyLocations()
}
