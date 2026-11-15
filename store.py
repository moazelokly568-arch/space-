"""SQLite storage for users, subscriptions, plan limits, usage, conversations and files.
Uses only the standard library. Schema is simple SQL so it can move to PostgreSQL later."""
import sqlite3, time, datetime as dt
from threading import Lock

DEFAULT_LIMITS = {
    "free": {"chat": 10, "upload": 3, "dxf": 2, "gis": 5},
    "pro": {"chat": 300, "upload": 50, "dxf": 50, "gis": 200},
}
KINDS = ("chat", "upload", "dxf", "gis")


class Store:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = Lock()
        self._init()

    def _init(self):
        with self.lock, self.db:
            self.db.executescript("""
            CREATE TABLE IF NOT EXISTS users(
              id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT,
              password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student',
              plan TEXT NOT NULL DEFAULT 'free', plan_expires_at INTEGER, active INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS plan_limits(
              plan TEXT NOT NULL, kind TEXT NOT NULL, daily_limit INTEGER NOT NULL, PRIMARY KEY(plan, kind));
            CREATE TABLE IF NOT EXISTS usage(
              user_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY(user_id, day, kind));
            CREATE TABLE IF NOT EXISTS messages(
              id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, conv_id TEXT NOT NULL,
              role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS files(
              name TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(
              id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, action TEXT NOT NULL,
              detail TEXT, created_at INTEGER NOT NULL);
            """)
            for plan, kinds in DEFAULT_LIMITS.items():
                for kind, n in kinds.items():
                    self.db.execute("INSERT OR IGNORE INTO plan_limits VALUES(?,?,?)", (plan, kind, n))

    # ---- users
    def create_user(self, email, name, password_hash, role="student"):
        with self.lock, self.db:
            cur = self.db.execute(
                "INSERT INTO users(email,name,password_hash,role,created_at) VALUES(?,?,?,?,?)",
                (email.lower(), name, password_hash, role, int(time.time())))
            return cur.lastrowid

    def get_user_by_email(self, email):
        return self.db.execute("SELECT * FROM users WHERE email=?", (email.lower(),)).fetchone()

    def get_user(self, uid):
        return self.db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()

    def list_users(self):
        return self.db.execute("SELECT id,email,name,role,plan,plan_expires_at,active,created_at FROM users ORDER BY id DESC").fetchall()

    def set_subscription(self, uid, plan, days, actor_id=None):
        if plan not in DEFAULT_LIMITS:
            raise ValueError("خطة غير معروفة")
        if days < 0 or days > 3650:
            raise ValueError("عدد الأيام يجب أن يكون بين 0 و 3650")
        expires = int(time.time()) + days * 86400 if plan != "free" and days > 0 else None
        if plan != "free" and days == 0:
            raise ValueError("حدد مدة الاشتراك بالأيام")
        with self.lock, self.db:
            self.db.execute("UPDATE users SET plan=?, plan_expires_at=? WHERE id=?", (plan, expires, uid))
            self.db.execute("INSERT INTO audit(actor_id,action,detail,created_at) VALUES(?,?,?,?)",
                            (actor_id, "set_subscription", f"user={uid} plan={plan} days={days}", int(time.time())))

    def set_active(self, uid, active: bool):
        with self.lock, self.db:
            self.db.execute("UPDATE users SET active=? WHERE id=?", (1 if active else 0, uid))

    def effective_plan(self, user_row):
        if user_row["plan"] != "free" and user_row["plan_expires_at"] and user_row["plan_expires_at"] > time.time():
            return user_row["plan"]
        return "free"

    # ---- plan limits (editable from admin)
    def get_limits(self):
        rows = self.db.execute("SELECT plan,kind,daily_limit FROM plan_limits").fetchall()
        out = {}
        for r in rows:
            out.setdefault(r["plan"], {})[r["kind"]] = r["daily_limit"]
        return out

    def set_limit(self, plan, kind, value, actor_id=None):
        if plan not in DEFAULT_LIMITS or kind not in KINDS:
            raise ValueError("خطة أو نوع غير صالح")
        if not (0 <= value <= 100000):
            raise ValueError("القيمة خارج النطاق")
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO plan_limits VALUES(?,?,?)", (plan, kind, value))
            self.db.execute("INSERT INTO audit(actor_id,action,detail,created_at) VALUES(?,?,?,?)",
                            (actor_id, "set_limit", f"{plan}.{kind}={value}", int(time.time())))

    # ---- usage quota
    @staticmethod
    def _today():
        return dt.datetime.utcnow().strftime("%Y-%m-%d")

    def consume(self, uid, plan, kind):
        """Atomically check and count one use. Returns (allowed, used, limit)."""
        if kind not in KINDS:
            raise ValueError("نوع غير معروف")
        limit = self.get_limits().get(plan, {}).get(kind, 0)
        day = self._today()
        with self.lock, self.db:
            row = self.db.execute("SELECT count FROM usage WHERE user_id=? AND day=? AND kind=?", (uid, day, kind)).fetchone()
            used = row["count"] if row else 0
            if used >= limit:
                return False, used, limit
            self.db.execute("INSERT INTO usage(user_id,day,kind,count) VALUES(?,?,?,1) "
                            "ON CONFLICT(user_id,day,kind) DO UPDATE SET count=count+1", (uid, day, kind))
            return True, used + 1, limit

    def usage_today(self, uid):
        rows = self.db.execute("SELECT kind,count FROM usage WHERE user_id=? AND day=?", (uid, self._today())).fetchall()
        return {r["kind"]: r["count"] for r in rows}

    # ---- conversations and files
    def save_message(self, uid, conv_id, role, content):
        with self.lock, self.db:
            self.db.execute("INSERT INTO messages(user_id,conv_id,role,content,created_at) VALUES(?,?,?,?,?)",
                            (uid, conv_id, role, content, int(time.time())))

    def conversation(self, uid, conv_id):
        return self.db.execute("SELECT role,content,created_at FROM messages WHERE user_id=? AND conv_id=? ORDER BY id",
                               (uid, conv_id)).fetchall()

    def record_file(self, name, uid, kind):
        with self.lock, self.db:
            self.db.execute("INSERT INTO files VALUES(?,?,?,?)", (name, uid, kind, int(time.time())))

    def file_owner(self, name):
        r = self.db.execute("SELECT user_id FROM files WHERE name=?", (name,)).fetchone()
        return r["user_id"] if r else None

    def user_files(self, uid):
        return self.db.execute("SELECT name,kind,created_at FROM files WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
