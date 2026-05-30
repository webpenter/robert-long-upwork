const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Upload = require('../models/Upload');
const { authenticate } = require('../middleware/auth');
const { parseUploadedFile } = require('../services/csvParser');

const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/uploads
router.post('/', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.body.experimentId) return res.status(400).json({ error: 'experimentId is required' });

  try {
    const record = await Upload.create({
      experiment: req.body.experimentId,
      uploadedBy: req.user._id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      parseStatus: 'processing',
    });

    res.status(201).json({ upload: record });

    // Parse in background — don't block the response
    parseUploadedFile(req.file.path, req.body.experimentId)
      .then(async (result) => {
        await Upload.findByIdAndUpdate(record._id, {
          parseStatus: 'completed',
          parsedRows: result.count,
        });
        console.log(`[upload] Parsed ${result.count} rows (${result.type}) from ${req.file.originalname}`);
      })
      .catch(async (err) => {
        await Upload.findByIdAndUpdate(record._id, {
          parseStatus: 'failed',
          parseErrors: [err.message],
        });
        console.error('[upload] Parse error:', err.message);
      });
  } catch (err) {
    next(err);
  }
});

// GET /api/uploads/:id
router.get('/:id', async (req, res, next) => {
  try {
    const record = await Upload.findById(req.params.id).populate('experiment', 'name');
    if (!record) return res.status(404).json({ error: 'Upload not found' });
    res.json({ upload: record });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
