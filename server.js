const express = require("express");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const app = express();

app.use(express.json());

app.post("/send-dm", async (req, res) => {
  const influencers = req.body.influencers || [];

  if (!Array.isArray(influencers) || influencers.length === 0) {
    return res.status(400).json({
      message: "No influencers provided",
    });
  }

  const results = [];
  const MAX_RETRIES = 3;

  let context;

  try {
    context = await chromium.launchPersistentContext("./ig-profile", {
      headless: false,
      viewport: null,
      proxy: {
        server: "http://185.217.50.69:12323",
        username: "14a5b304e0a2e",
        password: "7b841af743",
      },
    });

    for (const influencer of influencers) {
      const username = influencer.instagram_username;
      const message = influencer.message;

      let success = false;
      let lastError = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const page = await context.newPage();

        try {
          console.log(`[${username}] Attempt ${attempt}/${MAX_RETRIES}`);

          await page.goto(`https://www.instagram.com/${username}/`, {
            waitUntil: "domcontentloaded",
            timeout: 40000,
          });

          await page.waitForTimeout(10000);

          const messageButton = page.getByRole("button", {
            name: "Message",
            exact: true,
          });

          await messageButton.waitFor({
            state: "visible",
            timeout: 15000,
          });

          await messageButton.click();

          console.log(`[${username}] Opened chat`);

          await page.waitForTimeout(5000);

          const textbox = page.locator('[contenteditable="true"]').last();

          await textbox.waitFor({
            state: "visible",
            timeout: 15000,
          });

          await textbox.fill(message);

          await page.waitForTimeout(2000);

          const sendButton = page.getByRole("button", {
            name: "Send",
          });

          await sendButton.waitFor({
            state: "visible",
            timeout: 5000,
          });

          await sendButton.click();

          await page.waitForTimeout(3000);

          console.log(
            `[${username}] DM sent successfully on attempt ${attempt}`,
          );

          results.push({
            username,
            success: true,
            attempts: attempt,
            message: "DM sent successfully",
          });

          success = true;
          break;
        } catch (error) {
          lastError = error;

          console.error(
            `[${username}] Attempt ${attempt} failed: ${error.message}`,
          );

          if (attempt < MAX_RETRIES) {
            console.log(`[${username}] Retrying in 5 seconds...`);

            await page.waitForTimeout(5000);
          }
        } finally {
          await page.close();
        }
      }

      if (!success) {
        results.push({
          username,
          success: false,
          attempts: MAX_RETRIES,
          message: lastError?.message || "Unknown error",
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    return res.json({
      total: influencers.length,
      results,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  } finally {
    if (context) {
      await context.close();
    }
  }
});

app.post("/generate-pdf", async (req, res) => {
  let browser;

  try {
    const reports = req.body.reports;

    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No HTML reports received",
      });
    }

    browser = await chromium.launch({
      headless: true,
    });

    const mergedPdf = await PDFDocument.create();

    const page = await browser.newPage();

    await page.emulateMedia({
      media: "screen",
    });

    for (const html of reports) {

      await page.setContent(html, {
        waitUntil: "load",
      });

      // Wait for fonts
      await page.evaluate(() => document.fonts.ready);

      // Wait for images
      await page.evaluate(async () => {
        const images = Array.from(document.images);

        await Promise.all(
          images.map(img => {
            if (img.complete) return Promise.resolve();

            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          })
        );
      });

      // Wait for Chart.js if present
      try {
        await page.waitForFunction(
          () => typeof window.Chart !== "undefined",
          { timeout: 5000 }
        );
      } catch (e) {
        // Ignore if Chart.js isn't used
      }

      // Wait for animations
      await page.waitForTimeout(2000);

      const pdfBuffer = await page.pdf({
        width: "1520px",
        printBackground: true,
        preferCSSPageSize: true,
        tagged: false,
        outline: false,
        margin: {
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
      });

      const pdfDoc = await PDFDocument.load(pdfBuffer);

      const copiedPages = await mergedPdf.copyPages(
        pdfDoc,
        pdfDoc.getPageIndices()
      );

      copiedPages.forEach(p => mergedPdf.addPage(p));
    }

    await page.close();
    await browser.close();

    const finalPdf = await mergedPdf.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="InfluencerReport.pdf"'
    );

    return res.send(Buffer.from(finalPdf));

  } catch (err) {

    if (browser) {
      await browser.close();
    }

    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

app.listen(3005, "0.0.0.0", () => {
  console.log("Server running on port 3005");
});
