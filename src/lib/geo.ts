// Browser geolocation + reverse geocoding helpers (no API key — uses BigDataCloud public endpoint)
export interface GeoLocation {
  country: string;
  city: string;
  lat: number;
  lng: number;
}

export async function requestGeolocation(): Promise<GeoLocation> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    throw new Error("Geolocation is not supported on this device");
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30_000,
    });
  });

  const { latitude: lat, longitude: lng } = pos.coords;
  // Free, no-auth reverse geocoder
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
  );
  if (!res.ok) throw new Error("Could not look up your address");
  const data = (await res.json()) as {
    countryName?: string;
    city?: string;
    locality?: string;
    principalSubdivision?: string;
  };

  const city = data.city || data.locality || data.principalSubdivision || "";
  const country = data.countryName || "";
  if (!country) throw new Error("Could not determine your country");
  return { country, city, lat, lng };
}

export function describeGeoError(e: unknown): string {
  if (typeof window !== "undefined" && e instanceof GeolocationPositionError) {
    if (e.code === 1) return "Location permission was denied. Please allow it in your browser to continue.";
    if (e.code === 2) return "Location unavailable. Check your connection or GPS and retry.";
    if (e.code === 3) return "Location request timed out. Please try again.";
  }
  return e instanceof Error ? e.message : "Could not detect your location";
}
