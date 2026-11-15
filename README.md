# GeoMasaha AI — Backend

## تشغيل محلي
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=...      # Windows: set ANTHROPIC_API_KEY=...
    export GM_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))")
    export GM_ADMIN_EMAILS=your@email.com
    uvicorn main:app --reload --port 8000

في صفحة المنصة: تبويبة GeoMasaha AI ← ⚙️ إعدادات الخادم ← http://localhost:8000 ← سجّل حساباً.
حساب المدير هو البريد المذكور في GM_ADMIN_EMAILS. يظهر قسم «مشتركو GeoMasaha AI» داخل لوحة الإدارة.

## النشر
Render أو Railway أو VPS، والأمر: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
ضع المفاتيح وGM_SECRET في لوحة الاستضافة فقط، واجعل GM_DB على تخزين دائم.

## الخطط والحدود
- Free وPro، والحدود اليومية لكل خدمة (chat, upload, dxf, gis) قابلة للتعديل من لوحة الإدارة.
- تفعيل الاشتراك يدوياً من المدير مع عدد الأيام، وينتهي تلقائياً فيعود الحساب إلى Free.
- لا يوجد نظام دفع في هذه النسخة عمداً؛ التفعيل يتم بعد استلام الدفع يدوياً. عند تحديد بوابة الدفع تُضاف كنقطة webhook.

## ما هو مُفعّل
- تسجيل الدخول والجلسات الموقعة (HMAC)، وكلمات المرور مشفرة (PBKDF2).
- الدردشة مع النموذج، وحفظ المحادثات على الخادم.
- رفع CSV/XLSX واكتشاف أعمدة X/Y أو Easting/Northing.
- إنشاء DXF لحدود قطعة أرض مع أبعاد وتسميات وإطار وسهم شمال ومساحة ومحيط.
- GIS: قياس (مع geodesic)، Buffer للنقاط، عدّ النقاط داخل المضلعات، تقاطع مضلعين محدبين.
- ملفات DXF تظهر لصاحبها فقط.

## ما هو غير مُفعّل بعد
- PostgreSQL: الحالي SQLite (المخطط بسيط وقابل للنقل).
- استخراج محتوى PDF والصور وDXF المرفوع، وتحويل DWG.
- Buffer للخطوط والمضلعات، والتقاطع للمضلعات غير المحدبة (تحتاج shapely/GEOS).
- بوابة دفع حقيقية.
- الملفات المُولَّدة تُحذف عند إعادة التشغيل إن لم تكن على تخزين دائم؛ أضف تنظيفاً دورياً قبل الإنتاج.

## الاختبار
    python test_geo_utils.py
    python test_gis_ops.py
    python test_store_auth.py
