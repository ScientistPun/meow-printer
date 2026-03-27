const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs/promises');
const ipp = require('ipp');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// 打印接口
app.post('/print', upload.single('pdf'), async (req, res) => {
  try {
    const {
      width, height,
      landscape,
      scale,
      pageRange,
      pagesPerSheet,
      rotate
    } = req.body;

    // 读取上传的PDF
    const pdfData = await fs.readFile(req.file.path);
    const srcDoc = await PDFDocument.load(pdfData);
    const totalPages = srcDoc.getPageCount();
    const pageIndices = parsePageRange(pageRange || '', totalPages);

    // 毫米转PDF单位
    const targetWidth = mm2pt(width);
    const targetHeight = mm2pt(height);

    // 多页排版
    const layout = getGridLayout(Number(pagesPerSheet) || 1);
    const newDoc = await PDFDocument.create();

    let currentPage;
    let pos = 0;

    for (const i of pageIndices) {
      if (pos === 0) {
        currentPage = newDoc.addPage([targetWidth, targetHeight]);
        if (landscape === 'true') {
          currentPage.setRotation(90);
        }
      }

      const [page] = await newDoc.copyPages(srcDoc, [i]);
      const cellW = targetWidth / layout.cols;
      const cellH = targetHeight / layout.rows;

      const x = (pos % layout.cols) * cellW;
      const y = Math.floor(pos / layout.cols) * cellH;

      currentPage.drawPage(page, {
        x: x,
        y: y,
        width: cellW * Number(scale),
        height: cellH * Number(scale),
      });

      pos++;
      if (pos >= layout.rows * layout.cols) pos = 0;
    }

    // 旋转
    if (rotate && rotate != 0) {
      newDoc.getPages().forEach(p => p.setRotation(Number(rotate)));
    }

    const finalPdf = await newDoc.save();

    // ======================
    // 发送到 CUPS 打印机
    // 把下面地址改成你的打印机地址
    // ======================
    const printer = ipp.Printer('http://192.168.1.100:631/printers/your-printer');
    printer.execute('Print-Job', {
      'operation-attributes-tag': {
        'requesting-user-name': 'remote',
        'document-format': 'application/pdf',
      },
    }, finalPdf, (err) => {
      if (err) {
        res.json({ status: 'error', msg: err.message });
      } else {
        res.json({ status: 'success', msg: '✅ 打印任务已发送' });
      }
    });

  } catch (err) {
    console.error(err);
    res.json({ status: 'error', msg: err.message });
  }
});

// 工具函数
function mm2pt(mm) {
  return Number(mm) * 2.83465;
}

function parsePageRange(range, max) {
  const pages = [];
  if (!range) return Array.from({ length: max }, (_, i) => i);
  for (const p of range.split(',')) {
    if (p.includes('-')) {
      const [s, e] = p.split('-').map(Number);
      for (let i = s - 1; i <= e - 1; i++) pages.push(i);
    } else {
      pages.push(Number(p) - 1);
    }
  }
  return pages.filter(i => i >= 0 && i < max);
}

function getGridLayout(n) {
  switch (n) {
    case 2: return { rows: 1, cols: 2 };
    case 4: return { rows: 2, cols: 2 };
    case 6: return { rows: 2, cols: 3 };
    case 9: return { rows: 3, cols: 3 };
    default: return { rows: 1, cols: 1 };
  }
}

// 前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'print.html'));
});

// 启动
app.listen(3000, () => {
  console.log('✅ 服务已启动：http://localhost:3000');
});