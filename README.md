# Weekend Warrior – Badminton Club Manager (WWCM)

Ứng dụng quản lý nội bộ cho câu lạc bộ cầu lông Weekend Warrior. Hai chức năng cốt lõi:

1. **Xếp cặp** đánh đôi cân bằng theo trình độ cho một buổi chơi.
2. **Tính tiền** sân và cầu cho từng người, kèm nội dung copy gửi Zalo.

Không dùng database. Toàn bộ dữ liệu là 3 file JSON trong thư mục `data/`.

## Tech stack

| Phần | Công nghệ |
| --- | --- |
| Giao diện | React 19, TypeScript (strict), Vite, Tailwind CSS 4, Lucide React, React Router |
| Server | Node.js + Express 5 (chạy bằng `tsx`), đọc/ghi file JSON |
| Test | Vitest |

Yêu cầu: **Node.js 20 trở lên** (đã kiểm tra với Node 24).

## Cách chạy

```bash
npm install          # chỉ cần lần đầu

npm run dev          # development – http://localhost:5173 (tự reload khi sửa code)

npm run build        # kiểm tra TypeScript + build production vào dist/
npm start            # production – http://localhost:5173 (cần build trước)

npm test             # unit test
npm run typecheck    # chỉ kiểm tra TypeScript
```

Một lệnh chạy cả giao diện lẫn API trên cùng một cổng. Biến môi trường tuỳ chọn:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `5173` | Cổng chạy ứng dụng |
| `HOST` | `localhost` | Đặt `0.0.0.0` để mở từ điện thoại trong cùng mạng Wi-Fi |
| `WWCM_DATA_DIR` | `./data` | Thư mục chứa file dữ liệu |

> Ứng dụng không có đăng nhập. Chỉ đặt `HOST=0.0.0.0` trong mạng bạn tin tưởng.

## Bản web tĩnh trên GitHub Pages (nhánh `static-web`)

Trang: https://viviu-96.github.io/weekend-warrior-club-manager/

GitHub Pages không chạy được server, nên bản này lưu dữ liệu trong **localStorage của trình duyệt** thay
cho `data/*.json`. Lần đầu mở trang, trình duyệt nạp dữ liệu từ thư mục `data/` của nhánh `static-web` tại
thời điểm deploy; trình duyệt đã có dữ liệu thì giữ nguyên dữ liệu của nó. Dữ liệu nằm riêng trên từng trình duyệt; dùng Cài đặt → Export / Import để sao lưu
hoặc chuyển sang máy khác.

| Nhánh | Dùng để |
| --- | --- |
| `dev` | Phát triển và chạy local với server + file JSON |
| `static-web` | Như `dev`, thêm chế độ localStorage và script đăng lên GitHub Pages |
| `gh-pages` | Chỉ chứa bản build, do `npm run deploy` tạo ra. Không sửa tay. |

```bash
git switch static-web
git merge dev            # lấy thay đổi mới từ dev (nếu có)
npm run dev:static       # chạy thử bản tĩnh tại http://localhost:5173/weekend-warrior-club-manager/
npm run deploy           # build + đăng lên nhánh gh-pages; trang cập nhật sau khoảng 1 phút
git push                 # lưu mã nguồn của nhánh static-web
```

Chế độ tĩnh được bật bằng `vite --mode static`, đọc `.env.static` (`VITE_STORAGE=local`). Nếu đổi tên
repository, sửa `PAGES_BASE` trong `vite.config.ts`.

## Cấu trúc project

```
server/
  index.ts            Express: API + phục vụ giao diện (Vite middleware khi dev, dist/ khi production)
  jsonStore.ts        Đọc/ghi file JSON an toàn (hàng đợi, ghi atomic, file .bak)
src/
  types/              Kiểu dữ liệu: Member, Session, SessionPlayer, Match, PaymentEntry, Settings
  services/           TOÀN BỘ business logic (không phụ thuộc React)
    pairingService.ts     getLevelScore, calculatePairStrength, calculateMatchBalance,
                          generateMatches, generatePairs, assignCourts, calculateBalanceScore
    paymentService.ts     calculateCourtShare, calculateShuttleShare, calculatePlayerPayment,
                          calculateSessionPayments, mergeGuestPayment, calculateOutstanding, reconcileSession
    roundingService.ts    roundPayment
    sessionService.ts     createSession, duplicateSession, saveSession, loadSession, thao tác người chơi
    exportService.ts      exportJSON, exportCSV, generateZaloPaymentText, generateZaloPairingText
    validationService.ts  Kiểm tra nghiệp vụ + đọc/chuẩn hoá dữ liệu JSON
    memberService.ts      Tìm kiếm, lọc, autocomplete thành viên
    api.ts                Gọi API
    __tests__/            Unit test
  features/           Component theo nghiệp vụ: members, pairing, payments, sessions
  pages/              Tổng quan, Xếp cặp, Tính tiền, Thành viên, Lịch sử, Chi tiết buổi, Cài đặt
  components/         Layout, ErrorBoundary, UI dùng chung
  hooks/              useAppData (state + tự lưu), useFeedback (thông báo, hộp xác nhận)
  utils/              Định dạng tiền/ngày, chuẩn hoá chữ, tải file, clipboard
  data/seed/          Dữ liệu mẫu, được copy vào data/ khi file chưa tồn tại
data/
  members.json  sessions.json  settings.json     ← dữ liệu thật của bạn
```

