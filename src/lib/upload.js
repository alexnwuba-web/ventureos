'use strict';
/* File uploads: kept out of the web root, 20 MB, common office, image, text and zip formats. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const ALLOWED = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|webp|txt|zip)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(config.uploadsDir, 'tmp'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.uploadLimit, files: 1 },
  fileFilter: (req, file, cb) => cb(ALLOWED.test(file.originalname) ? null : Object.assign(new Error('Upload a PDF, Word, Excel, PowerPoint, image, text or zip file.'), { status: 400 }), ALLOWED.test(file.originalname)),
});

/** Moves an uploaded file into a folder under the uploads directory; returns its stored name. */
function keep(file, folder) {
  const dir = path.join(config.uploadsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(file.path, path.join(dir, file.filename));
  return file.filename;
}
const discard = (file) => { if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path); };

module.exports = { upload, keep, discard };
