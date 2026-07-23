// Mapbox Geocoding v5 adapter.
//
// Free tier is 100k lookups/month — far beyond this app's needs, since addresses
// are geocoded once and cached (see geocodingService for the cost invariant).
//
// A provider adapter implements exactly two things:
//   isConfigured(): boolean
//   geocode(address): Promise<{ lat, lng, status }>
// Swapping to Google means adding a sibling file with the same two functions.

const ENDPOINT = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

function isConfigured() {
    return !!process.env.MAPBOX_ACCESS_TOKEN;
}

async function geocode(address) {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    const url = `${ENDPOINT}/${encodeURIComponent(address)}.json`
        + `?access_token=${token}`
        + `&limit=1`
        + `&country=US`
        + `&types=address`;

    const res = await fetch(url);
    if (!res.ok) {
        return { lat: null, lng: null, status: 'error', detail: `HTTP ${res.status}` };
    }

    const body = await res.json();
    const feature = body?.features?.[0];
    if (!feature || !Array.isArray(feature.center)) {
        return { lat: null, lng: null, status: 'not_found' };
    }

    // Mapbox returns center as [longitude, latitude] — GeoJSON order, which is
    // the reverse of how coordinates are usually written. Transposing these is
    // silent: it yields a plausible-looking point in the wrong hemisphere.
    const [lng, lat] = feature.center;

    return { lat, lng, status: 'ok', relevance: feature.relevance };
}

module.exports = { name: 'mapbox', isConfigured, geocode };