## Dữ liệu

### `data/settings.json`

```json
{
  "clubName": "Weekend Warrior Badminton Club",
  "levels": [{ "name": "New", "score": 1 }, { "name": "Y", "score": 2 }, "..."],
  "halfPlayCourtMode": "full",
  "defaultCourtCount": 2,
  "defaultTime": "08:00-10:00",
  "mergeGuestsByDefault": true
}
```

Trình độ chính thức: New 1 · Y 2 · Y+ 3 · TBY 4 · TB- 5 · TB 6 · TB+ 7 · TBK 8 · Khá 9 · Bán chuyên 10.
Điểm chỉ nằm ở đây; code luôn tra qua `getLevelScore(level, settings.levels)`.

### `data/members.json`

```json
{ "id": "member_001", "name": "Quang", "gender": "male", "level": "TBK", "note": "" }
```

### `data/sessions.json`

```json
{
  "id": "session_2026_09_26",
  "date": "2026-09-26", "dayOfWeek": "Thứ 7", "time": "08:00-10:00",
  "courtCount": 2, "courtCost": 280000, "shuttleCost": 189000,
  "players": [
    { "id": "player_001", "memberId": "member_001", "name": "Quang", "gender": "male",
      "level": "TBK", "playerType": "default", "resting": false },
    { "id": "player_guest_001", "memberId": null, "name": "Bạn Việt", "gender": "male",
      "level": "TB-", "playerType": "walk_in", "resting": false }
  ],
  "pairings": [
    { "id": "match_1", "matchNumber": 1, "court": 1,
      "teamA": ["player_001", "player_003"], "teamB": ["player_002", "player_005"] }
  ],
  "payments": [
    { "playerId": "player_001", "playFraction": 1, "payCourt": true, "payShuttle": true,
      "advancePayment": 0, "shuttleContribution": 0, "paidAmount": 0,
      "referrerPlayerId": null, "note": "" }
  ],
  "notes": "", "pairingLocked": false, "paymentLocked": false, "mergeGuests": true
}
```

- **Session Player** là bản chụp người chơi của riêng buổi đó: thành viên (`default`, có `memberId`) hoặc
  vãng lai (`walk_in`, `memberId = null`). Vãng lai không tự trở thành thành viên; bấm biểu tượng
  "thêm vào danh sách thành viên" nếu muốn.
- `resting`: nghỉ, không tham gia xếp cặp. `playFraction`: 1 / 0.5 / 0 (cả buổi / nửa buổi / không chơi).
- Lịch sử partner/đối thủ được suy ra từ `pairings` của các buổi trước, không cần lưu riêng.

### API

`GET/POST /api/members`, `PUT/DELETE /api/members/:id`, `GET/POST /api/sessions`,
`GET/PUT/DELETE /api/sessions/:id`, `GET/PUT /api/settings`, `GET/PUT /api/data` (toàn bộ dữ liệu).

### An toàn dữ liệu

- Mỗi lần ghi: ghi ra file tạm rồi đổi tên (atomic), bản trước đó được giữ lại ở `*.json.bak`.
- Nếu file JSON hỏng, ứng dụng báo *"Không thể đọc dữ liệu. Vui lòng kiểm tra file dữ liệu."* và
  **không ghi đè** lên file đó. Sửa file hoặc copy file `.bak` đè lên rồi bấm "Thử tải lại".
- File chưa tồn tại sẽ được tạo từ dữ liệu mẫu.

### Dữ liệu mẫu

