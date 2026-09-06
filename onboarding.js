/* ═══════════════════════════════════════════════
   QuickPaste Spotlight Tour & Interactive Guide
   Highlights actual UI elements with cutout box + arrow
   ═══════════════════════════════════════════════ */
(() => {
  const STORAGE_KEY = 'quickpaste_tour_done_v2';
  const tr = (key, vars) => globalThis.QuickPasteI18n?.t?.(key, vars) || key;

  const steps = [
    {
      target: '.topbar .switch',
      icon: '⚡',
      title: 'Bật hoặc tạm dừng tự dán',
      desc: 'Khi bật, QuickPaste tự dán văn bản bạn sao chép hoặc cắt vào ô đích đã chọn.',
      tips: [
        'Tắt công tắc để tạm dừng dán tự động',
        'Gửi thử, Gửi lại và menu chuột phải vẫn dùng được khi tạm dừng'
      ],
      pos: 'bottom'
    },
    {
      target: '#pickTarget',
      icon: '🎯',
      title: 'Chọn ô nhận văn bản',
      desc: 'Mở tab muốn nhận văn bản, bấm nút chọn ô đích, rồi bấm vào ô nhập hoặc vùng soạn thảo trên trang.',
      tips: [
        'Cửa sổ tiện ích sẽ đóng để bạn chọn ô. Nhấn Esc để hủy',
        'Nếu vừa cài hoặc tải lại tiện ích, nhấn F5 trên tab đó',
        'Ô mật khẩu và ô không cho chỉnh sửa không dùng làm đích'
      ],
      pos: 'bottom'
    },
    {
      target: '#targetSelect',
      icon: '📌',
      title: 'Danh sách ô đích đã lưu',
      desc: 'Danh sách này lưu các ô đích bạn đã chọn. Chọn một ô trong danh sách để dùng hoặc quản lý.',
      tips: [
        'Trạng thái bên trên cho biết có kết nối được với ô đang chọn hay không',
        'Muốn gửi tới nhiều ô, bật Dán nhiều ô và đánh dấu các ô nhận'
      ],
      pos: 'bottom'
    },
    {
      target: '.target-actions',
      icon: '🛠️',
      title: 'Quản lý ô đích',
      desc: 'Các nút bên cạnh nút chọn ô áp dụng cho ô đang chọn trong danh sách.',
      tips: [
        'Mở ô đích: chuyển đến tab và đánh dấu vị trí ô',
        'Đổi tên: đặt tên dễ nhớ, như Khung chat hoặc Ô dịch',
        'Xóa ô đích: bỏ khỏi danh sách, giữ nguyên văn bản trên trang'
      ],
      pos: 'bottom'
    },
    {
      target: '.quick-grid',
      icon: '⚡',
      title: 'Gửi thử, gửi lại và hoàn tác',
      desc: 'Gửi thử và Gửi lại đều chèn văn bản thật, theo cách chèn đang đặt trong Cài đặt.',
      tips: [
        'Gửi thử: chèn “QuickPaste ✓” vào ô đang chọn',
        'Gửi lại: dán nội dung đã gửi gần nhất vào các ô đã nhận lần đó',
        'Hoàn tác: khôi phục lần dán gần nhất nếu ô chưa được sửa thêm',
        'Chọn Thay toàn bộ nội dung sẽ ghi đè văn bản đang có trong ô'
      ],
      pos: 'bottom'
    },
    {
      target: '.activity-card',
      icon: '📊',
      title: 'Theo dõi lượt dán',
      desc: 'Xem các lượt dán thành công gần đây: trang nguồn, ô nhận, số ký tự và thời gian.',
      tips: [
        'Mỗi ô nhận thành công được tính là một lượt dán',
        'Danh sách này không hiển thị hay lưu nội dung văn bản đã gửi'
      ],
      pos: 'bottom'
    },
    {
      target: '.broadcast-card > .card-summary',
      icon: '📡',
      title: 'Dán cùng nội dung vào nhiều ô',
      desc: 'Mở mục Dán nhiều ô, bật công tắc rồi đánh dấu các ô muốn nhận văn bản từ lần sao chép hoặc cắt tiếp theo.',
      tips: [
        'Chọn ít nhất một ô. Phạm vi nguồn được xét riêng cho từng ô',
        'Gửi thử chỉ dùng ô đang chọn; Gửi lại dùng các ô đã nhận ở lần trước'
      ],
      pos: 'bottom'
    },
    {
      target: '.settings-card > .card-summary',
      icon: '⚙️',
      title: 'Chọn cách dán phù hợp',
      desc: 'Đặt nguồn văn bản, vị trí chèn và các tùy chọn ghi nhớ phù hợp với công việc.',
      tips: [
        'Chèn tại con trỏ, nối vào cuối hoặc thay toàn bộ nội dung',
        'Nhớ ô theo website dùng ô chọn gần nhất trên mỗi website',
        'Tắt Nhớ nội dung để gửi lại nếu không muốn giữ văn bản trong phiên'
      ],
      pos: 'top'
    },
    {
      target: 'footer',
      icon: '📖',
      title: 'Phím tắt và hướng dẫn',
      desc: 'Phím tắt đang được gán xuất hiện ngay phía trên chân cửa sổ. Bấm Hướng dẫn để xem lại các bước này.',
      tips: [
        'Có ba thao tác: chọn ô đích, đổi ô đích và bật/tắt tự dán',
        'Nếu thấy Chưa gán, mở chrome://extensions/shortcuts để đặt phím'
      ],
      pos: 'top'
    }
  ];

  let current = 0;
  let isOpen = false;
  let renderTimer = null;
  let autoOpenTimer = null;

  // DOM elements
  const overlay = document.getElementById('tourOverlay');
  const highlightBox = document.getElementById('tourHighlight');
  const tooltip = document.getElementById('tourTooltip');
  const arrow = document.getElementById('tourArrow');
  const icon = document.getElementById('tourIcon');
  const title = document.getElementById('tourTitle');
  const desc = document.getElementById('tourDesc');
  const tips = document.getElementById('tourTips');
  const counter = document.getElementById('tourCounter');
  const progressBar = document.getElementById('tourProgress');
  const btnNext = document.getElementById('tourNext');
  const btnBack = document.getElementById('tourBack');
  const btnSkip = document.getElementById('tourSkip');
  const btnClose = document.getElementById('tourClose');

  if (!overlay || !tooltip || !highlightBox) return;

  function updatePosition() {
    if (!isOpen) return;
    const step = steps[current];
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = 4;

    // Position spotlight cutout box
    highlightBox.style.top = `${Math.max(0, rect.top - pad)}px`;
    highlightBox.style.left = `${Math.max(0, rect.left - pad)}px`;
    highlightBox.style.width = `${rect.width + pad * 2}px`;
    highlightBox.style.height = `${rect.height + pad * 2}px`;

    // Position tooltip
    const tw = tooltip.offsetWidth || 330;
    const th = tooltip.offsetHeight || 220;
    const vw = document.documentElement.clientWidth || 420;
    const vh = document.documentElement.clientHeight || 620;
    const gap = 12;

    let preferredPos = step.pos;
    let actualPos = preferredPos;

    if (preferredPos === 'bottom' && rect.bottom + gap + th > vh) actualPos = 'top';
    if (preferredPos === 'top' && rect.top - gap - th < 0) actualPos = 'bottom';

    let top, left;
    if (actualPos === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tw / 2;
    } else {
      top = rect.top - gap - th;
      left = rect.left + rect.width / 2 - tw / 2;
    }

    // Keep tooltip within bounds
    left = Math.max(10, Math.min(left, vw - tw - 10));
    top = Math.max(10, Math.min(top, vh - th - 10));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Arrow positioning
    const elCenterX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(18, Math.min(elCenterX - left - 6, tw - 24));
    arrow.style.left = `${arrowLeft}px`;

    if (actualPos === 'bottom') {
      arrow.className = 'tour-arrow tour-arrow-top';
    } else {
      arrow.className = 'tour-arrow tour-arrow-bottom';
    }
  }

  function render() {
    const baseStep = steps[current];
    const stepNumber = current + 1;
    const step = {
      ...baseStep,
      title: tr(`guide.${stepNumber}.title`),
      desc: tr(`guide.${stepNumber}.desc`),
      tips: baseStep.tips.map((_, index) => tr(`guide.${stepNumber}.tip${index + 1}`))
    };
    const total = steps.length;
    const el = document.querySelector(step.target);

    if (!el) {
      if (current < total - 1) { current++; render(); }
      return;
    }

    // Scroll target into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Populate content
    if (icon) icon.textContent = step.icon;
    title.textContent = step.title;
    desc.textContent = step.desc;
    counter.textContent = tr('guide.step', { current: current + 1, total });
    progressBar.style.width = `${((current + 1) / total) * 100}%`;

    // Tips list with checkmarks
    if (tips) {
      tips.innerHTML = (step.tips || []).map(t => `<span>${t}</span>`).join('');
    }

    btnBack.hidden = current === 0;
    btnBack.textContent = tr('guide.back');
    btnNext.textContent = tr(current === total - 1 ? 'guide.finish' : 'guide.next');
    btnSkip.textContent = tr(current === total - 1 ? 'common.close' : 'common.skip');

    // Delay slightly to allow smooth scroll to settle
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (!isOpen) return;
      updatePosition();
      highlightBox.hidden = false;
      tooltip.classList.add('tour-visible');
    }, 150);
  }

  function open(startStep = 0) {
    clearTimeout(autoOpenTimer);
    isOpen = true;
    tooltip.hidden = false;
    current = Math.max(0, Math.min(steps.length - 1, Number(startStep) || 0));
    overlay.hidden = false;
    highlightBox.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('tour-active'));
    render();
  }

  function close() {
    isOpen = false;
    clearTimeout(renderTimer);
    clearTimeout(autoOpenTimer);
    tooltip.hidden = true;
    tooltip.classList.remove('tour-visible');
    overlay.classList.remove('tour-active');
    overlay.hidden = true;
    highlightBox.hidden = true;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
  }

  function next() {
    if (current < steps.length - 1) {
      current++;
      render();
    } else {
      close();
    }
  }

  function back() {
    if (current > 0) {
      current--;
      render();
    }
  }

  // Event bindings
  btnNext.addEventListener('click', next);
  btnBack.addEventListener('click', back);
  btnSkip.addEventListener('click', close);
  btnClose.addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Keyboard navigation like Google Meet Caption Unlock
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' && current > 0) { e.preventDefault(); back(); }
  });

  // Re-adjust on scroll or resize
  window.addEventListener('resize', updatePosition);
  document.addEventListener('scroll', updatePosition, true);

  // Guide button in footer
  const guideBtn = document.getElementById('showGuide');
  if (guideBtn) guideBtn.addEventListener('click', () => open(0));
  globalThis.QuickPasteI18n?.onChange?.(() => { if (isOpen) render(); });

  // Auto-show on first visit
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      autoOpenTimer = setTimeout(() => open(0), 280);
    }
  } catch (_) {}
})();
