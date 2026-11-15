"""Pure-Python GIS operations (no shapely/geopandas needed).
Supported: GeoJSON parsing, measures (planar area/length, geodesic length in lon/lat),
point buffer (circle), point-in-polygon overlay counts, convex-polygon intersection.
Not supported yet: general polygon buffer, non-convex clipping (needs shapely/GEOS)."""
import math

MAX_FEATURES = 2000
EARTH_R = 6371008.8


def parse_geojson(obj):
    """Return list of (geom_type, coords, props). Accepts FeatureCollection, Feature or bare geometry."""
    if not isinstance(obj, dict):
        raise ValueError("GeoJSON غير صالح")
    t = obj.get("type")
    if t == "FeatureCollection":
        feats = obj.get("features", [])
    elif t == "Feature":
        feats = [obj]
    else:
        feats = [{"type": "Feature", "geometry": obj, "properties": {}}]
    if len(feats) > MAX_FEATURES:
        raise ValueError(f"الحد الأقصى {MAX_FEATURES} عنصراً")
    out = []
    for f in feats:
        g = f.get("geometry") or {}
        gt, c = g.get("type"), g.get("coordinates")
        if gt not in ("Point", "LineString", "Polygon"):
            continue  # Multi* types are skipped, reported by caller via count
        if gt == "Point":
            c = (float(c[0]), float(c[1]))
        elif gt == "LineString":
            c = [(float(p[0]), float(p[1])) for p in c]
        else:
            c = [(float(p[0]), float(p[1])) for p in c[0]]  # outer ring only
        out.append((gt, c, f.get("properties") or {}))
    return out


def ring_area(ring):
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def is_ccw(ring):
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s > 0


def line_length(coords):
    return sum(math.hypot(coords[i+1][0]-coords[i][0], coords[i+1][1]-coords[i][1]) for i in range(len(coords)-1))


def haversine_length(coords):
    """Length in metres for lon/lat coordinates (spherical approximation)."""
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = p2 - p1, math.radians(lon2 - lon1)
        a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
        total += 2 * EARTH_R * math.asin(math.sqrt(a))
    return total


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-300) + xi:
            inside = not inside
        j = i
    return inside


def buffer_point(x, y, r, segments=64):
    if r <= 0:
        raise ValueError("نصف القطر يجب أن يكون أكبر من صفر")
    return [(x + r*math.cos(2*math.pi*k/segments), y + r*math.sin(2*math.pi*k/segments)) for k in range(segments)]


def is_convex(ring):
    n = len(ring)
    sign = 0
    for i in range(n):
        ax, ay = ring[i]; bx, by = ring[(i+1) % n]; cx, cy = ring[(i+2) % n]
        cross = (bx-ax)*(cy-by) - (by-ay)*(cx-bx)
        if abs(cross) < 1e-12:
            continue
        s = 1 if cross > 0 else -1
        if sign == 0:
            sign = s
        elif s != sign:
            return False
    return True


def convex_intersection(subject, clip):
    """Sutherland–Hodgman. `clip` must be convex. Returns list of points (may be empty)."""
    if not is_convex(clip):
        raise ValueError("الانتقاط يدعم المضلعات المحدبة فقط في هذه النسخة")
    clip = clip if is_ccw(clip) else list(reversed(clip))
    out = list(subject)
    for i in range(len(clip)):
        ax, ay = clip[i]; bx, by = clip[(i+1) % len(clip)]
        inp, out = out, []
        if not inp:
            break
        def side(p):
            return (bx-ax)*(p[1]-ay) - (by-ay)*(p[0]-ax)
        for j in range(len(inp)):
            cur, prev = inp[j], inp[j-1]
            sc, sp = side(cur), side(prev)
            if sc >= 0:
                if sp < 0:
                    out.append(_isect(prev, cur, (ax, ay), (bx, by)))
                out.append(cur)
            elif sp >= 0:
                out.append(_isect(prev, cur, (ax, ay), (bx, by)))
    return out


def _isect(p1, p2, p3, p4):
    x1, y1 = p1; x2, y2 = p2; x3, y3 = p3; x4, y4 = p4
    den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
    if abs(den) < 1e-15:
        return p2
    t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / den
    return (x1 + t*(x2-x1), y1 + t*(y2-y1))


def count_points_in_polygons(points, polygons):
    """Overlay: for each polygon (name, ring) count how many points fall inside."""
    return {name: sum(1 for p in points if point_in_ring(p, ring)) for name, ring in polygons}
