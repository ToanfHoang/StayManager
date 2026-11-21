import { Router } from 'express';
import multer from 'multer';
import { ah, badRequest, ok } from '../../lib/http';
import { authorize, me } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { backupInfo, canRestart, createBackupZip, requestRestart, stageRestore } from './backup.service';

export const backupRouter = Router();
backupRouter.use(authorize('LANDLORD', 'ADMIN'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024, files: 1 } });

backupRouter.get('/', ah(async (_req, res) => ok(res, backupInfo())));

/** Tải bản sao lưu (.zip) */
backupRouter.get(
  '/download',
  ah(async (req, res) => {
    const { buffer, fileName } = await createBackupZip();
    await audit(me(req), 'BACKUP', 'system', null, null, { fileName, size: buffer.length });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(buffer);
  }),
);

/** Khôi phục từ file sao lưu: dữ liệu hiện tại sẽ bị THAY THẾ (được giữ 1 bản dự phòng) */
backupRouter.post(
  '/restore',
  ah(async (req, res) => {
    await new Promise<void>((resolve, reject) => upload.single('file')(req, res, (e: unknown) => (e ? reject(e) : resolve())));
    if (!req.file) throw badRequest('Vui lòng chọn file sao lưu');
    stageRestore(req.file.buffer);
    await audit(me(req), 'RESTORE', 'system', null, null, { fileName: req.file.originalname });
    const restarting = canRestart();
    ok(res, { staged: true, restarting });
    if (restarting) setTimeout(requestRestart, 800);
  }),
);
