import express from 'express';
import cors from 'cors';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.post("/merge", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length < 2) {
    return res.status(400).send("Upload at least 2 PDFs");
  }

  try {
    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const pdfBytes = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    const outputPath = path.join("uploads", `merged_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, mergedPdfBytes);

    res.download(outputPath, "merged.pdf", (err) => {
      if (!err) {
        // ✅ Delete files safely after sending
        setTimeout(() => {
          req.files.forEach(file => fs.unlinkSync(file.path));
          fs.unlinkSync(outputPath);
        }, 5000); // 5 second delay
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error merging PDFs");
  }
});

app.post("/api/split-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const pagesInput = req.body.pages; // e.g. "1,3,5"
    const pages = pagesInput.split(",").map(p => parseInt(p.trim()));

    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(pdfDoc, pages.map(p => p - 1));
    copiedPages.forEach(p => newPdf.addPage(p));

    const outputBytes = await newPdf.save();
    const outputPath = path.join("uploads", `split_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, outputBytes);

    res.download(outputPath, "split.pdf", (err) => {
      if (!err) {
        // Clean up files after sending
        setTimeout(() => {
          fs.unlinkSync(pdfPath);
          fs.unlinkSync(outputPath);
        }, 5000);
      }
    });
  } catch (error) {
    console.error("Split Error:", error);
    res.status(500).send({ message: "Failed to split PDF" });
  }
});
// 📦 Compress PDF route
app.post("/api/compress-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const quality = req.body.quality || "screen";
    const outputPath = path.join("uploads", `compressed_${Date.now()}.pdf`);

    const qualityMap = {
      screen: "/screen",
      ebook: "/ebook",
      printer: "/printer"
    };
    const gsSetting = qualityMap[quality] || "/screen";

    // ✅ use explicit Ghostscript path on Windows
    const command = `"C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe" -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${gsSetting} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    console.log("Running command:", command);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Ghostscript Error:", error);
        console.error("STDERR:", stderr);
        return res.status(500).send({ message: "Compression failed" });
      }

      console.log("Ghostscript STDOUT:", stdout);
      console.log("Compression completed successfully ✅");

      res.download(outputPath, "compressed.pdf", (err) => {
        if (!err) {
          // cleanup uploaded + output files after sending
          setTimeout(() => {
            try { fs.unlinkSync(inputPath); } catch (e) { /* ignore */ }
            try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
          }, 5000);
        }
      });
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.listen(5000, () => console.log("✅ Backend running on port: 5000"));
