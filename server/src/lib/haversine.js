// Great-circle distance in miles.
//
// Used instead of PostGIS ST_Distance for candidate proximity ranking: the
// deploy target's Postgres does not ship the PostGIS extension, and at the
// distances a caregiver actually travels the Haversine formula is accurate to
// within a few feet — well inside what ranking needs. Computed in JS from the
// lat/lng already loaded for each employee, so it costs no extra query.

const EARTH_RADIUS_MILES = 3958.7613;

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

/**
 * @returns {number|null} miles, or null if any coordinate is missing.
 */
function haversineMiles(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(a));
}

module.exports = { haversineMiles };
