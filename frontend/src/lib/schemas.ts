import { z } from 'zod';

// Kiểm tra phía client (server vẫn kiểm tra lại toàn bộ)
const req = (msg = 'Trường này là bắt buộc') => z.string().trim().min(1, msg);
const money = z.coerce.number({ invalid_type_error: 'Số tiền không hợp lệ' }).min(0, 'Số tiền không được âm');
const phone = z.string().trim().regex(/^[0-9+().\s-]{8,20}$/, 'Số điện thoại không hợp lệ');
const optPhone = z.union([z.literal(''), phone]);

export const propertySchema = z.object({
  name: req('Vui lòng nhập tên khu trọ'),
  address: req('Vui lòng nhập địa chỉ'),
  floors: z.coerce.number().int().min(1, 'Ít nhất 1 tầng'),
  contactPhone: optPhone,
  electricityPrice: money,
  waterPrice: money,
});

export const roomSchema = z.object({
  propertyId: z.coerce.number().min(1, 'Vui lòng chọn khu trọ'),
  roomNumber: req('Vui lòng nhập số phòng'),
  floor: z.coerce.number().int().min(0, 'Tầng không hợp lệ'),
  price: money.refine((v) => v > 0, 'Vui lòng nhập giá thuê'),
  maxOccupancy: z.coerce.number().int().min(1, 'Ít nhất 1 người'),
});

export const tenantSchema = z.object({
  fullName: req('Vui lòng nhập họ tên'),
  phone,
  email: z.union([z.literal(''), z.string().email('Email không hợp lệ')]),
  idNumber: z.union([z.literal(''), z.string().regex(/^[0-9A-Za-z*]{6,20}$/, 'Số CCCD không hợp lệ')]),
});

export const contractSchema = z
  .object({
    roomId: z.coerce.number().min(1, 'Vui lòng chọn phòng'),
    tenantIds: z.array(z.number()).min(1, 'Chọn ít nhất 1 người thuê'),
    startDate: req('Chọn ngày bắt đầu'),
    endDate: req('Chọn ngày kết thúc'),
    rentPrice: money.refine((v) => v > 0, 'Vui lòng nhập giá thuê'),
    deposit: money,
    paymentDueDay: z.coerce.number().int().min(1, 'Từ 1 đến 28').max(28, 'Từ 1 đến 28'),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] });

export const paymentSchema = z
  .object({
    amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
    method: req(),
    paymentDate: req('Chọn ngày thanh toán'),
    reference: z.string(),
  })
  .refine((v) => v.method !== 'BANK_TRANSFER' || v.reference.trim().length > 0, { message: 'Nhập mã giao dịch / nội dung chuyển khoản', path: ['reference'] });

export const expenseSchema = z.object({
  propertyId: z.coerce.number().min(1, 'Chọn khu trọ'),
  categoryId: z.coerce.number().min(1, 'Chọn danh mục'),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
  entryDate: req('Chọn ngày'),
  description: req('Nhập nội dung'),
});

export const maintenanceSchema = z.object({
  roomId: z.coerce.number().min(1, 'Chọn phòng'),
  title: req('Nhập tiêu đề'),
  requestDate: req('Chọn ngày yêu cầu'),
});

export const userSchema = z.object({
  fullName: req('Nhập họ tên'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});