`src/data/seed/` có 4 buổi mẫu (19, 20, 26, 27/09/2026) để mọi màn hình đều có dữ liệu: nhiều lượt đấu có
xoay vòng người chờ, tỉ số đúng luật, khách có người giới thiệu, người không chơi, chơi nửa buổi, tiền ứng,
đóng góp cầu, buổi đã thu đủ và buổi còn nợ. Các buổi mẫu có ghi chú "Dữ liệu mẫu"; xoá chúng ở trang
Lịch sử khi không cần nữa.

## Backup & restore

**Backup** – một trong hai cách:

- Copy cả thư mục `data/`.
- Vào **Cài đặt → Export toàn bộ dữ liệu** để tải file `wwcm_backup_YYYY-MM-DD.json`.

**Restore:**

- Chép đè thư mục `data/` rồi mở lại ứng dụng, hoặc
- **Cài đặt → Import dữ liệu**, chọn file backup. File được kiểm tra trước; nếu hợp lệ, ứng dụng hỏi xác
  nhận vì dữ liệu hiện tại sẽ bị thay thế hoàn toàn. File lỗi thì không có gì bị thay đổi.

Từng buổi chơi cũng xuất được ra JSON và CSV (mở bằng Excel) ở trang Tính tiền hoặc Lịch sử.

## Business rules

### Xếp cặp

- Điểm trình độ lấy từ cài đặt. `pairStrength = score(A) + score(B)`; độ lệch trận = `|teamA − teamB|`.
- Thứ tự ưu tiên: cân bằng trình độ → khả thi → giới tính. Không bắt buộc cặp nam–nữ.
- Vãng lai được xếp như mọi người khác; `playerType` không ảnh hưởng thuật toán.
- Mỗi người chỉ xuất hiện một lần. Số người không chia hết cho 4 → phần dư hiện ở
  "⚠ N người chưa được xếp", không ai bị bỏ. Admin tick **Nghỉ** để chọn người nghỉ, hoặc
  **Chỉnh sửa** để đổi chỗ hai người bất kỳ (kể cả người đang chờ).
- Trận được chia đều vào các sân theo thứ tự (4 trận / 2 sân → Sân 1: Trận 1–2, Sân 2: Trận 3–4).
- **Khoá kết quả**: không sửa danh sách, không xếp lại cho tới khi mở khoá (có xác nhận).

### Tính tiền

- **Tiền sân** chia đều cho người được tick "Tính sân". Người có tên trong danh sách nhưng không chơi
  vẫn chịu tiền sân.
- **Tiền cầu tự tính:** nhập *Giá 1 hộp cầu* và *Số quả cầu đã dùng* của buổi, ứng dụng tính
  `tiền cầu = giá hộp ÷ số quả trong hộp × số quả đã dùng` (mặc định 12 quả một hộp), làm tròn tới đồng và
  tính lại mỗi khi đổi một trong hai số. Ví dụ hộp 324.000 ₫, dùng 7 quả → 189.000 ₫.
  - Giá hộp mặc định và số quả trong hộp đặt ở Cài đặt (`shuttleBoxPrice`, `shuttlesPerBox` trong
    `settings.json`). Buổi mới tự lấy giá này; nếu chưa đặt thì lấy giá của buổi gần nhất. Mỗi buổi lưu giá
    riêng (`shuttleBoxPrice`, `shuttleCount` trong `sessions.json`) nên đổi giá sau này không làm sai buổi cũ.
  - Vẫn có thể gõ thẳng vào ô *Tiền cầu*; khi đó số quả được bỏ trống để tiền không bị tính đè.
- **Tiền cầu** chỉ chia cho người thực sự chơi. Không chơi → không tính cầu.
- **Nửa buổi**: trả 50% suất cầu chuẩn (suất chuẩn = tiền cầu / số người chịu cầu); phần còn lại chia
  đều cho người chơi cả buổi. Tiền sân mặc định vẫn đủ suất; đổi sang 50% ở Cài đặt (`halfPlayCourtMode`).
- **Đóng góp cầu**: "Tiền cầu" của buổi là tổng giá trị cầu đã dùng, **gồm cả cầu được đóng góp**.
  Người đóng góp được trừ đúng giá trị đó vào số phải đóng, nên tổng chi không đổi.
- **Làm tròn** (bắt buộc theo đúng thứ tự): tiền sân từng người → tiền cầu từng người → cộng → trừ đóng
  góp cầu → **làm tròn từng người lên bội số 500 ₫** → sau đó mới gộp khách. Không bao giờ làm tròn tổng
  rồi chia. Ví dụ: 62.100 → 62.500; 62.500 → 62.500; 62.600 → 63.000. Số đã chẵn 500 thì giữ nguyên.
