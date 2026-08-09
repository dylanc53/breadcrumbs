import { Capacitor } from '@capacitor/core'

// One tracking interface, two engines: the Transistorsoft plugin when
// running as the installed iOS/Android app (keeps recording with the
// screen off and the app backgrounded), the browser's watchPosition on
// the web (screen-on only).

export const isNativeApp = Capacitor.isNativePlatform()

let bg = null
let bgSubscription = null
let webWatchId = null

export async function startTracking(onPoint) {
  if (isNativeApp) {
    const mod = await import('@transistorsoft/capacitor-background-geolocation')
    bg = mod.default
    bgSubscription = await bg.onLocation((location) => {
      onPoint({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        t: location.timestamp ?? new Date().toISOString(),
      })
    })
    await bg.ready({
      desiredAccuracy: bg.DESIRED_ACCURACY_HIGH,
      distanceFilter: 10, // meters between recorded points
      stopOnTerminate: false, // keep tracking if iOS kills the app mid-session
      startOnBoot: false,
      showsBackgroundLocationIndicator: true,
    })
    await bg.start()
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
    bg = null
  }
  if (webWatchId !== null) {
    navigator.geolocation.clearWatch(webWatchId)
    webWatchId = null
  }
}
