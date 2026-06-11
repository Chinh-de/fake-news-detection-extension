# Fake News Detection Chrome Extension

Mã nguồn Tiện ích mở rộng trình duyệt (Chrome Extension) thuộc hệ thống kiểm chứng tin giả **Fake News Detection**, cho phép nhận diện tin giả trực tiếp khi đang lướt mạng xã hội Facebook.

---

## 🎨 Tính năng chính
- **Chèn nút kiểm duyệt trực tiếp**: Tự động chèn nút `🔍 Kiểm tra tin` vào đầu mỗi bài đăng (post) trên bảng tin Facebook.
- **Dự đoán văn phong nhanh**: Chạy mô hình PhoBERT (SLM) và XGBoost để đánh giá tính chân thực của văn phong bài đăng (độ tự tin, nhãn cảnh báo).
- **Phân tích chéo RAG**: Nút đối chiếu báo chí trực tuyến tích hợp ngay dưới bài đăng Facebook, mở rộng khung hiển thị thông tin thực tế từ Wikipedia và báo chí đối chứng.
- **Cấu hình địa chỉ máy chủ**: Popup tiện ích cho phép lưu cấu hình linh hoạt địa chỉ URL API của Backend (Local hoặc Hugging Face Production).

---

## 🛠️ Cấu trúc thư mục tiện ích
- `manifest.json`: File khai báo cấu hình, quyền hạn và metadata của Chrome Extension (Manifest V3).
- `popup.html` & `popup.js` & `popup.css`: Giao diện cài đặt và kiểm nhanh tin tức thủ công khi người dùng click vào icon Extension trên thanh công cụ.
- `content.js` & `styles.css`: Script chạy ngầm trên tab Facebook để quét các bài đăng và chèn giao diện kiểm duyệt.
- `background.js`: Xử lý giao tiếp API bất đồng bộ và chuyển tiếp yêu cầu (CORS bypass).

---

## 🚀 Hướng dẫn cài đặt lên trình duyệt Chrome (Developer Mode)

### Bước 1: Mở trình quản lý tiện ích của Chrome
Mở trình duyệt Google Chrome và truy cập vào đường dẫn sau:
```
chrome://extensions/
```

### Bước 2: Bật chế độ dành cho nhà phát triển (Developer Mode)
Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải màn hình.

### Bước 3: Tải tiện ích đã giải nén
1. Click vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
2. Chọn thư mục `Extension/` nằm trong thư mục dự án của bạn trên máy tính.

---

## 💡 Hướng dẫn sử dụng

### 1. Cấu hình máy chủ kết nối API
1. Click vào biểu tượng của tiện ích Fake News Detection trên thanh công cụ Chrome để mở Popup.
2. Bấm vào nút bánh răng **Cài đặt (⚙️)** ở góc trên.
3. Chọn môi trường mong muốn:
   - **Hugging Face Cloud (Production)**: Sử dụng API đám mây đã dựng sẵn.
   - **Localhost (Máy cá nhân)**: Kết nối với Backend đang chạy ở cổng `http://localhost:8000` trên máy bạn.
4. Bấm **Lưu cấu hình**. Trạng thái sẽ đổi sang màu xanh lá **Trực tuyến (Online)** nếu kết nối thành công.

### 2. Kiểm chứng tin tức trên Facebook
1. Truy cập vào trang `https://www.facebook.com`.
2. Trên mỗi bài đăng, bạn sẽ thấy nút `🔍 Kiểm tra tin` xuất hiện ở góc trên.
3. Click vào nút này, hệ thống sẽ tự động quét văn bản, gửi lên máy chủ và hiển thị kết quả phân tích nhanh của SLM & XGBoost trực tiếp trong bài đăng.
4. Bạn có thể bấm tiếp vào liên kết `Tìm kiếm & đối chiếu thực tế` để hiển thị các bằng chứng xác thực từ báo chí hoặc định nghĩa Wikipedia liên quan ngay bên dưới bài đăng đó.
