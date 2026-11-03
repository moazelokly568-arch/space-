/* ===== GeoMasaha Pro — طبقة التعديلات (اشتراك / قوائم / إدارة / خصوصية) ===== */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const FREE_TABS = ['dashboard', 'subscription', 'student-profile'];
  const safeToast = (m, t) => { try { showToast(m, t || 'info'); } catch (e) {} };
  const isAdmin = () => { try { return !!isCurrentUserAdmin(); } catch (e) { return false; } };

  /* ---------- 1) الاشتراك مع تاريخ انتهاء ---------- */
  function subActive(u) {
    if (!u || !u.subscription || u.subscription.status !== 'active') return false;
    const e = u.subscription.expiresAt;
    return e ? new Date(e).getTime() > Date.now() : true;
  }
  window.isCurrentUserSubscribed = function () {
    if (isAdmin()) return true;
    try { if (!SUBSCRIPTION_CONFIG.gateEnabled) return true; } catch (e) {}
    return subActive(typeof currentUser !== 'undefined' ? currentUser : null);
  };
  function daysLeft(u) {
    if (!u || !u.subscription || !u.subscription.expiresAt) return null;
    return Math.ceil((new Date(u.subscription.expiresAt).getTime() - Date.now()) / 86400000);
  }

  /* قفل الأقسام لغير المشتركين / المنتهي اشتراكهم */
  const _switchTab = window.switchTab;
  window.switchTab = function (tabId) {
    if (!FREE_TABS.includes(tabId) && tabId !== 'admin-dashboard' && !window.isCurrentUserSubscribed()) {
      const logged = typeof currentUser !== 'undefined' && currentUser;
      const expired = logged && currentUser.subscription && currentUser.subscription.expiresAt && !subActive(currentUser);
      safeToast(expired ? '⏰ انتهى اشتراكك — جدّد اشتراكك عبر واتساب لمتابعة التعلم'
        : (logged ? '🔒 هذا القسم للمشتركين فقط — اشترك عبر واتساب' : '🔒 سجّل الدخول ثم اشترك لفتح هذا القسم'), 'info');
      tabId = 'subscription';
    }
    const r = _switchTab.call(this, tabId);
    setTimeout(refreshNavState, 30);
    return r;
  };
  setInterval(() => {
    const t = (typeof appState !== 'undefined' && appState.activeTab) || 'dashboard';
    if (!FREE_TABS.includes(t) && t !== 'admin-dashboard' && !window.isCurrentUserSubscribed()) window.switchTab('subscription');
    refreshNavState();
  }, 30000);
  /* مزامنة دورية لو السحابة مفعّلة (علشان الطالب يشوف التفعيل/الإيقاف) */
  setInterval(() => { try { if (!isAdmin() && localStorage.getItem('geomasaha_cloud_url_v1')) pullPlatformStateFromCloud(false); } catch (e) {} }, 120000);

  /* ---------- 2) زر الاشتراك → واتساب مباشرة ---------- */
  function waUrl(plan) {
    const num = String((SUBSCRIPTION_CONFIG && SUBSCRIPTION_CONFIG.whatsappNumber) || '201065009853').replace(/\D/g, '');
    const u = typeof currentUser !== 'undefined' ? currentUser : null;
    const msg = 'السلام عليكم، أرغب في الاشتراك في المنصة.\nالباقة: ' + (plan || 'لم أحدد بعد') +
      '\nالاسم: ' + (u ? u.name : '—') + '\nالبريد: ' + (u ? u.email : '—');
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
  }
  function goWhatsApp(plan) {
    const w = window.open(waUrl(plan), '_blank', 'noopener');
    if (!w) location.href = waUrl(plan);
  }
  document.addEventListener('click', function (ev) {
    const t = ev.target;
    const planBtn = t.closest('[data-select-sub-plan]');
    const direct = t.closest('#subHeroDirectWhatsappBtn, #floatingWhatsappSubscribeBtn, #btnWaPromptGoChat');
    const badge = t.closest('#headerSubStatusBadge');
    if (planBtn || direct || (badge && !window.isCurrentUserSubscribed())) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      let plan = planBtn ? planBtn.getAttribute('data-select-sub-plan') : '';
      if (!plan) { const r = $('input[name="waModalPlanRadio"]:checked'); plan = r ? r.value : ''; }
      goWhatsApp(plan);
    }
  }, true);

  /* ---------- 3) لوحة المدير: الطلاب والاشتراكات ---------- */
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return '—'; } }
  async function renderSubsPanel() {
    const host = $('#adminSubscriptionsMgrSubView');
    if (!host) return;
    let box = $('#geoSubsPanel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'geoSubsPanel';
      box.className = 'bg-slate-950 border border-amber-500/40 rounded-2xl p-4 space-y-3';
      host.insertBefore(box, host.children[1] || null);
      ['#adminGenerateCodesForm'].forEach(s => { const e = $(s, host); if (e) e.style.display = 'none'; });
      const cl = $('#adminActivationCodesList', host); if (cl && cl.parentElement) cl.parentElement.style.display = 'none';
    }
    const all = (await dbGetAllStudents()).filter(u => u && u.email && (u.email || '').toLowerCase() !== ADMIN_EMAIL);
    const q = ($('#geoSubSearch') && $('#geoSubSearch').value || '').trim().toLowerCase();
    const flt = ($('#geoSubFilter') && $('#geoSubFilter').value) || 'all';
    const rows = all.filter(u => {
      const st = subActive(u) ? 'active' : (u.subscription && u.subscription.expiresAt ? 'expired' : 'none');
      if (flt !== 'all' && st !== flt) return false;
      return !q || ((u.name || '') + ' ' + (u.email || '')).toLowerCase().includes(q);
    });
    const cnt = { active: 0, expired: 0, none: 0 };
    all.forEach(u => { cnt[subActive(u) ? 'active' : (u.subscription && u.subscription.expiresAt ? 'expired' : 'none')]++; });
    box.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-extrabold text-amber-300">👥 كل الطلاب — تفعيل الاشتراك وتحديد المدة</h4>
        <div class="flex gap-2 text-[11px] font-bold"><span class="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">مشترك: ${cnt.active}</span><span class="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300">منتهي: ${cnt.expired}</span><span class="px-2 py-1 rounded-lg bg-slate-800 text-slate-300">غير مشترك: ${cnt.none}</span></div>
      </div>
      <div class="flex flex-wrap gap-2">
        <input id="geoSubSearch" value="${q.replace(/"/g, '')}" placeholder="بحث بالاسم أو البريد…" class="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
        <select id="geoSubFilter" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
          <option value="all">الكل</option><option value="active">مشتركون</option><option value="expired">منتهي الاشتراك</option><option value="none">غير مشتركين</option></select>
      </div>
      <div class="space-y-2 max-h-[520px] overflow-y-auto custom-scroll">
      ${rows.length ? rows.map(u => {
        const act = subActive(u), dl = daysLeft(u);
        const badge = act ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">✓ مشترك${dl !== null ? ' — باقي ' + dl + ' يوم' : ' (دائم)'}</span>`
          : (u.subscription && u.subscription.expiresAt ? '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">⏰ انتهى</span>' : '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">غير مشترك</span>');
        const em = (u.email || '').replace(/"/g, '&quot;');
        return `<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2"><div><div class="font-extrabold text-white">${u.name || '—'}</div><div class="text-slate-400 ltr-num">${u.email}</div></div>${badge}</div>
          ${u.subscription && u.subscription.expiresAt ? `<div class="text-[11px] text-slate-400">ينتهي في: ${fmtDate(u.subscription.expiresAt)}</div>` : ''}
          <div class="flex flex-wrap items-center gap-2">
            <select data-dur="${em}" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
              <option value="30">شهر (30 يوم)</option><option value="90">3 شهور</option><option value="180" selected>6 شهور</option><option value="365">سنة</option><option value="custom">مدة مخصصة…</option></select>
            <input data-custom="${em}" type="number" min="1" placeholder="عدد الأيام" class="hidden w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
            <button data-act="${em}" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold">${act ? 'تجديد / مدّ' : 'تفعيل'}</button>
            ${act || (u.subscription && u.subscription.status) ? `<button data-off="${em}" class="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 hover:text-slate-950 text-rose-300 font-bold">إيقاف الآن</button>` : ''}
          </div></div>`;
      }).join('') : '<div class="text-center text-slate-400 text-xs p-4">لا يوجد طلاب مطابقون.</div>'}
      </div>
      <p class="text-[11px] text-slate-400">ملاحظة: التجديد بيضيف المدة على الباقي من الاشتراك الحالي. الطلاب بيظهروا هنا حسب الحسابات المسجلة على الجهاز/السحابة المتصلة.</p>`;
    $('#geoSubFilter').value = flt;
    $('#geoSubSearch').oninput = () => renderSubsPanel();
    $('#geoSubFilter').onchange = () => renderSubsPanel();
    $$('[data-dur]', box).forEach(s => s.onchange = () => { const c = $('[data-custom="' + s.dataset.dur + '"]', box); if (c) c.classList.toggle('hidden', s.value !== 'custom'); });
    $$('[data-act]', box).forEach(b => b.onclick = async () => {
      const email = b.dataset.act, sel = $('[data-dur="' + email + '"]', box);
      let days = sel.value === 'custom' ? parseInt($('[data-custom="' + email + '"]', box).value, 10) : parseInt(sel.value, 10);
      if (!days || days < 1) return safeToast('اكتب عدد أيام صحيح', 'error');
      const stu = await dbGetStudent(email); if (!stu) return;
      const base = subActive(stu) && stu.subscription.expiresAt ? new Date(stu.subscription.expiresAt).getTime() : Date.now();
      const exp = new Date(base + days * 86400000).toISOString();
      stu.subscription = { status: 'active', plan: 'اشتراك ' + days + ' يوم', days, activatedAt: new Date().toISOString(), expiresAt: exp };
      await dbSaveStudent(stu);
      try { recordAdminAuditLog('صلاحيات', 'تفعيل اشتراك ' + stu.name + ' لمدة ' + days + ' يوم'); } catch (e) {}
      saveSubscriptionStateToStorage();
      safeToast('✅ تم تفعيل اشتراك ' + stu.name + ' حتى ' + fmtDate(exp), 'success');
      renderSubsPanel();
    });
    $$('[data-off]', box).forEach(b => b.onclick = async () => {
      const stu = await dbGetStudent(b.dataset.off); if (!stu) return;
      stu.subscription = { status: 'expired', plan: (stu.subscription && stu.subscription.plan) || '', expiresAt: new Date(Date.now() - 1000).toISOString() };
      await dbSaveStudent(stu);
      try { recordAdminAuditLog('صلاحيات', 'إيقاف اشتراك ' + stu.name); } catch (e) {}
      saveSubscriptionStateToStorage();
      safeToast('⛔ تم إيقاف اشتراك ' + stu.name, 'info');
      renderSubsPanel();
    });
  }
  const _sat = window.switchAdminSubTab;
  if (_sat) window.switchAdminSubTab = async function (id) {
    const r = await _sat.apply(this, arguments);
    if (id === 'subscriptions-mgr') renderSubsPanel();
    return r;
  };
  function relabelAdmin() {
    const b = $('[data-admin-subtab="subscriptions-mgr"]'); if (b) b.textContent = '💎 الطلاب والاشتراكات';
    const s = $('[data-admin-subtab="students"]'); if (s) s.textContent = '👥 حسابات الطلاب والتقدم';
  }

  /* ---------- 4) القوائم العلوية المنظمة + الشريط السفلي + الفوتر ---------- */
  const GROUPS = [
    { id: 'home', icon: '🏠', label: 'الرئيسية', tab: 'dashboard' },
    { id: 'learn', icon: '🎓', label: 'التعلّم', items: [['roadmaps', '🧭', 'مسارات التعلم'], ['courses', '📚', 'مكتبة الكورسات'], ['software', '🛰️', 'موسوعة البرامج والأجهزة'], ['dictionary', '📖', 'القاموس الهندسي']] },
    { id: 'practice', icon: '🔬', label: 'التدريب العملي', items: [['calculators', '🔬', 'المختبر المساحي'], ['exams', '📝', 'الاختبارات'], ['projects', '🏗️', 'المشاريع التطبيقية'], ['training-center', '📥', 'ملفات التدريب'], ['interview', '💼', 'الإنترفيو (English)']] },
    { id: 'explore', icon: '🌐', label: 'الخرائط والمجتمع', items: [['maps-gallery', '🗺️', 'معرض الخرائط'], ['community', '👥', 'مجتمع GeoMasaha']] },
    { id: 'account', icon: '👤', label: 'حسابي', items: [['subscription', '💎', 'الاشتراك'], ['student-profile', '👨‍🎓', 'ملفي ولوحتي']] },
    { id: 'admin', icon: '🛡️', label: 'الإدارة', adminOnly: true, items: [['admin-dashboard', '🛡️', 'لوحة التحكم'], ['@subs', '💎', 'الطلاب والاشتراكات'], ['@cloud', '☁️', 'المزامنة السحابية']] }
  ];
  function buildNav() {
    const oldNav = $('#mainTabNav'); if (!oldNav || $('#geoNav')) return;
    const wrap = oldNav.parentElement; wrap.style.display = 'none';
    const nav = document.createElement('div');
    nav.id = 'geoNav';
    nav.className = 'max-w-7xl mx-auto px-4 sm:px-6 border-t border-slate-800/60 bg-slate-900/40';
    nav.innerHTML = '<div class="geo-nav-row">' + GROUPS.map(g => g.tab
      ? `<button class="geo-nav-btn" data-geo-tab="${g.tab}" data-group="${g.id}"><span>${g.icon}</span><span>${g.label}</span></button>`
      : `<button class="geo-nav-btn" data-geo-menu="${g.id}" data-group="${g.id}"${g.adminOnly ? ' data-admin-only="1"' : ''}><span>${g.icon}</span><span>${g.label}</span><span class="geo-caret">▾</span></button>`).join('') + '</div>';
    wrap.parentElement.insertBefore(nav, wrap);
    const panel = document.createElement('div'); panel.id = 'geoNavPanel'; panel.className = 'hidden'; document.body.appendChild(panel);
    nav.addEventListener('click', e => {
      const t = e.target.closest('[data-geo-tab]'); if (t) { closeMenu(); window.switchTab(t.dataset.geoTab); return; }
      const m = e.target.closest('[data-geo-menu]'); if (m) openMenu(m);
    });
    document.addEventListener('click', e => { if (!e.target.closest('#geoNavPanel') && !e.target.closest('[data-geo-menu]')) closeMenu(); });
    window.addEventListener('resize', closeMenu);
  }
  let openFor = null;
  function closeMenu() { const p = $('#geoNavPanel'); if (p) p.classList.add('hidden'); openFor = null; }
  function openMenu(btn) {
    const p = $('#geoNavPanel'); const g = GROUPS.find(x => x.id === btn.dataset.geoMenu);
    if (openFor === g.id) return closeMenu();
    openFor = g.id;
    const locked = !window.isCurrentUserSubscribed();
    p.innerHTML = g.items.map(it => `<button data-go="${it[0]}" class="geo-menu-item"><span>${it[1]}</span><span class="flex-1 text-right">${it[2]}</span>${locked && !FREE_TABS.includes(it[0]) && !it[0].startsWith('@') && it[0] !== 'admin-dashboard' ? '<span class="text-amber-400 text-[11px]">🔒</span>' : ''}</button>`).join('');
    p.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), pw = p.offsetWidth;
    p.style.top = (r.bottom + 6) + 'px';
    p.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.right - pw)) + 'px';
    $$('[data-go]', p).forEach(b => b.onclick = async () => {
      const k = b.dataset.go; closeMenu();
      if (k === '@subs') { await window.switchTab('admin-dashboard'); setTimeout(() => { try { switchAdminSubTab('subscriptions-mgr'); } catch (e) {} }, 150); }
      else if (k === '@cloud') { const c = $('#adminOpenCloudModalBtn'); if (c) c.click(); }
      else window.switchTab(k);
    });
  }
  function groupOf(tab) { for (const g of GROUPS) { if (g.tab === tab) return g.id; if (g.items && g.items.some(i => i[0] === tab)) return g.id; } return ''; }
  function refreshNavState() {
    const act = (typeof appState !== 'undefined' && appState.activeTab) || 'dashboard';
    const gid = groupOf(act);
    $$('.geo-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.group === gid);
      if (b.dataset.adminOnly) b.style.display = isAdmin() ? '' : 'none';
    });
    $$('.geo-bb-btn').forEach(b => b.classList.toggle('active', b.dataset.bb === act));
    const cloud = $('#headerCloudSyncBtn'); if (cloud) cloud.style.display = 'none';
    const edit = $('#headerEditPlatformNameBtn'); if (edit) edit.style.display = isAdmin() ? '' : 'none';
    const fw = $('#floatingWhatsappSubscribeBtn'); if (fw) fw.style.display = (isAdmin() || window.isCurrentUserSubscribed()) ? 'none' : '';
    const ad = $('#adminNavTabBtn'); if (ad) ad.style.display = 'none';
  }
  function buildBottomBar() {
    if ($('#geoBottomBar')) return;
    const items = [['dashboard', '🏠', 'الرئيسية'], ['courses', '📚', 'الكورسات'], ['calculators', '🔬', 'المختبر'], ['dictionary', '📖', 'القاموس'], ['student-profile', '👤', 'حسابي']];
    const bar = document.createElement('nav'); bar.id = 'geoBottomBar';
    bar.innerHTML = items.map(i => `<button class="geo-bb-btn" data-bb="${i[0]}"><span class="text-lg leading-none">${i[1]}</span><span>${i[2]}</span></button>`).join('');
    bar.addEventListener('click', e => { const b = e.target.closest('[data-bb]'); if (b) window.switchTab(b.dataset.bb); });
    document.body.appendChild(bar);
  }
  function buildFooter() {
    const f = $('footer'); if (!f || f.dataset.geo) return; f.dataset.geo = '1';
    f.innerHTML = `<div class="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-xs text-slate-400">
      ${GROUPS.filter(g => g.items && !g.adminOnly).map(g => `<div><div class="text-slate-200 font-extrabold mb-2">${g.icon} ${g.label}</div><div class="space-y-1.5">${g.items.map(i => `<button data-ft="${i[0]}" class="block hover:text-emerald-400 transition">${i[2]}</button>`).join('')}</div></div>`).slice(0, 4).join('')}
    </div><div class="max-w-7xl mx-auto mt-5 pt-4 border-t border-slate-800/70 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2"><span>GeoMasaha Pro © ${new Date().getFullYear()}</span><span id="footerPlatformName" class="hidden"></span><span>منصة تعليمية لمهندسي المساحة ونظم المعلومات الجغرافية</span></div>`;
    f.addEventListener('click', e => { const b = e.target.closest('[data-ft]'); if (b) { window.switchTab(b.dataset.ft); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  }

  /* ---------- 5) إخفاء بيانات الأكاديمية/الإدارة عن الطلاب ---------- */
  const SWAPS = [[/@moaz elokly/g, 'الدعم الفني'], [/م\.\s*معاذ العكلي/g, 'إدارة المنصة'], [/\(?\s*01065009853\s*\)?/g, ' (رقم التحويل يصلك على واتساب) '],
    [/محافظة الشرقية\s*—?\s*جمهورية مصر العربية/g, ''], [/moazelokly568@gmail\.com/g, '']];
  function sanitize() {
    if (isAdmin()) return;
    const adminView = $('#view-admin-dashboard');
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      if (adminView && adminView.contains(n)) return;
      const p = n.parentElement; if (!p || /SCRIPT|STYLE|TEXTAREA/.test(p.tagName)) return;
      let v = n.nodeValue, o = v;
      SWAPS.forEach(s => { v = v.replace(s[0], s[1]); });
      if (v !== o) n.nodeValue = v;
    });
    $$('[title]').forEach(e => { const t = e.getAttribute('title'); if (t && /moaz elokly/.test(t)) e.setAttribute('title', t.replace(/@moaz elokly/g, 'الدعم الفني')); });
  }
  let sanTimer = null;
  new MutationObserver(() => { clearTimeout(sanTimer); sanTimer = setTimeout(() => { sanitize(); relabelAdmin(); refreshNavState(); }, 500); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });

  /* ---------- 6) تسمية المختبر ---------- */
  function relabelLab() {
    const h = $('#view-calculators h2'); if (h && !h.dataset.geo) { h.dataset.geo = 1; h.textContent = '🔬 المختبر المساحي — تدرّب على حل المسائل'; }
    const hp = h && h.nextElementSibling; if (hp && !hp.dataset.geo) { hp.dataset.geo = 1; hp.textContent = 'مسائل عملية بأرقام عشوائية بتتولد كل مرة، حلّها وتأكد من إجابتك واتعلم خطوات الحل، وبعدها استخدم الحاسبات الجاهزة تحت.'; }
  }

  function init() { buildNav(); buildBottomBar(); buildFooter(); relabelAdmin(); relabelLab(); sanitize(); refreshNavState(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  setTimeout(init, 800); setTimeout(init, 2500);
  window.__geoRefreshNav = refreshNavState;
})();