- **Còn thiếu** = thành tiền − đã ứng − đã thu. Nếu âm thì hiển thị "Dư: x ₫".
- **Khách & người giới thiệu**: bật "Gộp khách vào người giới thiệu" → tiền của khách cộng vào dòng người
  giới thiệu, ghi chú "Bao gồm N bạn". Tắt → mỗi người một dòng.
- **Đối soát**: tổng chi, tổng phải thu, đã thu, còn thiếu, chênh lệch và *rounding adjustment* (chỉ hiện
  trong ứng dụng, không đưa vào nội dung Zalo).

### Nhiều lượt đấu trong một buổi

- Mỗi trận có `round` (lượt 1, 2, 3...). Bấm **Thêm lượt** để xếp thêm một lượt cho cùng danh sách người chơi;
  mỗi người vẫn chỉ xuất hiện một lần trong một lượt.
- **Xoay vòng người chờ:** ai đã chờ ở lượt trước thì lượt sau được ưu tiên vào sân (phạt 500 điểm cho mỗi lần
  đã chờ, lớn hơn mọi lợi ích cân bằng). Ví dụ 6 người, 3 lượt: mỗi người chờ đúng một lần.
- Partner và đối thủ của các lượt trước trong cùng buổi bị tránh lặp lại, nặng gấp 3 so với lịch sử buổi trước.
- **Xếp lại** và **Chỉnh sửa** chỉ tác động lên lượt đang chọn; xoá một lượt thì các lượt sau được đánh số lại.
- Dữ liệu cũ không có `round` được hiểu là lượt 1.

### Bảng thu gộp và công nợ (trang Tính tiền)

- **Bảng thu gộp:** chọn nhiều buổi (mặc định các buổi cùng tuần, ví dụ T7 + CN) để có một bảng mỗi người một
  dòng, mỗi buổi một cặp cột *Tiền sân / Tiền cầu*. Tiền từng buổi vẫn được tính và làm tròn riêng rồi mới
  cộng; phần dư ở buổi này bù cho phần thiếu ở buổi khác. Người được nhận diện xuyên buổi theo `memberId`,
  người vãng lai theo tên.
- **Công nợ:** cùng cách tính trên toàn bộ các buổi, người nợ nhiều nhất xếp trước. Nút *Thu đủ* đánh dấu đã
  đóng đủ ở mọi buổi chưa khoá thu tiền.

### Thống kê thành viên (trang Thành viên → Thống kê)

Số buổi tham gia (chỉ tính buổi có chơi), số trận, 3 partner ghép nhiều nhất, tổng tiền đã đóng (gồm tiền ứng),
còn nợ, số trận thắng – thua và tỉ lệ thắng. Tiền gồm cả phần của khách đi cùng: khách có người giới thiệu
được tính vào người giới thiệu, dù buổi đó có bật gộp khách hay không.

### Tỉ số trận đấu

- Mỗi trận có hai ô tỉ số cạnh chữ VS (`scoreA`, `scoreB` trong `sessions.json`). Đội thắng được gắn nhãn
  🏆 Thắng. Trận chưa nhập đủ hai ô thì chưa có kết quả.
- **Luật tính điểm** (`SCORE_RULES` trong `pairingService.ts`): mỗi trận 1 ván (BO1), 21 điểm; khi 20–20 thì
  đánh tiếp tới khi cách 2 điểm; tối đa 25 điểm (24–24 thì ai lên 25 trước là thắng). Tỉ số hợp lệ: 21–0 đến
  21–19, 22–20, 23–21, 24–22, 25–23, 25–24. Không có kết quả hoà.
- Tỉ số sai luật (ví dụ 21–20, 22–15, 26–24) hiện cảnh báo ngay dưới trận, không được tính thắng/thua và
  không đưa vào nội dung Copy.
- Tỉ số nhập được cả khi kết quả xếp cặp đã khoá, vì thường nhập sau khi đánh xong.
- Xếp lại một lượt đã có tỉ số sẽ xoá tỉ số của lượt đó (ứng dụng hỏi lại trước).
- Thắng – thua và tỉ lệ thắng ở trang Thành viên chỉ tính các trận đã ghi tỉ số.
- Trang Thành viên → Thống kê có **biểu đồ thắng / thua**: mỗi thành viên một thanh, thua mọc sang trái (đỏ),
  thắng mọc sang phải (xanh dương); xếp theo tỉ lệ thắng. Rê chuột hoặc chạm vào một dòng
  để xem số liệu chi tiết.

