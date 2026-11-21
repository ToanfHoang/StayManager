# StayManager – Phần mềm quản lý nhà trọ

Phần mềm cài trên máy tính Windows cho chủ trọ: khu trọ, phòng, người thuê, hợp đồng, điện nước, hóa đơn, thu tiền, thu chi, sửa chữa, báo cáo, gửi tiền phòng qua Zalo.

* Giao diện tiếng Việt · tiền VND · ngày DD/MM/YYYY · giờ Việt Nam.
* Chạy hoàn toàn trên máy, **không cần Internet** (trừ khi mở Zalo và đọc công tơ Hunonic).
* Công nghệ: Electron · React + Vite + TypeScript + Tailwind · Express + Prisma · **SQLite** (1 file dữ liệu).

---

## 1. Cài đặt và sử dụng

1. Chép file **`StayManager-Setup-1.0.0.exe`** (trong `desktop\release\`) sang máy cần cài, bấm đúp để cài.
   * Windows có thể hiện *"Windows protected your PC"* vì bộ cài chưa có chữ ký số → bấm **More info → Run anyway**.
2. Mở **StayManager** từ biểu tượng trên Desktop.
3. Lần đầu mở: màn hình **Thiết lập lần đầu** → nhập họ tên, email, mật khẩu để tạo tài khoản chủ trọ.

Dữ liệu nằm ở `%APPDATA%\StayManager` (gõ đường dẫn này vào thanh địa chỉ File Explorer):

| Thư mục / file | Nội dung |
|---|---|
| `data\staymanager.db` | Toàn bộ dữ liệu |
| `data\backups\` | Bản tự sao lưu hằng ngày (giữ 14 bản gần nhất) |
| `uploads\` | Ảnh phòng |
| `config.json` | Khóa bí mật riêng của máy này (đừng xóa) |
| `logs\app.log` | Nhật ký chạy app, dùng khi cần tìm lỗi |

Gỡ cài đặt **không xóa** dữ liệu. Cài lại hoặc cài bản mới vẫn dùng tiếp dữ liệu cũ.

### Sao lưu / chuyển sang máy khác
* **Cài đặt → Sao lưu dữ liệu → Tải bản sao lưu**: được 1 file `.zip` gồm dữ liệu và ảnh phòng. Nên làm mỗi tháng, cất file ra USB hoặc Google Drive.
* Sang máy mới: cài app → tạo tài khoản tạm → **Cài đặt → Sao lưu dữ liệu → Khôi phục** → chọn file `.zip`. App tự khởi động lại; đăng nhập bằng tài khoản có trong bản sao lưu.
* Sau khi khôi phục trên máy khác, vào **Cài đặt → Công tơ Hunonic** để kết nối lại, vì mật khẩu Hunonic được mã hóa bằng khóa riêng của từng máy.

### Phím tắt trong app
`F5` tải lại · `Ctrl +` / `Ctrl -` / `Ctrl 0` phóng to / thu nhỏ / về mặc định · `F12` công cụ tìm lỗi.

---

## 2. Quy trình hằng tháng
1. **Điện nước** → chọn kỳ → bấm **Lấy số từ công tơ** (nếu đã kết nối Hunonic) hoặc nhập số điện mới của từng phòng → *Lưu*.
2. **Hóa đơn → Lập hóa đơn tháng** → chọn khu trọ → nhập **tổng tiền nước của cả dãy** → xem trước tiền nước từng phòng → *Lập hóa đơn*.
   * Tiền phòng lấy theo hợp đồng.
   * Wifi, gửi xe… (dịch vụ cố định của khu trọ) được thêm tự động.
3. **Gửi tiền phòng (Zalo)** → bấm *Gửi* từng phòng:
   1. *Mở chat Zalo*;
   2. *Sao chép tin nhắn* rồi dán;
   3. *Sao chép ảnh hóa đơn (có mã QR)* rồi dán;
   4. gửi, rồi bấm *Đánh dấu đã gửi*.
4. Khi người thuê trả tiền: mở hóa đơn → **Thu tiền**.

Cách tính tiền nước đặt ở **Quản lý khu trọ → Sửa → Cách tính tiền nước**: *theo đồng hồ từng phòng* hoặc *chia tổng tiền nước theo đầu người* (tổng tiền ÷ tổng số người đang ở × số người của phòng).

App không dùng bot tự gửi từ tài khoản Zalo cá nhân, vì điều đó vi phạm điều khoản Zalo và có thể bị khóa tài khoản.

### Công tơ điện Hunonic ENTEC (không chính thức)
**Cài đặt → Công tơ Hunonic**: đăng nhập tài khoản Hunonic (nên dùng tài khoản phụ được chia sẻ nhà) → gán từng công tơ cho phòng.
* App chỉ **đọc** số kWh, không điều khiển thiết bị.
* Hunonic không có API chính thức. Tích hợp dựa trên dự án cộng đồng [vietnam-hunonic](https://github.com/home-assistant-plugins/vietnam-hunonic), nên có thể ngừng chạy khi Hunonic cập nhật app. Khi đó vẫn nhập số điện bằng tay.
* Hiện mới kiểm thử bằng máy chủ giả lập.

---

## 3. Dành cho người phát triển

### Chạy chế độ phát triển
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
```
Lệnh trên mở API (http://localhost:4100) và giao diện (http://localhost:5173). CSDL phát triển là `backend/prisma/data/staymanager.db`; nó tự tạo và tự cập nhật bảng khi API khởi động. Lần đầu mở sẽ hiện màn hình *Thiết lập lần đầu*.

Máy mới: cài Node.js 20+, rồi
```powershell
cd backend;  copy .env.example .env; npm install; npm run dev
cd frontend; npm install; npm run dev
```

### Đóng gói bản cài `.exe`
```powershell
cd desktop
npm install                       # lần đầu (Electron + electron-builder)
npm run dist                      # → desktop\release\StayManager-Setup-<phiên bản>.exe
```
* `npm run dist` build giao diện và máy chủ, gom vào `desktop/server/`, rồi tạo bộ cài NSIS.
* Chạy thử không cần cài: `npm run stage`, rồi `npm start`.
* Muốn chạy thử với thư mục dữ liệu riêng, đặt biến môi trường `STAYMANAGER_USER_DATA=<thư mục>`.

### Thay đổi CSDL
Sửa `backend/prisma/schema.prisma`, rồi tạo migration mới. App tự áp dụng migration chưa chạy khi khởi động (bảng `_app_migrations`), không cần Prisma CLI trên máy người dùng:
```powershell
cd backend
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > m.sql
# tạo thư mục prisma/migrations/000N_ten/ và chuyển m.sql thành migration.sql trong đó
npx prisma generate
```

### Kiểm thử
API phải đang chạy. Nên chạy với CSDL thử riêng (đặt `DATABASE_URL=file:<đường dẫn>/test.db`) rồi chạy `npm run db:seed` trước.
```powershell
cd backend
npm run typecheck
npm run test:e2e            # 32 bước nghiệp vụ qua API
npm run test:water-zalo     # 11 bước: tiền nước chia đầu người, tin nhắn Zalo + QR
npm run test:hunonic        # 13 bước: công tơ Hunonic (máy chủ giả lập, tự chạy backend phụ cổng 4198)
cd ..\frontend; npm run typecheck
```

### Cấu trúc thư mục
```
backend/    Express + Prisma (SQLite)
  prisma/   schema.prisma, migrations/, seed.ts
  src/      server.ts (khởi động, dùng chung cho dev và desktop), app.ts, lib/bootstrap.ts (migration),
            modules/ auth, users, properties, rooms, tenants, contracts, meters, invoices, payments,
                     finance, maintenance, dashboard, reports, audit, notifications, scheduler,
                     bank, hunonic, backup
frontend/   React + Vite
desktop/    Electron: main.js, scripts/stage.mjs, build/icon.ico
docs/ARCHITECTURE.md   kiến trúc, ERD, quy tắc nghiệp vụ
legacy/index.html      bản app 1 file trước đây (lưu trữ)
```

## 4. Hạn chế đã biết
* Bộ cài chưa có chữ ký số, nên Windows SmartScreen cảnh báo ở lần cài đầu.
* App chỉ chạy trên 1 máy. Muốn dùng trên máy khác thì chuyển bằng sao lưu / khôi phục; không đồng bộ nhiều máy cùng lúc.
* PDF tạo bằng chức năng **In → Lưu thành PDF**.
* Gửi Zalo là bán tự động: chủ trọ bấm gửi từng phòng.
* Thông báo trong app (công nợ, hợp đồng sắp hết hạn) chỉ chạy khi app đang mở.
