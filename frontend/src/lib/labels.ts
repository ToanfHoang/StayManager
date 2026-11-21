export type Tone = 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'indigo' | 'purple';

type LabelMap = Record<string, { label: string; tone: Tone }>;

export const ROLE: LabelMap = {
  ADMIN: { label: 'Quản trị viên', tone: 'purple' },
  LANDLORD: { label: 'Chủ trọ', tone: 'indigo' },
  STAFF: { label: 'Nhân viên', tone: 'blue' },
  TENANT: { label: 'Người thuê', tone: 'green' },
};

export const ROOM_STATUS: LabelMap = {
  AVAILABLE: { label: 'Còn trống', tone: 'green' },
  OCCUPIED: { label: 'Đang thuê', tone: 'indigo' },
  MAINTENANCE: { label: 'Bảo trì', tone: 'amber' },
};

export const CONTRACT_STATUS: LabelMap = {
  ACTIVE: { label: 'Hiệu lực', tone: 'green' },
  EXPIRED: { label: 'Hết hạn', tone: 'gray' },
  TERMINATED: { label: 'Đã chấm dứt', tone: 'red' },
};

export const INVOICE_STATUS: LabelMap = {
  UNPAID: { label: 'Chưa thanh toán', tone: 'amber' },
  PARTIALLY_PAID: { label: 'Thanh toán một phần', tone: 'blue' },
  PAID: { label: 'Đã thanh toán', tone: 'green' },
  OVERDUE: { label: 'Quá hạn', tone: 'red' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
};

export const PAYMENT_METHOD: LabelMap = {
  CASH: { label: 'Tiền mặt', tone: 'green' },
  BANK_TRANSFER: { label: 'Chuyển khoản', tone: 'blue' },
  OTHER: { label: 'Khác', tone: 'gray' },
};

export const ITEM_TYPE: Record<string, string> = {
  RENT: 'Tiền phòng',
  ELECTRICITY: 'Tiền điện',
  WATER: 'Tiền nước',
  INTERNET: 'Internet',
  PARKING: 'Gửi xe',
  CLEANING: 'Vệ sinh',
  OTHER: 'Khác',
};

export const SERVICE_TYPE: Record<string, string> = { INTERNET: 'Internet', PARKING: 'Gửi xe', CLEANING: 'Vệ sinh', OTHER: 'Khác' };
export const SERVICE_UNIT: Record<string, string> = { PER_ROOM: 'Theo phòng', PER_PERSON: 'Theo người' };

export const ENTRY_TYPE: LabelMap = {
  INCOME: { label: 'Thu', tone: 'green' },
  EXPENSE: { label: 'Chi', tone: 'red' },
};

export const PRIORITY: LabelMap = {
  LOW: { label: 'Thấp', tone: 'gray' },
  MEDIUM: { label: 'Trung bình', tone: 'blue' },
  HIGH: { label: 'Cao', tone: 'amber' },
  URGENT: { label: 'Khẩn cấp', tone: 'red' },
};

export const MAINTENANCE_STATUS: LabelMap = {
  PENDING: { label: 'Chờ xử lý', tone: 'amber' },
  IN_PROGRESS: { label: 'Đang xử lý', tone: 'blue' },
  COMPLETED: { label: 'Hoàn thành', tone: 'green' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
};

export const GENDER: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

export const AUDIT_ACTION: Record<string, string> = {
  CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa', CANCEL: 'Hủy', VOID: 'Hủy phiếu', RENEW: 'Gia hạn', TERMINATE: 'Kết thúc',
  GENERATE: 'Lập hóa đơn', VERIFY: 'Xác nhận chuyển khoản', REJECT: 'Từ chối chuyển khoản', SUBMIT: 'Gửi xác nhận CK', ANNOUNCE: 'Gửi thông báo', ROTATE_KEY: 'Tạo API key SePay', ASSIGN_BANK_TX: 'Gán giao dịch NH', AUTO_MATCH_BANK_TX: 'Tự khớp giao dịch NH', IGNORE_BANK_TX: 'Bỏ qua giao dịch NH', CREATE_PORTAL_ACCOUNT: 'Cấp tài khoản cổng', UPDATE_PORTAL_ACCOUNT: 'Cập nhật tài khoản cổng', UPDATE_ITEMS: 'Sửa khoản', ADD_TENANT: 'Thêm người thuê', REMOVE_TENANT: 'Rời phòng', CHANGE_PASSWORD: 'Đổi mật khẩu', SETUP: 'Thiết lập lần đầu', BACKUP: 'Sao lưu dữ liệu', RESTORE: 'Khôi phục dữ liệu',
};

export const SUBMISSION_STATUS: LabelMap = {
  PENDING_VERIFICATION: { label: 'Đang chờ xác nhận', tone: 'amber' },
  VERIFIED: { label: 'Đã xác nhận', tone: 'green' },
  REJECTED: { label: 'Bị từ chối', tone: 'red' },
};

export const NOTIFICATION_TYPE: LabelMap = {
  INVOICE_CREATED: { label: 'Hóa đơn mới', tone: 'indigo' },
  PAYMENT_REMINDER: { label: 'Nhắc thanh toán', tone: 'amber' },
  INVOICE_OVERDUE: { label: 'Quá hạn', tone: 'red' },
  PAYMENT_VERIFIED: { label: 'Thanh toán thành công', tone: 'green' },
  PAYMENT_REJECTED: { label: 'Thanh toán bị từ chối', tone: 'red' },
  PAYMENT_SUBMITTED: { label: 'Xác nhận chuyển khoản', tone: 'blue' },
  MAINTENANCE_REQUEST: { label: 'Yêu cầu sửa chữa', tone: 'purple' },
  MAINTENANCE_UPDATE: { label: 'Cập nhật sửa chữa', tone: 'purple' },
  UNPAID_SUMMARY: { label: 'Tổng hợp công nợ', tone: 'amber' },
  CONTRACT_EXPIRING: { label: 'Hợp đồng sắp hết hạn', tone: 'blue' },
  ANNOUNCEMENT: { label: 'Thông báo chung', tone: 'gray' },
  BANK_TX_UNMATCHED: { label: 'Giao dịch cần kiểm tra', tone: 'amber' },
  PAYMENT_AUTO_MATCHED: { label: 'Tự xác nhận qua ngân hàng', tone: 'green' },
};

export const BANK_TX_STATUS: LabelMap = {
  MATCHED: { label: 'Đã ghi nhận', tone: 'green' },
  UNMATCHED: { label: 'Chưa khớp', tone: 'amber' },
  NEEDS_REVIEW: { label: 'Cần kiểm tra', tone: 'red' },
  IGNORED: { label: 'Bỏ qua', tone: 'gray' },
};

export const SMS_STATUS: LabelMap = {
  QUEUED: { label: 'Chờ gửi', tone: 'gray' },
  SENDING: { label: 'Đang gửi', tone: 'blue' },
  SENT: { label: 'Đã gửi', tone: 'green' },
  TEST: { label: 'Thử nghiệm (không gửi thật)', tone: 'indigo' },
  FAILED: { label: 'Lỗi', tone: 'red' },
  SKIPPED: { label: 'Bỏ qua', tone: 'amber' },
};

export const TENANT_NOTIFICATION_TYPES = ['INVOICE_CREATED', 'PAYMENT_REMINDER', 'INVOICE_OVERDUE', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'MAINTENANCE_UPDATE', 'ANNOUNCEMENT'];
export const LANDLORD_NOTIFICATION_TYPES = ['UNPAID_SUMMARY', 'CONTRACT_EXPIRING'];

export const options = (map: LabelMap | Record<string, string>) =>
  Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));
