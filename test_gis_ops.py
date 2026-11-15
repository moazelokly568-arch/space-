import math
from gis_ops import *
sq=[(0,0),(10,0),(10,10),(0,10)]
assert abs(ring_area(sq)-100)<1e-9
assert point_in_ring((5,5),sq) and not point_in_ring((11,5),sq)
assert abs(line_length([(0,0),(3,4)])-5)<1e-9
# 1 degree of longitude at equator ~ 111.2 km
assert abs(haversine_length([(0,0),(1,0)])-111195)<200
b=buffer_point(0,0,1,segments=256)
assert abs(ring_area(b)-math.pi)<0.01
clip=[(5,5),(15,5),(15,15),(5,15)]
inter=convex_intersection(sq,clip)
assert abs(ring_area(inter)-25)<1e-6, ring_area(inter)
assert count_points_in_polygons([(1,1),(20,20),(9,9)],[("A",sq)])=={"A":2}
feats=parse_geojson({"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[1,2]},"properties":{"n":"p"}}]})
assert feats[0][0]=="Point" and feats[0][1]==(1.0,2.0)
try:
    convex_intersection(sq,[(0,0),(4,0),(0,4),(4,4),(2,1)]); raise SystemExit("non-convex should fail")
except ValueError: pass
print("gis_ops tests passed")
