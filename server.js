const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());

app.post("/send-dm", async (req, res) => {
  const influencers = req.body.influencers || [];

  if (!Array.isArray(influencers) || influencers.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No influencers provided",
    });
  }

  const results = [];
  let context;

  try {
    context = await chromium.launchPersistentContext("./ig-profile", {
      headless: false,
      viewport: null,
    });

    for (const influencer of influencers) {
      const username = influencer.instagram_username;
      const message = influencer.message;

      const page = await context.newPage();

      try {
        console.log(`Opening profile: ${username}`);

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

        console.log(`Opened chat: ${username}`);

        await page.waitForTimeout(5000);

        const textbox = page.getByRole("textbox", {
          name: "Message",
        });

        await textbox.waitFor({
          state: "visible",
          timeout: 15000,
        });

        await textbox.fill(message);

        await page.waitForTimeout(2000);

        await page.keyboard.press("Enter");

        console.log(`DM sent: ${username}`);

        results.push({
          username,
          success: true,
        });

        await page.waitForTimeout(8000);
      } catch (error) {
        console.error(`Failed for ${username}:`, error.message);

        results.push({
          username,
          success: false,
          error: error.message,
        });
      } finally {
        await page.close();
      }
    }

    return res.json({
      success: true,
      total: influencers.length,
      results,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    if (context) {
      await context.close();
    }
  }
});

app.listen(3005, () => {
  console.log("Server running on port 3005");
});
