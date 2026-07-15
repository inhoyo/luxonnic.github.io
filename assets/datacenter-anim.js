/**
 * datacenter-anim.js — Chapter 01 scroll scene (v5)
 *
 * 7 scenes driven by scroll within #scene-gpu:
 *   0  — small GPU cluster, electrons flowing
 *   1  — grid expands to full datacenter scale
 *   2  — transceiver chips appear; clean photon travels between them
 *   3  — photon splits into 3 coloured copies: chromatic dispersion
 *   4  — camera zooms into XCVR; distorted signal arrives; DSP cost revealed
 *   5  — hold on zoomed XCVR; the pivot question (optical-domain correction)
 *   6  — the zoomed chip morphs: XCVR/DSP/20W/electrical-out
 *        → LUXONNICORE/<1W/optical-out
 */

(function () {
  "use strict";

  const canvas  = document.getElementById("dc-canvas");
  const wrapper = document.getElementById("scene-gpu");
  if (!canvas || !wrapper) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  let DPR = 1;

  /* ─── palette ──────────────────────────────────────────────── */
  const C = {
    gridLine:   "rgba(72, 95, 150, 0.22)",
    eDim:       "rgba(90, 148, 255, 0.28)",
    chipBg:     "#0d0d1f",
    chipBorder: "rgba(62, 82, 140, 0.45)",
    xcvrBg:     "#0b1420",
    xcvrBrd:    "#c8f5ff",
    phGlow:     "#c8f5ff",
    power:      "#ff6b35",
  };

  /* ─── grid ─────────────────────────────────────────────────── */
  const COLS = 7, ROWS = 6;
  const IC0 = 2, IC1 = 4, IR0 = 2, IR1 = 4; // inner 3×3 visible in scene 0

  const XCVR_A = [3, 4]; // sender
  const XCVR_B = [5, 1]; // receiver / zoom target

  /* ─── layout ───────────────────────────────────────────────── */
  let TW, TH, OX, OY;

  function cssW() { return canvas.offsetWidth;  }
  function cssH() { return canvas.offsetHeight; }

  function computeLayout() {
    const w = cssW(), h = cssH();
    TW = (w * 0.82) / 5.5;
    TH = TW * 0.36;
    OX = w / 2 - TW / 4;
    // Portrait mobile: raise grid so chips sit above the bottom gradient zone
    OY = h * (w < h ? 0.62 : 0.82);
  }

  function gxy(c, r) {
    return { x: OX + (c - r) * TW * 0.5, y: OY - (c + r) * TH * 0.5 };
  }

  /* ─── scene state ───────────────────────────────────────────── */
  let scene = 0, sceneP = 0.0;
  const N = 7;
  const FINAL_ZOOM = 5.5;

  function easeIO(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

  /* ─── colour lerp helpers (for the scene 6 XCVR → LUXONNICore morph) ── */
  function lerpRGB(c1, c2, t) {
    return [
      c1[0] + (c2[0] - c1[0]) * t,
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t,
    ];
  }
  function rgbStr(c, a) {
    return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a === undefined ? 1 : a})`;
  }
  const ELECTRICAL_RGB = [122, 182, 255]; // #7ab6ff
  const PHOTON_RGB     = [200, 245, 255]; // #c8f5ff

  /* scene 6 morph progress: 0 = XCVR/DSP/20W, 1 = LUXONNICORE/<1W */
  function coreT() {
    if (scene < 6) return 0;
    return easeIO(Math.min(1, sceneP));
  }

  /* ─── camera ───────────────────────────────────────────────── */
  function getZoomTarget() {
    const p = gxy(XCVR_B[0], XCVR_B[1]);
    return { x: p.x, y: p.y + TH * 0.70 };
  }

  function cameraZoomT() {
    if (scene < 4) return 0;
    if (scene === 4) return easeIO(Math.min(1, sceneP));
    return 1; // scene 5: hold at full zoom
  }

  /* ─── visibility helpers ────────────────────────────────────── */
  function chipAlpha(c, r) {
    const inner = c >= IC0 && c <= IC1 && r >= IR0 && r <= IR1;
    if (inner) return 1.0;
    if (scene === 0) return 0.0;
    if (scene >= 2) return 1.0;
    const d = Math.max(IC0 - c, c - IC1, 0) + Math.max(IR0 - r, r - IR1, 0);
    return Math.max(0, Math.min(1, (sceneP - d * 0.09) / 0.28));
  }

  function edgeAlpha(c1, r1, c2, r2) {
    return Math.min(chipAlpha(c1, r1), chipAlpha(c2, r2));
  }

  function photonBaseOpacity() {
    if (scene >= 3) return 1.0;
    if (scene === 2) return Math.min(1.0, sceneP * 2.5);
    return 0.0;
  }

  function photonOpacity() {
    const base = photonBaseOpacity();
    if (scene < 4) return base;
    if (scene === 4) return base * Math.max(0, 1 - sceneP * 2.8); // fade out as we zoom in
    return 0; // scene 5: photon stays gone, we're zoomed past it
  }

  function gridFade() {
    if (scene < 4) return 1.0;
    if (scene === 4) return Math.max(0, 1 - sceneP * 3.0);
    return 0; // scene 5: grid stays hidden
  }

  function detailAlpha() {
    if (scene < 4) return 0;
    if (scene === 4) return Math.min(1, Math.max(0, (sceneP - 0.30) * 3.2));
    return 1; // scene 5: keep the zoomed XCVR detail fully shown
  }

  /* ─── electrons ─────────────────────────────────────────────── */
  const ELEC = [];

  function initElectrons() {
    ELEC.length = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (c < COLS - 1) ELEC.push({ c1:c,r1:r,c2:c+1,r2:r, t:Math.random(), sp:0.003+Math.random()*0.0038 });
        if (r < ROWS - 1) ELEC.push({ c1:c,r1:r,c2:c,r2:r+1, t:Math.random(), sp:0.003+Math.random()*0.0038 });
      }
    }
  }

  /* ─── photon ─────────────────────────────────────────────────── */
  let phT = 0.0, phDir = 1;

  /* ─── draw: chip ─────────────────────────────────────────────── */
  function drawChip(cx, cy, alpha, xcvr, ts) {
    if (alpha < 0.02) return;
    ctx.globalAlpha = alpha;
    const s = TW * 0.28, hs = s / 2, ps = Math.max(0.6, s * 0.068);

    ctx.fillStyle   = xcvr ? C.xcvrBg   : C.chipBg;
    ctx.strokeStyle = xcvr ? C.xcvrBrd  : C.chipBorder;
    ctx.lineWidth   = xcvr ? 1.3 : 0.8;
    ctx.fillRect(cx - hs, cy - hs, s, s);
    ctx.strokeRect(cx - hs, cy - hs, s, s);

    if (xcvr) {
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200,245,255,0.18)"; ctx.fill();
      ctx.strokeStyle = "rgba(200,245,255,0.50)"; ctx.lineWidth = 0.7; ctx.stroke();
    } else {
      const ds = s * 0.36;
      ctx.fillStyle = "rgba(55,70,130,0.14)";
      ctx.fillRect(cx - ds/2, cy - ds/2, ds, ds);
    }

    ctx.fillStyle = xcvr ? "rgba(200,245,255,0.40)" : "rgba(62,82,140,0.30)";
    for (let i = 1; i <= 3; i++) {
      const off = (i / 4) * s - hs;
      ctx.fillRect(cx + off - ps/2, cy - hs - ps*1.8, ps, ps*1.8);
      ctx.fillRect(cx + off - ps/2, cy + hs,           ps, ps*1.8);
      ctx.fillRect(cx - hs - ps*1.8, cy + off - ps/2, ps*1.8, ps);
      ctx.fillRect(cx + hs,           cy + off - ps/2, ps*1.8, ps);
    }

    if (xcvr) {
      const pulse = 0.45 + 0.55 * Math.sin(ts * 0.0025);
      ctx.shadowColor = C.xcvrBrd; ctx.shadowBlur = 10 + pulse * 16;
      ctx.strokeStyle = `rgba(200,245,255,${0.18 + pulse * 0.30})`;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(cx - hs - 4, cy - hs - 4, s + 8, s + 8);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  /* ─── draw: single clean photon particle ─────────────────────── */
  function drawPhotonParticle(px, py, r, color, glowColor, alpha) {
    ctx.globalAlpha = alpha;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, r * 3.5);
    rg.addColorStop(0,   "rgba(235,252,255,0.80)");
    rg.addColorStop(0.3, "rgba(200,245,255,0.35)");
    rg.addColorStop(1,   "rgba(200,245,255,0)");
    ctx.beginPath(); ctx.arc(px, py, r * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = rg; ctx.fill();
    ctx.shadowColor = glowColor; ctx.shadowBlur = r * 6;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /* ─── draw: photon beam (clean — scene 2) ────────────────────── */
  function drawCleanPhoton(ax, ay, bx, by, t, pa) {
    // Dashed fiber
    ctx.globalAlpha = pa * 0.18;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = C.phGlow; ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 8]); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;

    // Tail
    const tRaw = phDir === 1 ? Math.max(0, t - 0.12) : Math.min(1, t + 0.12);
    const tx2 = ax + (bx - ax) * tRaw, ty2 = ay + (by - ay) * tRaw;
    const tg = ctx.createLinearGradient(tx2, ty2, px, py);
    tg.addColorStop(0, "rgba(200,245,255,0)");
    tg.addColorStop(1, `rgba(200,245,255,${pa * 0.70})`);
    ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(px, py);
    ctx.strokeStyle = tg; ctx.lineWidth = 4.5; ctx.stroke();

    drawPhotonParticle(px, py, 4.5, "#ffffff", "#ffffff", pa);

    if (pa > 0.55) {
      const fs = Math.max(8, TW * 0.17);
      ctx.font = `500 ${fs}px "JetBrains Mono", monospace`;
      ctx.fillStyle = `rgba(200,245,255,${pa * 0.55})`;
      ctx.textAlign = "center";
      ctx.fillText("γ", px, py - 26);
      ctx.textAlign = "left";
    }
  }

  /* ─── draw: dispersed photon (scene 3) ───────────────────────── */
  function drawDispersedPhoton(ax, ay, bx, by, t, pa, disp) {
    // Dashed fiber
    ctx.globalAlpha = pa * 0.14;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = C.phGlow; ctx.lineWidth = 1.0;
    ctx.setLineDash([5, 8]); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Perpendicular to fiber
    const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx*dx + dy*dy);
    const nx = -dy / len, ny = dx / len;

    const spread = disp * 20;      // max perpendicular offset
    const phase  = disp * 0.09;    // how much copies drift ahead/behind

    // 3 copies: red-shifted (ahead), main (neutral white), blue-shifted (behind)
    const copies = [
      { dt:  phase * t * 0.8, perp: -spread, color: "#ffcca8", glow: "#ff8844", r: 3.0, oa: 0.72 },
      { dt:  0,               perp:  0,       color: "#ffffff",  glow: "#ffffff",  r: 4.5, oa: 0.90 },
      { dt: -phase * t * 0.8, perp: +spread, color: "#a8c8ff", glow: "#6688ff", r: 3.0, oa: 0.72 },
    ];

    for (const cp of copies) {
      const ct  = Math.max(0, Math.min(1, t + cp.dt));
      const cpx = ax + (bx - ax) * ct + nx * cp.perp;
      const cpy = ay + (by - ay) * ct + ny * cp.perp;
      drawPhotonParticle(cpx, cpy, cp.r, cp.color, cp.glow, pa * cp.oa);
    }

  }

  /* ─── draw: photon dispatcher ────────────────────────────────── */
  function drawPhotonBeam(ts) {
    const pa = photonOpacity();
    if (pa < 0.02) return;

    const DROP = TH * 0.70;
    const sA = gxy(XCVR_A[0], XCVR_A[1]), sB = gxy(XCVR_B[0], XCVR_B[1]);
    const ax = sA.x, ay = sA.y + DROP;
    const bx = sB.x, by = sB.y + DROP;
    const t  = phDir === 1 ? phT : 1 - phT;

    const disp = scene >= 3 ? Math.min(1, sceneP * 1.8) : 0;
    if (disp < 0.05) drawCleanPhoton(ax, ay, bx, by, t, pa);
    else             drawDispersedPhoton(ax, ay, bx, by, t, pa, disp);
  }

  /* ─── draw: e⁻ labels near XCVRs (scene 2+) ─────────────────── */
  function drawConversionLabels() {
    const pa = photonBaseOpacity();
    if (pa < 0.50) return;
    const gf = gridFade();
    if (gf < 0.05) return;
    const DROP = TH * 0.70;
    const fs = Math.max(7, TW * 0.16);
    ctx.font = `500 ${fs}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    for (const [c, r] of [XCVR_A, XCVR_B]) {
      const p = gxy(c, r);
      const a = chipAlpha(c, r) * pa * gf * 0.60;
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(122,182,255,0.85)";
      ctx.fillText("e⁻", p.x, p.y + DROP + TW * 0.35);
    }
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  /* ─── draw: scene 3 chromatic dispersion overlay (screen-space) ─ */
  function drawScene3Overlay(da) {
    if (da < 0.02) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const w = cssW(), h = cssH();
    const cx = w / 2, oy = h * 0.19;

    ctx.globalAlpha = da;
    const fs  = Math.max(11, Math.min(w * 0.014, 18));
    const fss = Math.max(9, fs * 0.72);
    ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";

    // Dark pill background
    const tw  = ctx.measureText("CHROMATIC DISPERSION").width;
    const px2 = 18, py2 = 9;
    ctx.fillStyle   = "rgba(9,9,15,0.82)";
    ctx.strokeStyle = "rgba(200,245,255,0.20)";
    ctx.lineWidth   = 1;
    const bx2 = cx - tw / 2 - px2, by2 = oy - fs - py2;
    ctx.fillRect  (bx2, by2, tw + px2 * 2, fs + py2 * 2);
    ctx.strokeRect(bx2, by2, tw + px2 * 2, fs + py2 * 2);

    ctx.fillStyle = "rgba(200,245,255,0.82)";
    ctx.fillText("CHROMATIC DISPERSION", cx, oy);

    ctx.font = `500 ${fss}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "rgba(200,245,255,0.42)";
    if (w < 520) {
      ctx.fillText("wavelengths arrive",      cx, oy + fss * 2.1);
      ctx.fillText("at different times", cx, oy + fss * 3.5);
    } else {
      ctx.fillText("different wavelengths arrive at different times", cx, oy + fss * 2.1);
    }

    ctx.textAlign   = "left";
    ctx.globalAlpha = 1;
  }

  /* ─── draw: XCVR zoomed detail — horizontal animated (screen-space) ─ */
  function drawXcvrDetail(da, ts) {
    if (da < 0.02) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const w = cssW(), h = cssH();
    const speed = 0.0007;
    const ct = coreT();

    /* ── PORTRAIT / MOBILE: vertical stack ── */
    if (w < h * 0.8) {
      const chipS  = Math.min(w * 0.22, h * 0.13, 110);
      const hs     = chipS / 2;
      const pW     = w * 0.72;
      const pHalf  = Math.min(h * 0.115, 75);
      const vGap   = chipS * 0.42;
      const cx     = w / 2;

      const totalH = pHalf * 2 + vGap + chipS + vGap + pHalf * 2;
      const topCY  = h * 0.5 - totalH * 0.5 + pHalf;
      const chipCY = topCY + pHalf + vGap + hs;
      const botCY  = chipCY + hs + vGap + pHalf;

      const fsLabel = Math.max(8, Math.min(w * 0.026, 11));
      const fsPow   = Math.max(11, chipS * 0.38);
      const ah      = chipS * 0.065;

      ctx.globalAlpha = da;

      // Top: distorted signal (3 chromatic waves)
      const dW = [
        { color: "#ff8844", yOff: -pHalf * 0.25, phase:  0.9, amp: 0.28, freq: 8.5 },
        { color: "#ffffff", yOff:  0,             phase:  0.0, amp: 0.38, freq: 7.0 },
        { color: "#6688ff", yOff: +pHalf * 0.25, phase: -0.9, amp: 0.28, freq: 9.2 },
      ];
      for (const dw of dW) {
        ctx.globalAlpha = da * (dw.yOff === 0 ? 0.88 : 0.60);
        ctx.strokeStyle = dw.color;
        ctx.lineWidth   = Math.max(1, chipS * 0.014);
        ctx.shadowColor = dw.color; ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const xf = i / 60;
          const x  = cx - pW * 0.5 + xf * pW;
          const y  = topCY + dw.yOff + Math.sin(xf * Math.PI * dw.freq + ts * speed + dw.phase) * pHalf * dw.amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = da;
      ctx.font = `500 ${fsLabel}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(200,245,255,0.50)";
      ctx.textAlign = "center";
      ctx.fillText("DISTORTED OPTICAL SIGNAL", cx, topCY - pHalf - fsLabel * 0.5);

      // Arrow: top → chip
      ctx.strokeStyle = "rgba(200,245,255,0.28)";
      ctx.lineWidth = Math.max(1, chipS * 0.014);
      ctx.beginPath();
      ctx.moveTo(cx, topCY + pHalf + 2); ctx.lineTo(cx, chipCY - hs - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - ah, chipCY - hs - ah); ctx.lineTo(cx, chipCY - hs);
      ctx.lineTo(cx + ah, chipCY - hs - ah); ctx.stroke();

      // Chip
      ctx.fillStyle = C.xcvrBg; ctx.strokeStyle = C.xcvrBrd; ctx.lineWidth = 1.5;
      ctx.fillRect(cx - hs, chipCY - hs, chipS, chipS);
      ctx.strokeRect(cx - hs, chipCY - hs, chipS, chipS);
      ctx.shadowColor = C.xcvrBrd; ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(200,245,255,0.12)"; ctx.lineWidth = 1;
      ctx.strokeRect(cx - hs - 4, chipCY - hs - 4, chipS + 8, chipS + 8);
      ctx.shadowBlur = 0;
      const fsC = Math.max(7, chipS * 0.12);
      ctx.textAlign = "center";
      if (ct < 0.999) {
        ctx.globalAlpha = da * (1 - ct);
        ctx.font = `600 ${fsC}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(200,245,255,0.30)";
        ctx.fillText("XCVR", cx, chipCY + chipS * 0.07);
        ctx.font = `500 ${fsC * 0.75}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(200,245,255,0.16)";
        ctx.fillText("DSP", cx, chipCY + chipS * 0.26);
      }
      if (ct > 0.001) {
        ctx.globalAlpha = da * ct;
        ctx.font = `600 ${fsC * 0.62}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(200,245,255,0.36)";
        ctx.fillText("LUXONNICORE", cx, chipCY + chipS * 0.14);
      }
      ctx.globalAlpha = da;

      // Power — crossfades 20W (ember) → <1W (photon)
      if (ct < 0.999) {
        ctx.globalAlpha = da * (1 - ct);
        ctx.font = `700 ${fsPow}px "JetBrains Mono", monospace`;
        ctx.fillStyle = C.power; ctx.shadowColor = C.power; ctx.shadowBlur = 10;
        ctx.fillText("20W", cx + hs + fsPow * 0.2 + fsPow, chipCY + fsPow * 0.35);
        ctx.shadowBlur = 0;
        ctx.font = `500 ${Math.max(7, fsLabel * 0.85)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(255,107,53,0.50)";
        ctx.fillText("per link", cx + hs + fsPow * 0.2 + fsPow, chipCY + fsPow * 0.35 + fsLabel * 1.8);
      }
      if (ct > 0.001) {
        ctx.globalAlpha = da * ct;
        ctx.font = `700 ${fsPow}px "JetBrains Mono", monospace`;
        ctx.fillStyle = C.phGlow; ctx.shadowColor = C.phGlow; ctx.shadowBlur = 10;
        ctx.fillText("<1W", cx + hs + fsPow * 0.2 + fsPow, chipCY + fsPow * 0.35);
        ctx.shadowBlur = 0;
        ctx.font = `500 ${Math.max(7, fsLabel * 0.85)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(200,245,255,0.55)";
        ctx.fillText("per link", cx + hs + fsPow * 0.2 + fsPow, chipCY + fsPow * 0.35 + fsLabel * 1.8);
      }
      ctx.globalAlpha = da;

      // Arrow: chip → bottom
      ctx.strokeStyle = "rgba(122,182,255,0.36)";
      ctx.lineWidth = Math.max(1, chipS * 0.014);
      ctx.beginPath();
      ctx.moveTo(cx, chipCY + hs + 2); ctx.lineTo(cx, botCY - pHalf - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - ah, botCY - pHalf - ah + 2); ctx.lineTo(cx, botCY - pHalf + 2);
      ctx.lineTo(cx + ah, botCY - pHalf - ah + 2); ctx.stroke();

      // Bottom: clean signal (electrical → optical as ct → 1)
      const mCleanCol = rgbStr(lerpRGB(ELECTRICAL_RGB, PHOTON_RGB, ct));
      ctx.globalAlpha = da * 0.90;
      ctx.strokeStyle = mCleanCol; ctx.lineWidth = Math.max(1, chipS * 0.016);
      ctx.shadowColor = mCleanCol; ctx.shadowBlur = 5;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const xf = i / 60;
        const x  = cx - pW * 0.5 + xf * pW;
        const y  = botCY + Math.sin(xf * Math.PI * 5 + ts * speed) * pHalf * 0.38;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.font = `500 ${fsLabel}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      if (ct < 0.999) {
        ctx.globalAlpha = da * (1 - ct) * 0.90;
        ctx.fillStyle = "rgba(122,182,255,0.50)";
        ctx.fillText("CLEAN ELECTRICAL SIGNAL", cx, botCY + pHalf + fsLabel * 1.5);
      }
      if (ct > 0.001) {
        ctx.globalAlpha = da * ct * 0.90;
        ctx.fillStyle = "rgba(200,245,255,0.55)";
        ctx.fillText("CLEAN OPTICAL SIGNAL", cx, botCY + pHalf + fsLabel * 1.5);
      }
      ctx.textAlign = "left"; ctx.globalAlpha = 1;
      return;
    }

    /* ── LANDSCAPE / DESKTOP: horizontal layout ── */
    const cy = h * 0.47;
    const cx = w / 2;

    // Sizing: chip center, signal panels on each side
    const chipS   = Math.min(w * 0.16, h * 0.22, 160);
    const hs      = chipS / 2;
    const gap     = w * 0.032;
    const panelW  = (w * 0.86 - chipS - gap * 2) / 2;
    const panelH  = chipS * 0.72;
    const lPanelX = cx - hs - gap - panelW; // left signal x start
    const rPanelX = cx + hs + gap;           // right signal x start

    const fsLabel  = Math.max(9, Math.min(w * 0.0095, 13));

    ctx.globalAlpha = da;

    // ─── Left panel: distorted optical signal ───────────────────
    // 3 chromatic copies, spread vertically, each scrolling at same speed
    const dWaves = [
      { color: "#ff8844", yOff: -panelH * 0.20, phase: 0.9,  amp: 0.30, freq: 8.5 },
      { color: "#ffffff", yOff:  0,              phase: 0.0,  amp: 0.40, freq: 7.0 },
      { color: "#6688ff", yOff: +panelH * 0.20, phase: -0.9, amp: 0.30, freq: 9.2 },
    ];

    for (const dw of dWaves) {
      ctx.globalAlpha = da * (dw.yOff === 0 ? 0.88 : 0.60);
      ctx.strokeStyle = dw.color;
      ctx.lineWidth   = Math.max(1.2, chipS * 0.016);
      ctx.shadowColor = dw.color;
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const xf = i / 80;
        const x  = lPanelX + xf * panelW;
        const y  = cy + dw.yOff + Math.sin(xf * Math.PI * dw.freq + ts * speed + dw.phase) * panelH * dw.amp;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = da;

    // Left label
    ctx.font      = `500 ${fsLabel}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "rgba(200,245,255,0.50)";
    ctx.textAlign = "center";
    ctx.fillText("DISTORTED OPTICAL SIGNAL", lPanelX + panelW / 2, cy - panelH * 0.68);

    // ─── Arrow: left panel → chip ───────────────────────────────
    const ah = chipS * 0.07;
    ctx.strokeStyle = "rgba(200,245,255,0.28)";
    ctx.lineWidth   = Math.max(1, chipS * 0.018);
    ctx.beginPath();
    ctx.moveTo(lPanelX + panelW + 2, cy);
    ctx.lineTo(cx - hs - 2, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - hs - ah, cy - ah * 0.5);
    ctx.lineTo(cx - hs,       cy);
    ctx.lineTo(cx - hs - ah, cy + ah * 0.5);
    ctx.stroke();

    // ─── Chip body ──────────────────────────────────────────────
    ctx.fillStyle   = C.xcvrBg;
    ctx.strokeStyle = C.xcvrBrd;
    ctx.lineWidth   = 2;
    ctx.fillRect  (cx - hs, cy - hs, chipS, chipS);
    ctx.strokeRect(cx - hs, cy - hs, chipS, chipS);

    // Outer glow
    ctx.shadowColor = C.xcvrBrd; ctx.shadowBlur = 20;
    ctx.strokeStyle = "rgba(200,245,255,0.14)";
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(cx - hs - 5, cy - hs - 5, chipS + 10, chipS + 10);
    ctx.shadowBlur  = 0;

    // Optical port circle
    ctx.beginPath(); ctx.arc(cx, cy - chipS * 0.08, chipS * 0.14, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(200,245,255,0.10)"; ctx.fill();
    ctx.strokeStyle = "rgba(200,245,255,0.30)"; ctx.lineWidth = 1; ctx.stroke();

    // Chip text — crossfades XCVR/DSP → LUXONNICORE
    const fsChip = Math.max(8, chipS * 0.12);
    ctx.textAlign = "center";
    if (ct < 0.999) {
      ctx.globalAlpha = da * (1 - ct);
      ctx.font = `600 ${fsChip}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(200,245,255,0.32)";
      ctx.fillText("XCVR", cx, cy + chipS * 0.07);
      ctx.font = `500 ${fsChip * 0.75}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(200,245,255,0.18)";
      ctx.fillText("DSP", cx, cy + chipS * 0.26);
    }
    if (ct > 0.001) {
      ctx.globalAlpha = da * ct;
      ctx.font = `600 ${fsChip * 0.65}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(200,245,255,0.38)";
      ctx.fillText("LUXONNICORE", cx, cy + chipS * 0.14);
    }
    ctx.globalAlpha = da;

    // Power label below chip — crossfades 20W (ember) → <1W (photon)
    const fsPow = Math.max(13, chipS * 0.42);
    if (ct < 0.999) {
      ctx.globalAlpha = da * (1 - ct);
      ctx.font = `700 ${fsPow}px "JetBrains Mono", monospace`;
      ctx.fillStyle = C.power;
      ctx.shadowColor = C.power; ctx.shadowBlur = chipS * 0.16;
      ctx.fillText("20W", cx, cy + hs + fsPow * 1.15);
      ctx.shadowBlur = 0;
      ctx.font = `500 ${Math.max(8, w * 0.0085)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(255,107,53,0.55)";
      ctx.fillText("per transceiver", cx, cy + hs + fsPow * 1.15 + fsLabel * 1.6);
    }
    if (ct > 0.001) {
      ctx.globalAlpha = da * ct;
      ctx.font = `700 ${fsPow}px "JetBrains Mono", monospace`;
      ctx.fillStyle = C.phGlow;
      ctx.shadowColor = C.phGlow; ctx.shadowBlur = chipS * 0.16;
      ctx.fillText("<1W", cx, cy + hs + fsPow * 1.15);
      ctx.shadowBlur = 0;
      ctx.font = `500 ${Math.max(8, w * 0.0085)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(200,245,255,0.60)";
      ctx.fillText("per transceiver", cx, cy + hs + fsPow * 1.15 + fsLabel * 1.6);
    }
    ctx.globalAlpha = da;

    // ─── Arrow: chip → right panel ──────────────────────────────
    ctx.strokeStyle = "rgba(122,182,255,0.38)";
    ctx.lineWidth   = Math.max(1, chipS * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx + hs + 2, cy);
    ctx.lineTo(rPanelX + panelW - 2, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rPanelX + panelW - ah, cy - ah * 0.5);
    ctx.lineTo(rPanelX + panelW,       cy);
    ctx.lineTo(rPanelX + panelW - ah, cy + ah * 0.5);
    ctx.stroke();

    // ─── Right panel: clean signal (electrical → optical as ct → 1) ──
    const dCleanCol = rgbStr(lerpRGB(ELECTRICAL_RGB, PHOTON_RGB, ct));
    ctx.globalAlpha = da * 0.92;
    ctx.strokeStyle = dCleanCol;
    ctx.lineWidth   = Math.max(1.5, chipS * 0.020);
    ctx.shadowColor = dCleanCol; ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const xf = i / 80;
      const x  = rPanelX + xf * panelW;
      const y  = cy + Math.sin(xf * Math.PI * 5 + ts * speed) * panelH * 0.38;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Right label
    ctx.font      = `500 ${fsLabel}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    if (ct < 0.999) {
      ctx.globalAlpha = da * (1 - ct) * 0.92;
      ctx.fillStyle = "rgba(122,182,255,0.52)";
      ctx.fillText("CLEAN ELECTRICAL SIGNAL", rPanelX + panelW / 2, cy - panelH * 0.68);
    }
    if (ct > 0.001) {
      ctx.globalAlpha = da * ct * 0.92;
      ctx.fillStyle = "rgba(200,245,255,0.56)";
      ctx.fillText("CLEAN OPTICAL SIGNAL", rPanelX + panelW / 2, cy - panelH * 0.68);
    }

    ctx.textAlign   = "left";
    ctx.globalAlpha = 1;
  }

  /* ─── main draw loop ────────────────────────────────────────── */
  let frameId;

  function draw(ts) {
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Camera + DPR transform
    const zT   = cameraZoomT();
    const zoom  = 1 + (FINAL_ZOOM - 1) * zT;
    const w = cssW(), h = cssH();
    const tgt = getZoomTarget();
    const tx  = (w / 2 - tgt.x * FINAL_ZOOM) * zT;
    const ty  = (h / 2 - tgt.y * FINAL_ZOOM) * zT;
    ctx.setTransform(zoom * DPR, 0, 0, zoom * DPR, tx * DPR, ty * DPR);

    const DROP = TH * 0.70;
    const gf   = gridFade();
    const pa   = photonOpacity();

    // Advance electrons
    for (const e of ELEC) {
      if (edgeAlpha(e.c1, e.r1, e.c2, e.r2) > 0.05)
        e.t = (e.t + e.sp) % 1;
    }

    // Advance photon
    if (pa > 0.04 || photonBaseOpacity() > 0.04) {
      phT += 0.0075 * phDir;
      if (phT >= 1) { phT = 1; phDir = -1; }
      if (phT <= 0) { phT = 0; phDir =  1; }
    }

    /* 1 ── grid edges */
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const p = gxy(c, r);
        const drawEdge = (c2, r2) => {
          const a = edgeAlpha(c, r, c2, r2) * gf;
          if (a < 0.02) return;
          const q = gxy(c2, r2);
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = C.gridLine; ctx.lineWidth = 0.85; ctx.stroke();
          ctx.globalAlpha = 1;
        };
        if (c < COLS - 1) drawEdge(c + 1, r);
        if (r < ROWS - 1) drawEdge(c, r + 1);
      }
    }

    /* 2 ── electrons */
    for (const e of ELEC) {
      const ea = edgeAlpha(e.c1, e.r1, e.c2, e.r2) * gf;
      if (ea < 0.05) continue;
      const p1 = gxy(e.c1, e.r1), p2 = gxy(e.c2, e.r2);
      ctx.globalAlpha = ea * 0.55;
      ctx.beginPath();
      ctx.arc(p1.x + (p2.x - p1.x) * e.t, p1.y + (p2.y - p1.y) * e.t, 2.0, 0, Math.PI * 2);
      ctx.fillStyle = C.eDim; ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* 3 ── photon beam (camera-space) */
    drawPhotonBeam(ts);

    /* 4 ── drop lines + chips */
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const alpha = chipAlpha(c, r) * gf;
        if (alpha < 0.02) continue;
        const p     = gxy(c, r);
        const xcvr  = (c === XCVR_A[0] && r === XCVR_A[1]) ||
                      (c === XCVR_B[0] && r === XCVR_B[1]);
        const xcvrOn = xcvr && photonBaseOpacity() > 0.05;

        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + DROP);
        ctx.strokeStyle = xcvrOn ? "rgba(200,245,255,0.28)" : "rgba(62,82,140,0.14)";
        ctx.lineWidth = 0.8; ctx.stroke();
        ctx.globalAlpha = 1;

        drawChip(p.x, p.y + DROP, alpha, xcvrOn, ts);
      }
    }

    /* 5 ── conversion e⁻ labels */
    drawConversionLabels();

    /* 6 ── Scene 3: chromatic dispersion label (screen-space) */
    if (scene === 3) {
      const disp = Math.min(1, sceneP * 1.8);
      drawScene3Overlay(Math.min(1, Math.max(0, (disp - 0.22) * 2.8)));
    }

    /* 7 ── XCVR zoomed detail (screen-space — resets transform internally) */
    drawXcvrDetail(detailAlpha(), ts);

    frameId = requestAnimationFrame(draw);
  }

  /* ─── scroll → scene mapping ────────────────────────────────── */
  const PANELS = Array.from(document.querySelectorAll(".scene-panel-text"));
  const DOTS   = Array.from(document.querySelectorAll(".scene-progress-dot"));
  const HINT   = document.getElementById("scene-hint");
  let hintHidden = false;

  function onScroll() {
    const rect    = wrapper.getBoundingClientRect();
    const wH      = wrapper.offsetHeight;
    const vH      = window.innerHeight;
    const scrolled = -rect.top;
    const maxS    = wH - vH;
    const t       = Math.max(0, Math.min(1, scrolled / maxS));

    if (!hintHidden && scrolled > vH * 0.08) {
      HINT && HINT.classList.add("is-hidden");
      hintHidden = true;
    }

    const raw = t * N;
    scene  = Math.min(N - 1, Math.floor(raw));
    // raw - scene (not raw % 1): once raw reaches exactly N, scene clamps to
    // N-1 but raw%1 would wrap to 0, snapping the last scene back to its
    // start. raw - scene stays at 1 in that case, holding the final state.
    sceneP = raw - scene;

    // Scroll-driven panel animation: scale + opacity tied to position within scene
    PANELS.forEach(p => {
      const idx    = +p.dataset.panel;
      const active = idx === scene;
      p.classList.toggle("is-active", active);

      if (active) {
        let sc, op;
        const sp = sceneP;
        if (sp < 0.28) {
          // Entry: grow from 0.82 → 1.0 and fade in
          const u = sp / 0.28;
          sc = 0.82 + 0.18 * u;
          op = u;
        } else if (sp < 0.74) {
          // Hold
          sc = 1.0; op = 1.0;
        } else {
          // Exit: drift up slightly and fade out
          const u = (sp - 0.74) / 0.26;
          sc = 1.0 + 0.04 * u;
          op = 1.0 - u;
        }
        p.style.opacity   = op.toFixed(3);
        p.style.transform = `scale(${sc.toFixed(3)})`;
      } else {
        p.style.opacity   = "";
        p.style.transform = "";
      }
    });

    DOTS.forEach(d => d.classList.toggle("is-active", +d.dataset.step === scene));
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ─── resize ─────────────────────────────────────────────────── */
  function resize() {
    DPR = window.devicePixelRatio || 1;
    const w = cssW(), h = cssH();
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    computeLayout();
    initElectrons();
  }

  new ResizeObserver(resize).observe(canvas.parentElement);

  /* ─── tab visibility ─────────────────────────────────────────── */
  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) frameId = requestAnimationFrame(draw);
    else cancelAnimationFrame(frameId);
  });

  resize();
  frameId = requestAnimationFrame(draw);
})();
