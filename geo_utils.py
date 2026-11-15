"""Pure helpers (no web/CAD dependencies) — testable on their own."""
import csv
import io
import math

X_NAMES = {"x", "easting", "e", "east", "longitude", "lon", "lng"}
Y_NAMES = {"y", "northing", "n", "north", "latitude", "lat"}
MAX_ROWS = 5000


def parse_table(filename: str, data: bytes):
    """Return (columns, rows) from CSV or XLSX bytes. Raises ValueError on bad input."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        text = data.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        all_rows = [r for r in reader if any(c.strip() for c in r)]
    elif ext in ("xlsx", "xls"):
        if ext == "xls":
            raise ValueError("ملفات .xls القديمة غير مدعومة، احفظ الملف بصيغة .xlsx")
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        all_rows = [[("" if c is None else str(c)) for c in r]
                    for r in ws.iter_rows(values_only=True)
                    if r and any(c not in (None, "") for c in r)]
    else:
        raise ValueError("صيغة الجدول غير مدعومة")
    if not all_rows:
        raise ValueError("الملف فارغ")
    columns = [c.strip() for c in all_rows[0]]
    rows = all_rows[1:MAX_ROWS + 1]
    return columns, rows


def detect_coordinate_columns(columns):
    """Find X/Y columns by common names (Easting/Northing, X/Y, Lat/Lon)."""
    found = {}
    for idx, name in enumerate(columns):
        key = name.strip().lower()
        if key in X_NAMES and "x" not in found:
            found["x"] = {"index": idx, "name": name}
        elif key in Y_NAMES and "y" not in found:
            found["y"] = {"index": idx, "name": name}
    return found


def extract_points(columns, rows, detected):
    """Return (points, warnings). Rows with non-numeric coordinates are skipped and reported."""
    warnings = []
    if "x" not in detected or "y" not in detected:
        return [], ["لم يتم التعرف على أعمدة X/Y أو Easting/Northing. اختر الأعمدة يدوياً."]
    xi, yi = detected["x"]["index"], detected["y"]["index"]
    points, bad = [], 0
    for r in rows:
        try:
            x = float(str(r[xi]).replace(",", "."))
            y = float(str(r[yi]).replace(",", "."))
            if math.isfinite(x) and math.isfinite(y):
                points.append((x, y))
            else:
                bad += 1
        except (ValueError, IndexError):
            bad += 1
    if bad:
        warnings.append(f"تم تجاهل {bad} صفاً بإحداثيات غير صالحة.")
    if len(points) < 3:
        warnings.append("عدد النقاط الصالحة أقل من 3، لا يمكن تكوين مضلع.")
    return points, warnings


def polygon_area(points):
    """Shoelace formula. Points are (x, y) in the same units as input."""
    n = len(points)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def perimeter(points, closed=True):
    n = len(points)
    total = 0.0
    edges = n if closed else n - 1
    for i in range(edges):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        total += math.hypot(x2 - x1, y2 - y1)
    return total
