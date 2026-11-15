"""Builds a survey-plan DXF with ezdxf: boundary, dimensions, labels, frame, north arrow.
NOTE: written against the ezdxf API but not executed in the build environment (ezdxf could not be installed there).
Run `python -c "import dxf_builder"` and the /api/dxf endpoint once in your own environment to confirm."""
import ezdxf
from geo_utils import polygon_area, perimeter


def build_plan_dxf(points, path, title="Survey Plan", units="m", closed=True):
    doc = ezdxf.new("R2013")
    doc.units = ezdxf.units.M if units == "m" else ezdxf.units.FT
    msp = doc.modelspace()
    for name, color in [("BOUNDARY", 1), ("DIMENSIONS", 3), ("LABELS", 2), ("FRAME", 7), ("NORTH", 5)]:
        doc.layers.add(name, color=color)

    msp.add_lwpolyline(points, close=closed, dxfattribs={"layer": "BOUNDARY"})

    n = len(points)
    edges = n if closed else n - 1
    for i in range(edges):
        p1, p2 = points[i], points[(i + 1) % n]
        dim = msp.add_aligned_dim(p1=p1, p2=p2, distance=3.0, dxfattribs={"layer": "DIMENSIONS"})
        dim.render()

    for i, (x, y) in enumerate(points):
        msp.add_text(f"P{i+1}", dxfattribs={"height": 1.0, "layer": "LABELS"}).set_placement((x + 0.5, y + 0.5))

    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    m = max(w, h) * 0.15 or 5.0
    fx1, fy1, fx2, fy2 = minx - m, miny - m, maxx + m, maxy + m
    msp.add_lwpolyline([(fx1, fy1), (fx2, fy1), (fx2, fy2), (fx1, fy2)], close=True, dxfattribs={"layer": "FRAME"})

    # North arrow at top-right corner of the frame
    ax, ay, s = fx2 - m * 0.5, fy2 - m * 0.5, m * 0.25
    msp.add_lwpolyline([(ax, ay - s), (ax - s * 0.4, ay - s * 0.4), (ax + s * 0.4, ay - s * 0.4)], close=True, dxfattribs={"layer": "NORTH"})
    msp.add_line((ax, ay - s), (ax, ay + s), dxfattribs={"layer": "NORTH"})
    msp.add_text("N", dxfattribs={"height": s * 0.6, "layer": "NORTH"}).set_placement((ax - s * 0.2, ay + s * 1.1))

    area = polygon_area(points)
    per = perimeter(points, closed=closed)
    msp.add_text(title, dxfattribs={"height": m * 0.25, "layer": "FRAME"}).set_placement((fx1, fy2 + m * 0.3))
    msp.add_text(f"Area: {area:,.2f} sq {units}   Perimeter: {per:,.2f} {units}",
                 dxfattribs={"height": m * 0.18, "layer": "FRAME"}).set_placement((fx1, fy1 - m * 0.5))
    doc.saveas(path)
    return {"area": area, "perimeter": per, "points": n}
