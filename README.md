<p align="center">
  <img src="icons/icon128.png" alt="QuickPaste Logo" width="96" />
</p>

<h1 align="center">QuickPaste — Tự Động Dán Văn Bản</h1>

<p align="center">
  <strong>Tiện ích mở rộng Chrome giúp tự động dán nội dung vừa sao chép (Copy) hoặc cắt (Cut) vào ô nhập liệu được chỉ định trước trên bất kỳ trang web nào.</strong>
</p>

<p align="center">
<img src="https://img.shields.io/badge/Google_Chrome-4285F4?style=flat-square&logo=google-chrome&logoColor=white" alt="Google Chrome" />
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Version-1.0.0-orange" alt="Version 1.0.0" />
  <img src="https://img.shields.io/badge/Languages-VI%20%7C%20EN-blueviolet" alt="VI | EN" />
</p>

---

## 📖 Mục Lục

- [Tổng Quan](#-tổng-quan)
- [Tính Năng Chính](#-tính-năng-chính)
- [Cài Đặt](#-cài-đặt)
- [Hướng Dẫn Sử Dụng](#-hướng-dẫn-sử-dụng)
- [Phím Tắt](#-phím-tắt)
- [Cài Đặt Chi Tiết](#-cài-đặt-chi-tiết)
- [Kiến Trúc Kỹ Thuật](#-kiến-trúc-kỹ-thuật)
- [Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
- [Tương Thích Trình Soạn Thảo](#-tương-thích-trình-soạn-thảo)
- [Bảo Mật & Quyền Riêng Tư](#-bảo-mật--quyền-riêng-tư)
- [Câu Hỏi Thường Gặp](#-câu-hỏi-thường-gặp)

---

## 🚀 Tổng Quan

**QuickPaste** giải quyết một nhu cầu phổ biến: bạn thường xuyên phải sao chép văn bản ở một nơi rồi chuyển sang tab/cửa sổ khác để dán vào một ô nhập liệu cố định (ô chat, ô dịch thuật, form nhập liệu, trình soạn thảo code...). QuickPaste tự động hóa bước dán — bạn chỉ cần **chọn ô đích một lần**, sau đó mỗi lần **Copy/Cut** ở bất kỳ đâu, nội dung sẽ **tự động được dán** vào ô đích đã chọn.

### Quy trình 3 bước

```
1️⃣  Chọn ô đích  →  2️⃣  Sao chép / Cắt văn bản  →  ✅  Tự động dán!
```

---

## ✨ Tính Năng Chính

### Cốt lõi
| Tính năng | Mô tả |
|---|---|
| **Tự động dán** | Copy/Cut ở bất kỳ tab nào → nội dung tự dán vào ô đích đã chọn |
| **Chọn ô đích trực quan** | Nhấp chọn ô nhập liệu trên trang web bằng giao diện overlay tương tác |
| **Quản lý nhiều ô đích** | Lưu và chuyển đổi tối đa 20 ô đích khác nhau |
| **Dán nhiều ô (Broadcast)** | Gửi đồng thời nội dung tới nhiều ô đích cùng lúc |
| **Nhớ ô theo website** | Tự động ghi nhớ và kích hoạt ô đích theo từng website (giao thức, tên miền và cổng) |

### Chế độ chèn văn bản
| Chế độ | Hành vi |
|---|---|
| **Tại con trỏ** (`cursor`) | Chèn tại vị trí con trỏ đang đứng trong ô đích |
| **Nối vào cuối** (`append`) | Thêm văn bản vào cuối nội dung hiện có, với ký tự ngăn cách tùy chỉnh |
| **Thay thế** (`replace`) | Xóa toàn bộ nội dung cũ và thay bằng văn bản mới |

### Thao tác nhanh
- **🧪 Gửi thử** — Chèn chuỗi `QuickPaste ✓` để kiểm tra kết nối
- **🔄 Gửi lại** — Gửi lại nội dung copy gần nhất
- **↩️ Hoàn tác** — Khôi phục nội dung trước khi dán (thông minh: không ghi đè nếu người dùng đã chỉnh sửa sau khi dán)

### Tính năng nâng cao
- **Chống gửi trùng** — Bỏ qua nội dung trùng lặp trong cửa sổ thời gian cấu hình được (mặc định 900ms)
- **Tự động kết nối lại** — Nhận diện lại ô đích khi tab tải lại hoặc DOM thay đổi
- **Dán một lần (One-shot)** — Tự động tạm dừng sau mỗi lần dán thành công
- **Cắt tỉa khoảng trắng** — Tự động loại bỏ khoảng trắng/dòng trống thừa ở đầu và cuối
- **Lịch sử hoạt động** — Hiển thị 8 lần dán gần nhất với thời gian tương đối
- **Đa ngôn ngữ** — Giao diện mặc định bằng Tiếng Việt 🇻🇳; có thể chuyển sang Tiếng Anh 🇬🇧 ngay trong popup và lựa chọn được ghi nhớ
- **Hướng dẫn tương tác** — Tour spotlight 9 bước cho người dùng mới, có thể mở lại bất kỳ lúc nào

---

## 📦 Cài Đặt

1. Tải xuống hoặc clone thư mục mã nguồn extension
2. Dùng Google Chrome 119 trở lên, rồi truy cập `chrome://extensions/`
3. Bật **Chế độ nhà phát triển** (Developer mode) ở góc trên bên phải
4. Nhấn **Tải tiện ích đã giải nén** (Load unpacked)
5. Chọn thư mục `quickpaste-extension`
6. Ghim biểu tượng QuickPaste lên thanh công cụ để truy cập nhanh
7. **Quan trọng:** Nhấn **F5** tải lại các tab đang mở để extension bắt đầu hoạt động

---

## 📘 Hướng Dẫn Sử Dụng

### Bước 1: Chọn ô đích
1. Nhấp biểu tượng QuickPaste trên thanh công cụ
2. Nhấn nút **「＋ Chọn ô đích」** (hoặc phím tắt `Alt+Shift+T`)
3. Di chuột qua trang web — các ô nhập liệu sẽ được đánh dấu viền xanh
4. Nhấp vào ô nhập liệu muốn chọn làm đích

### Bước 2: Sao chép văn bản
- Copy (`Ctrl+C`) hoặc Cut (`Ctrl+X`) bất kỳ văn bản nào ở bất kỳ tab nào

### Bước 3: Xong!
- Văn bản tự động được dán vào ô đích đã chọn
- Ô đích sẽ nhấp nháy viền xanh lá để xác nhận thành công

### Quản lý ô đích
- **Chuyển đổi ô đích:** Dùng dropdown trong popup hoặc phím tắt `Alt+Shift+Y`
- **Đổi tên:** Nhấn biểu tượng bút chì ✏️ để đặt tên gợi nhớ (vd: "Ô chat Zalo", "Google Dịch")
- **Xóa:** Nhấn biểu tượng thùng rác 🗑️ để xóa ô đích
- **Focus:** Nhấn biểu tượng mắt 👁️ để nhảy tới tab chứa ô đích và làm nổi bật nó

---

## ⌨️ Phím Tắt

| Phím tắt | Chức năng |
|---|---|
| `Alt + Shift + T` | Phím tắt đề xuất để kích hoạt chế độ chọn ô đích |
| `Alt + Shift + Y` | Phím tắt đề xuất để chuyển sang ô đích tiếp theo |
| `Alt + Shift + Q` | Phím tắt đề xuất để bật / tắt QuickPaste |

> 💡 Tùy chỉnh phím tắt tại `chrome://extensions/shortcuts`

---

## ⚙️ Cài Đặt Chi Tiết

| Cài đặt | Giá trị | Mô tả |
|---|---|---|
| **Phạm vi nguồn** | Mọi tab / Cùng tab / Khác tab | Giới hạn nơi bắt sự kiện copy/cut |
| **Chế độ chèn** | Con trỏ / Nối cuối / Thay thế | Cách chèn văn bản vào ô đích |
| **Ký tự ngăn cách** | `\n`, `\n\n`, dấu cách, tab,... | Ký tự phân cách khi ở chế độ nối cuối |
| **Thông báo tại nguồn** | Bật / Tắt | Hiển thị xác nhận tại tab nơi copy |
| **Chống gửi trùng** | Bật / Tắt + thời gian (0.5s–3s) | Chặn nội dung giống nhau gửi liên tục |
| **Tự nối lại** | Bật / Tắt | Tìm lại ô đích khi tab tải lại |
| **Nhớ ô theo website** | Bật / Tắt | Ghi nhớ ô theo website (giao thức, tên miền và cổng); dùng cùng Tự nối lại |
| **Nhớ nội dung gửi lại** | Bật / Tắt | Lưu nội dung copy gần nhất trong phiên |
| **Cắt tỉa khoảng trắng** | Bật / Tắt | Loại bỏ khoảng trắng thừa đầu/cuối |
| **Dán một lần** | Bật / Tắt | Tạm dừng sau mỗi lần dán thành công |

---

## 🏗️ Kiến Trúc Kỹ Thuật

```
┌─────────────────────────────────────────────────────────────────┐
│                        POPUP UI (popup.html)                    │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐     │
│  │     popup.js         │    │     onboarding.js            │     │
│  │  • Dashboard quản lý │    │  • Tour spotlight 9 bước    │     │
│  │  • Cài đặt & Thao tác│    │  • Định vị tooltip thông minh│     │
│  │  • Broadcast đa mục  │    │  • Hỗ trợ điều hướng bàn phím│     │
│  │  • Đồng bộ realtime  │    │  • Phản ứng đổi ngôn ngữ    │     │
│  └──────────┬──────────┘    └─────────────────────────────┘     │
│             │                                                    │
│  ┌──────────┴──────────┐                                        │
│  │      i18n.js         │  ← Module đa ngôn ngữ VI/EN          │
│  │  • 140+ chuỗi dịch   │     Đồng bộ qua chrome.storage       │
│  └─────────────────────┘                                        │
├─────────────────────────────────────────────────────────────────┤
│                  chrome.runtime.sendMessage ↕                   │
├─────────────────────────────────────────────────────────────────┤
│                  SERVICE WORKER (service-worker.js)              │
│                                                                 │
│  • Điều phối trung tâm & định tuyến tin nhắn (15+ hành động)   │
│  • Hàng đợi Promise tuần tự hóa — triệt tiêu race condition    │
│  • Quản lý target: lưu/xóa/đổi tên/chuyển đổi/broadcast       │
│  • Dedup bằng hash FNV-1a 32-bit + cửa sổ thời gian            │
│  • Auto-reconnect: tìm tab → resolve frame → xác minh document │
│  • Website Profiles: ghi nhớ & tự kích hoạt ô đích theo domain │
│  • Badge thông minh: ON/OFF/B{n}/! theo trạng thái             │
│  • Context menu & xử lý phím tắt                               │
├─────────────────────────────────────────────────────────────────┤
│                  chrome.tabs.sendMessage ↕                      │
├─────────────────────────────────────────────────────────────────┤
│               CONTENT SCRIPT (content.js + i18n.js)             │
│                        ↓ Tiêm vào mọi frame                    │
│                                                                 │
│  • Bắt sự kiện Copy/Cut → gửi văn bản về service worker        │
│  • Picker overlay: hover highlight → click chọn ô đích         │
│  • Resolve target: live ref → CSS locator → fingerprint (≥6đ)  │
│  • Chèn văn bản: native setter (React/Vue) + execCommand       │
│  • Adapter cho 5 editor: Monaco, CodeMirror, Ace, Quill,       │
│    ProseMirror                                                  │
│  • Theo dõi caret liên tục qua Shadow DOM                      │
│  • Undo stack thông minh theo phần tử                          │
│  • Phản hồi trực quan: flash viền + toast nổi                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cơ chế nhận diện ô đích

QuickPaste sử dụng **pipeline 3 lớp** để đảm bảo tìm lại ô đích chính xác ngay cả khi DOM thay đổi:

1. **Live Reference** — Kiểm tra tham chiếu DOM trực tiếp trong bộ nhớ (`Map`)
2. **CSS Locator** — Selector phân cấp: ưu tiên `id` → `data-testid` / `data-test` / `data-qa` → `name` / `aria-label` → `:nth-of-type`. Hỗ trợ xuyên qua nhiều tầng Shadow DOM
3. **Fingerprint Matching** — Khi selector bị vỡ do layout thay đổi, dùng thuật toán chấm điểm (ID: +12, data-*: +9, thuộc tính chuẩn: +6, tag: +2, class: +1). Chỉ khớp khi điểm ≥ 6 và không hòa điểm với ứng viên xếp sau

Khi tìm lại thành công bằng lớp 2 hoặc 3, hệ thống tự động **cập nhật locator/fingerprint mới** để lần sau tìm nhanh hơn.

---

## 📁 Cấu Trúc Thư Mục

```
quickpaste-extension/
├── manifest.json        # Cấu hình extension (Manifest V3)
├── service-worker.js    # Bộ não trung tâm — điều phối, lưu trữ, định tuyến
├── content.js           # Script tiêm vào trang — bắt copy, chọn ô, dán văn bản
├── i18n.js              # Module đa ngôn ngữ (Tiếng Việt / Tiếng Anh)
├── popup.html           # Giao diện popup dashboard
├── popup.js             # Logic điều khiển popup
├── popup.css            # Giao diện Glassmorphism hiện đại
├── onboarding.js        # Tour hướng dẫn tương tác 9 bước
├── icons/
│   ├── icon.png         # Icon gốc độ phân giải cao
│   ├── icon128.png      # Chrome Web Store & cài đặt
│   ├── icon48.png       # Trang quản lý extension
│   ├── icon32.png       # Toolbar (Retina)
│   └── icon16.png       # Favicon & menu chuột phải
└── README.md            # Tệp này
```

---

## 🔌 Tương Thích Trình Soạn Thảo

QuickPaste có **adapter chuyên biệt** để hoạt động chính xác với các trình soạn thảo web phổ biến:

| Trình soạn thảo | Phát hiện qua | Ghi chú |
|---|---|---|
| **Monaco Editor** | `.monaco-editor` | VS Code, Azure DevOps, nhiều IDE online |
| **CodeMirror 5** | `.CodeMirror` | Nhiều trang web dùng editor cũ |
| **CodeMirror 6** | `.cm-editor` | Phiên bản mới, dùng `contenteditable` |
| **Ace Editor** | `.ace_editor` | Cloud9, GitHub Codespaces |
| **Quill** | `.ql-container` | Slack, nhiều CMS hiện đại |
| **ProseMirror** | `.ProseMirror` | Notion, Confluence, Atlassian |

Ngoài các editor trên, QuickPaste hỗ trợ `<textarea>`, phần tử `contenteditable` tiêu chuẩn và các `<input>` có kiểu `text`, `search`, `url`, `tel`, `email` hoặc `number`. Tiện ích cũng hỗ trợ ô nằm trong **iframe lồng nhau** và **Shadow DOM mở**.

---

## 🔒 Bảo Mật & Quyền Riêng Tư

- **Không gửi dữ liệu ra ngoài** — Toàn bộ xử lý diễn ra cục bộ trong trình duyệt
- **Không lưu mật khẩu** — Tự động bỏ qua các ô `type="password"`
- **Không lưu nội dung vĩnh viễn** — Nội dung gửi lại chỉ lưu trong `chrome.storage.session` (mất khi đóng trình duyệt), giới hạn 250.000 ký tự
- **Không thu thập phân tích** — Không có tracking, analytics hay telemetry
- **Quyền được sử dụng rõ ràng** — `storage` lưu cài đặt và ô đích; `tabs`/`activeTab` chuyển tới ô đích; `webNavigation` xác định iframe; `contextMenus` tạo lệnh chuột phải. `host_permissions: <all_urls>` cho phép bắt Copy/Cut và tương tác với ô nhập liệu trên các trang được hỗ trợ.

---

## ❓ Câu Hỏi Thường Gặp

<details>
<summary><strong>Extension không hoạt động sau khi cài đặt?</strong></summary>

Nhấn **F5** để tải lại các tab đang mở. Content script chỉ được tiêm vào các trang được tải sau khi extension được cài đặt hoặc cập nhật.
</details>

<details>
<summary><strong>Trang hoặc ô nào không dùng được?</strong></summary>

Chrome không cho extension chạy trên các trang nội bộ như `chrome://`, Chrome Web Store và một số trang được trình duyệt bảo vệ. Với trang `file://`, hãy bật **Cho phép truy cập URL tệp** trong trang chi tiết của extension. QuickPaste cũng bỏ qua ô mật khẩu, ô bị vô hiệu hóa, chỉ đọc hoặc nằm trong Shadow DOM đóng.
</details>

<details>
<summary><strong>Ô đích hiển thị "Mất kết nối"?</strong></summary>

- Tab chứa ô đích có thể đã bị đóng hoặc tải lại. Nếu bật **Tự nối lại**, hãy mở lại trang đó — QuickPaste sẽ tự động kết nối lại.
- Nếu trang dùng SPA (Single Page Application), ô đích vẫn được nhận diện khi URL thay đổi nhưng document không tải lại.
</details>

<details>
<summary><strong>Sao chép nhưng không thấy dán?</strong></summary>

- Kiểm tra công tắc chính đã **Bật** (badge hiển thị "ON" màu xanh lá)
- Kiểm tra **Phạm vi nguồn** (nếu đặt "Cùng tab" mà bạn copy ở tab khác thì sẽ không dán)
- Kiểm tra **Chống gửi trùng** — nếu copy cùng nội dung liên tục, hệ thống sẽ bỏ qua trong khoảng thời gian cấu hình
- Kiểm tra badge: `"!"` (vàng) nghĩa là chưa chọn ô đích
</details>

<details>
<summary><strong>Có hỗ trợ iframe không?</strong></summary>

Có. Content script được tiêm vào **tất cả các frame** (`all_frames: true`), bao gồm cả iframe lồng nhau, `about:blank`, và iframe động. Service worker sử dụng `webNavigation.getAllFrames` để định vị chính xác frame chứa ô đích.
</details>

<details>
<summary><strong>Broadcast là gì?</strong></summary>

Chế độ **Broadcast** cho phép bạn gửi nội dung copy tới **nhiều ô đích cùng lúc**. Ví dụ: bạn có thể copy một đoạn văn bản và tự động dán vào cả ô chat Zalo, ô Google Dịch, và ô ghi chú — tất cả cùng một lúc.
</details>

<details>
<summary><strong>Hoàn tác có an toàn không?</strong></summary>

Có. Hệ thống kiểm tra xem nội dung ô đích có còn giống trạng thái sau khi dán hay không. Nếu bạn đã chỉnh sửa thủ công sau khi dán, hoàn tác sẽ **không thực hiện** để tránh mất dữ liệu người dùng đã nhập.
</details>