## Thuật toán xếp cặp

Cài đặt trong `src/services/pairingService.ts`, không random đơn thuần.

1. **Hàm chi phí** của một phương án (càng thấp càng tốt), tổng trên các trận:

   | Thành phần | Trọng số |
   | --- | --- |
   | (chênh strength hai team)² | 10 |
   | (chênh trình độ hai partner)² mỗi team | 1,5 |
   | Phương sai strength giữa các trận | 0,5 |
   | Hai team lệch số nữ | 3 mỗi người lệch |
   | Team cùng giới khi có thể ghép nam–nữ | 0,5 |
   | Lặp lại partner của các buổi trước | 4 mỗi lần |
   | Lặp lại đối thủ của các buổi trước | 1,5 mỗi lần |

   Lệch 1 điểm giữa hai team (10) luôn nặng hơn mọi yếu tố giới tính, nên giới tính chỉ dùng để chọn
   giữa các phương án cân bằng tương đương.

2. **Tìm kiếm**
   - Không gian nhỏ (tới 12 người, hoặc 8 người chơi + vài người dư): duyệt **toàn bộ** phương án, kể cả
     việc chọn ai ngồi chờ → kết quả tối ưu.
   - Lớn hơn: **local search** – 80 lần xuất phát ngẫu nhiên, mỗi lần leo đồi bằng phép đổi chỗ hai người
     tới khi không cải thiện được nữa. 17 người mất khoảng 15–20 ms.

3. **Xếp lại**: lần đầu lấy phương án tốt nhất. Mỗi lần bấm "Xếp lại" chọn ngẫu nhiên trong nhóm phương
   án gần tốt nhất (chi phí trong khoảng +25% hoặc +8 điểm) mà chưa hiển thị. Hết phương án mới thì quay
   vòng và báo cho admin.

4. **Balance Score** (0–100) = 100 − 12 × (lệch team trung bình) − 2 × (lệch partner trung bình) −
   (độ lệch chuẩn strength giữa các trận). Chỉ để admin tham khảo.

## Thuật toán tính tiền

Cài đặt trong `src/services/paymentService.ts` và `roundingService.ts`.

```
courtShare    = splitCost(courtCost,   hệ số sân từng người)     // 0, 0.5 hoặc 1
shuttleShare  = splitCost(shuttleCost, hệ số cầu từng người)     // = playFraction nếu được tính cầu
grossAmount   = courtShare + shuttleShare
netAmount     = grossAmount − shuttleContribution
roundedPayable = roundPayment(netAmount)                          // lên bội số 500 ₫
remaining     = roundedPayable − advancePayment − paidAmount      // < 0 → "Dư"
bảng thu      = mergeGuestPayment(...)                            // gộp khách SAU khi làm tròn
```

`splitCost`: suất chuẩn = tổng / số người chịu; người hệ số 0,5 trả nửa suất chuẩn; phần còn lại chia đều
cho người hệ số 1.

Ví dụ (có trong unit test): sân 280.000, cầu 189.000, 10 người – 1 người không chơi, 1 người nửa buổi.
Sân: 28.000/người. Cầu: 9 người chịu → suất chuẩn 21.000, nửa buổi 10.500, cả buổi
(189.000 − 10.500) / 8 = 22.312,5. Người chơi cả buổi: 50.312,5 → **50.500**. Tổng phải thu lệch tổng chi
+1.500 (rounding adjustment).

## Kiểm thử

`npm test` chạy 143 test cho: điểm 10 trình độ, pair strength, match balance, xếp cặp 4/8/12/16/18 người,
giới tính, vãng lai, xếp lại, lịch sử partner, chia sân, làm tròn, tiền sân/cầu, tự tính tiền cầu theo số quả, không chơi, nửa buổi,
ứng trước, đóng góp cầu, gộp 1 và 2 khách, không gộp, còn thiếu, đóng dư, đối soát, nhân bản buổi,
validation, import lỗi, nội dung Zalo, CSV, JSON, nhiều lượt đấu và xoay vòng người chờ, bảng thu gộp,
công nợ, thống kê thành viên, luật tính điểm, tỉ số và thắng/thua.

## Hướng phát triển

- Tự gợi ý điều chỉnh trình độ dựa trên kết quả thi đấu.
- Đăng nhập admin nếu mở ứng dụng ra ngoài mạng nội bộ.
