// Regenerates The Way's printable handout card (5x7 PDF + PNG) and the
// standalone QR code in this folder. Change URL_TEXT below if the app
// moves to a new address - a printed QR code can't be updated later.
// Not part of the app build, so its tools aren't project dependencies:
//   npm i --no-save qrcode playwright
//   node the-way-launch/make-card.mjs . the-way-launch
// It launches Chromium from /opt/pw-browsers/chromium (the cloud dev
// environment's copy); point executablePath elsewhere to run it locally.
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { chromium } from "playwright";

const [repo, out] = process.argv.slice(2);
const URL_TEXT = "the-way-delta-three.vercel.app";
const URL = `https://${URL_TEXT}/the-way`;
const NAVY = "#16283f";
const ORANGE = "#e07b35";
const CREAM = "#f4ecdd";

const img = (f) => "data:image/png;base64," + fs.readFileSync(path.join(repo, "public/the-way", f)).toString("base64");
const MARK = img("legacy-church-mark.png");
const LOGO = img("legacy-church-logo-light.png");

(async () => {
  // Highest error correction so the cross in the middle can cover modules
  // and the code still scans.
  const qrSvg = await QRCode.toString(URL, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 0,
    color: { dark: NAVY, light: "#ffffff" },
  });

  const qrBlock = (size) => `
    <div style="position:relative;width:${size}px;height:${size}px">
      <div style="width:100%;height:100%">${qrSvg.replace("<svg", '<svg width="100%" height="100%"')}</div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${size * 0.22}px;height:${size * 0.22}px;background:#fff;border-radius:${size * 0.03}px;display:flex;align-items:center;justify-content:center">
        <img src="${MARK}" style="height:78%;width:auto">
      </div>
    </div>`;

  const hills = `
    <svg viewBox="0 0 480 90" preserveAspectRatio="none" style="position:absolute;left:0;bottom:-1px;width:100%;height:90px">
      <path d="M0,40 L40,22 L72,34 L110,10 L150,32 L190,20 L240,38 L290,16 L330,30 L372,8 L420,28 L480,14 L480,90 L0,90 Z" fill="#2f5578" opacity="0.55"/>
      <path d="M0,62 Q80,40 170,52 Q260,64 330,46 Q410,30 480,44 L480,90 L0,90 Z" fill="#22406a"/>
      <path d="M0,90 L0,78 Q120,64 240,74 Q360,84 480,70 L480,90 Z" fill="${CREAM}"/>
    </svg>`;

  const card = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:480px;height:672px;background:${CREAM};font-family:Inter,"DejaVu Sans",sans-serif;color:${NAVY};overflow:hidden}
    .band{position:relative;height:214px;background:${NAVY};text-align:center;padding-top:34px}
    .title{font-family:"Inter Display",Inter,sans-serif;font-weight:900;font-size:68px;letter-spacing:.04em;color:${CREAM};line-height:1}
    .pill{position:relative;z-index:1;display:inline-block;margin-top:14px;background:${ORANGE};color:#fff;font-weight:800;font-size:13px;letter-spacing:.06em;padding:6px 14px;border-radius:4px}
    .body{text-align:center;padding:2px 34px 0}
    h2{font-weight:900;font-size:21px;letter-spacing:.01em;text-transform:uppercase}
    .sub{font-size:13px;color:#5c7186;margin-top:4px}
    .qr{display:inline-block;margin-top:14px;background:#fff;padding:14px;border-radius:14px;box-shadow:0 10px 24px -14px rgba(22,40,63,.45);border:1px solid #ddcda8}
    .url{margin-top:10px;font-weight:700;font-size:13px;color:${NAVY}}
    .steps{display:flex;gap:10px;margin-top:14px;text-align:left}
    .step{flex:1;background:#fff;border:1px solid #ddcda8;border-radius:10px;padding:8px 10px}
    .step b{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${ORANGE};margin-bottom:2px}
    .step p{font-size:11px;line-height:1.35}
    .logo{position:absolute;left:0;right:0;bottom:18px;text-align:center}
    .logo img{height:50px}
  </style></head><body>
    <div class="band">
      <div class="title">THE WAY</div>
      <div class="pill">&ldquo;COME AND FOLLOW ME&rdquo; &ndash; JESUS</div>
      ${hills}
    </div>
    <div class="body">
      <h2>Start your journey</h2>
      <p class="sub">Point your phone&rsquo;s camera at the code</p>
      <div class="qr">${qrBlock(176)}</div>
      <p class="url">${URL_TEXT}</p>
      <div class="steps">
        <div class="step"><b>iPhone</b><p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p></div>
        <div class="step"><b>Android</b><p>In Chrome, tap <strong>&#8942;</strong>, then <strong>Add to Home screen</strong>.</p></div>
      </div>
    </div>
    <div class="logo"><img src="${LOGO}"></div>
  </body></html>`;

  const qrOnly = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}body{width:400px;height:400px;background:#fff;display:flex;align-items:center;justify-content:center}
  </style></head><body>${qrBlock(340)}</body></html>`;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 480, height: 672 }, deviceScaleFactor: 3.125 });
  await page.setContent(card, { waitUntil: "load" });
  await page.screenshot({ path: path.join(out, "the-way-card-5x7.png") });
  await page.pdf({ path: path.join(out, "the-way-card-5x7.pdf"), width: "5in", height: "7in", printBackground: true, pageRanges: "1" });
  const qp = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 5 });
  await qp.setContent(qrOnly, { waitUntil: "load" });
  await qp.screenshot({ path: path.join(out, "the-way-qr-code.png") });
  await browser.close();
  console.log("encoded:", URL);
})();
