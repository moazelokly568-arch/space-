from geo_utils import *
cols,rows=parse_table("p.csv",b"Easting,Northing,Name\n0,0,A\n100,0,B\n100,50,C\n0,50,D\nbad,1,E\n")
det=detect_coordinate_columns(cols)
pts,w=extract_points(cols,rows,det)
assert det["x"]["index"]==0 and det["y"]["index"]==1, det
assert len(pts)==4 and w, (pts,w)
assert abs(polygon_area(pts)-5000)<1e-6
assert abs(perimeter(pts)-300)<1e-6
try:
    parse_table("p.xls",b"")
    raise SystemExit("xls should fail")
except ValueError: pass
print("geo_utils tests passed")
