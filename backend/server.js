const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib"); // Changed this line
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

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

app.listen(5000, () => console.log("✅ Backend running on port: 5000"));
