import * as THREE from "three";

/**
 * Subsolar direction in scene coordinates. Matches the worker's lat/lon → XYZ:
 *   x =  cos(lat) * cos(lon)
 *   y =  sin(lat)
 *   z = -cos(lat) * sin(lon)
 *
 * Latitude approximated by Earth's axial tilt vs. day of year; longitude by
 * GMT hour offset from solar noon (15°/h). Good to ≈1° — sufficient for
 * placing the day/night terminator and shadow side of the Earth.
 */
export function subsolarDir(date: Date, out: THREE.Vector3 = new THREE.Vector3()) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000;
  const declRad = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365.25);
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;
  const lonRad = (-(utcHours - 12) * 15 * Math.PI) / 180;
  const cosLat = Math.cos(declRad);
  return out.set(cosLat * Math.cos(lonRad), Math.sin(declRad), -cosLat * Math.sin(lonRad));
}
