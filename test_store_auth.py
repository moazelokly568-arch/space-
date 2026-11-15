import os, tempfile, time
from store import Store
from auth import hash_password, verify_password, make_token, read_token

p = os.path.join(tempfile.mkdtemp(), "t.db")
s = Store(p)
uid = s.create_user("Student@Example.com", "Ali", hash_password("secret123"))
u = s.get_user_by_email("student@example.com")
assert u and u["id"] == uid
assert verify_password("secret123", u["password_hash"]) and not verify_password("wrong", u["password_hash"])

# quota on free plan: chat limit 10
for i in range(10):
    ok, used, lim = s.consume(uid, "free", "chat")
    assert ok, i
ok, used, lim = s.consume(uid, "free", "chat")
assert not ok and lim == 10

# subscription: admin activates pro for 30 days -> pro limits apply
s.set_subscription(uid, "pro", 30, actor_id=None)
u = s.get_user(uid)
assert s.effective_plan(u) == "pro"
ok, used, lim = s.consume(uid, "pro", "chat")
assert ok and lim == 300

# expired subscription falls back to free
s.set_subscription(uid, "pro", 1)
s.db.execute("UPDATE users SET plan_expires_at=? WHERE id=?", (int(time.time()) - 10, uid)); s.db.commit()
assert s.effective_plan(s.get_user(uid)) == "free"

# admin edits limits
s.set_limit("free", "chat", 2)
assert s.get_limits()["free"]["chat"] == 2
try:
    s.set_subscription(uid, "pro", 0); raise SystemExit("days=0 should fail")
except ValueError: pass

# tokens
secret = b"test-secret"
t = make_token(uid, secret)
assert read_token(t, secret) == uid
assert read_token(t, b"other") is None
assert read_token(make_token(uid, secret, ttl_seconds=-5), secret) is None

# files ownership
s.record_file("a"*32+".dxf", uid, "dxf")
assert s.file_owner("a"*32+".dxf") == uid
print("store/auth tests passed")
