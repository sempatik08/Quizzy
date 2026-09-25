'use strict';

/**
 * Generates "can you guess this?" question cards for social media (PBI:
 * social content engine, growth-plan.md 3.4). Turns the 7200-question bank
 * into a rotating library of postable content instead of source no one but
 * players ever sees.
 *
 * Usage:
 *   node scripts/social-content.js [count] [--category=history]
 *
 * Each run picks `count` (default 7 — a week's worth) not-yet-used questions,
 * spread across categories, and writes to content/social/:
 *   <date>-<id>.png   1080x1350 portrait card, no answer shown
 *   <date>-<id>.mp4    same card as a 6s Ken Burns video (needs ffmpeg on
 *                       PATH) — TikTok and YouTube Shorts only take video, so
 *                       the still alone cannot reach either of them. Feeds
 *                       Postdeck's (../postdeck) video-only publish pipeline
 *                       today; once its PBI AT (static-post support) ships,
 *                       the .png can go to Instagram directly instead.
 *   <date>-<id>.txt    caption + hashtags + the answer, for the poster's own
 *                       reference (post the answer as a follow-up comment,
 *                       not in the image — that's what gets people to engage)
 *
 * Picked ids are recorded in content/social/.used.json so a question is not
 * reposted until the whole bank has cycled through.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { QUESTIONS } = require('../server/questions');

const OUT_DIR = path.join(__dirname, '..', 'content', 'social');
const USED_FILE = path.join(OUT_DIR, '.used.json');

const WIDTH = 1080;
const HEIGHT = 1350;
const VIDEO_HEIGHT = 1920;

const GAME_URL = 'https://quizzy-two-jade.vercel.app/';
const GAME_HOST = 'quizzy-two-jade.vercel.app';

const CATEGORY_LABELS_TR = {
  general: 'Genel Kültür', cinema: 'Sinema & Dizi', sports: 'Spor', history: 'Tarih',
  music: 'Müzik', anime: 'Anime', technology: 'Teknoloji', literature: 'Edebiyat',
  math: 'Matematik', geography: 'Coğrafya', philosophy: 'Felsefe', games: 'Oyun',
};

const DIFFICULTY_LABELS_TR = { 1: 'Kolay', 2: 'Orta', 3: 'Zor' };

function loadUsed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(USED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveUsed(used) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(USED_FILE, JSON.stringify([...used]));
}

/**
 * Picks `count` questions, one per category where possible, skipping
 * already-used ids. Pass `onlyCategory` to pin every pick to one category —
 * useful when a content plan (e.g. Postdeck's planner) already committed a
 * specific row to a theme like "history question" and needs a matching card.
 */
function pickQuestions(count, used, onlyCategory) {
  const categories = onlyCategory ? [onlyCategory] : Object.keys(QUESTIONS);
  const picks = [];
  let categoryIndex = Math.floor(Math.random() * categories.length);

  for (let i = 0; i < count; i++) {
    let picked = null;
    for (let attempt = 0; attempt < categories.length && !picked; attempt++) {
      const category = categories[(categoryIndex + attempt) % categories.length];
      const pool = QUESTIONS[category].filter(
        (q) => fitsCard(q) && !used.has(q.id) && !picks.some((p) => p.id === q.id),
      );
      if (pool.length > 0) picked = { ...pool[Math.floor(Math.random() * pool.length)], category };
    }
    // Whole bank has cycled — reset and retry once.
    if (!picked) {
      used.clear();
      i--;
      continue;
    }
    picks.push(picked);
    categoryIndex++;
  }
  return picks;
}

/** Greedy word-wrap for SVG text, which does not wrap on its own. */
function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharsPerLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Long questions step down to a smaller, wider-wrapped font so the options
// and footer still fit the 1350px card instead of running into each other.
const MAX_QUESTION_BLOCK = 300;
const MAX_OPTION_CHARS = 42;
const QUESTION_LAYOUTS = [
  { wrap: 30, size: 46, lineHeight: 56 },
  { wrap: 36, size: 40, lineHeight: 50 },
  { wrap: 42, size: 34, lineHeight: 44 },
];

/** First layout the question fits, or null if it is too long for a card at any size. */
function questionLayout(question) {
  for (const layout of QUESTION_LAYOUTS) {
    const lines = wrapText(question.text_tr, layout.wrap);
    if (lines.length * layout.lineHeight <= MAX_QUESTION_BLOCK) return { layout, lines };
  }
  return null;
}

/**
 * A card that would clip an option or overflow the canvas is worse than no
 * card — and a 400-character question is unreadable in a 6-second Reel anyway.
 */
function fitsCard(question) {
  return questionLayout(question) !== null
    && Object.values(question.options_tr).every((o) => o.length <= MAX_OPTION_CHARS);
}

/**
 * The layout is designed at 1080x1350 (the 4:5 feed image). A taller canvas
 * (the 9:16 video) keeps the same layout and centers it vertically, which
 * also keeps the text clear of the Reels/TikTok UI along the bottom edge.
 */
function buildCardSvg(question, height = HEIGHT) {
  const offsetY = Math.round((height - HEIGHT) / 2);
  const categoryLabel = CATEGORY_LABELS_TR[question.category] ?? question.category;
  const difficultyLabel = DIFFICULTY_LABELS_TR[question.difficulty] ?? '';
  const optionLetters = ['A', 'B', 'C', 'D', 'E'];

  const { layout, lines: questionLines } = questionLayout(question)
    ?? { layout: QUESTION_LAYOUTS[QUESTION_LAYOUTS.length - 1], lines: wrapText(question.text_tr, 42) };

  const questionY = 420;
  const { lineHeight } = layout;
  const questionSvg = questionLines
    .map((line, i) => `<text x="${WIDTH / 2}" y="${questionY + i * lineHeight}" text-anchor="middle" fill="#F9FAFB" font-size="${layout.size}" font-weight="800" font-family="Inter, sans-serif">${escapeXml(line)}</text>`)
    .join('\n');

  const optionsStartY = questionY + questionLines.length * lineHeight + 80;
  const optionsSvg = optionLetters
    .map((letter, i) => {
      const value = question.options_tr[letter];
      if (!value) return '';
      const y = optionsStartY + i * 90;
      return `
        <rect x="90" y="${y - 46}" width="${WIDTH - 180}" height="72" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)"/>
        <text x="130" y="${y}" fill="#93C5FD" font-size="34" font-weight="800" font-family="Inter, sans-serif">${letter}</text>
        <text x="180" y="${y}" fill="#F9FAFB" font-size="32" font-weight="600" font-family="Inter, sans-serif">${escapeXml(value.slice(0, 42))}</text>
      `;
    })
    .join('\n');

  // Last option's box bottom is at (last baseline + 26); leave a gap after it.
  const footerY = optionsStartY + (optionLetters.length - 1) * 90 + 26 + 64;

  return `
<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#1E3A5F"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${height}" fill="url(#bg)"/>
  <g transform="translate(0,${offsetY})">

  <text x="${WIDTH / 2}" y="130" text-anchor="middle" fill="#F9FAFB" font-size="56" font-weight="800" font-family="Inter, sans-serif">⚡ Quizzy</text>

  <rect x="${WIDTH / 2 - 160}" y="170" width="320" height="56" rx="28" fill="rgba(77,150,255,0.18)" stroke="#4D96FF"/>
  <text x="${WIDTH / 2}" y="207" text-anchor="middle" fill="#93C5FD" font-size="28" font-weight="700" font-family="Inter, sans-serif">${escapeXml(categoryLabel)}${difficultyLabel ? ' · ' + difficultyLabel : ''}</text>

  <text x="${WIDTH / 2}" y="300" text-anchor="middle" fill="#FF6B6B" font-size="40" font-weight="800" font-family="Inter, sans-serif">Bunu bilir misin? 🤔</text>

  ${questionSvg}
  ${optionsSvg}

  <text x="${WIDTH / 2}" y="${footerY}" text-anchor="middle" fill="#9CA3AF" font-size="30" font-weight="600" font-family="Inter, sans-serif">Cevabını yorumlara yaz 👇 · kayıt yok</text>
  <text x="${WIDTH / 2}" y="${footerY + 50}" text-anchor="middle" fill="#93C5FD" font-size="30" font-weight="700" font-family="Inter, sans-serif">${GAME_HOST}</text>
  </g>
</svg>`;
}

function buildCaption(question, categoryLabel) {
  const hashtags = '#quizzy #bilgiyarismasi #quiz #genelkultur #' + question.category;
  return [
    `${categoryLabel} sorusu: ${question.text_tr}`,
    '',
    `Arkadaşlarınla takım kur, canlı oyna — kayıt yok: ${GAME_URL}`,
    '',
    `Cevap (yorumlara yazma, ilk yorumda paylaş): ${question.options_tr[question.answer]}`,
    '',
    hashtags,
  ].join('\n');
}

let ffmpegChecked = false;
let ffmpegAvailable = false;

function hasFfmpeg() {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * 9:16 still -> 6s video with a slow centered zoom and a clock tick each
 * second (a "think fast" countdown). The tick is synthesized, so there is no
 * music licence to worry about, and it gives the file a real audio track —
 * Postdeck flags silent uploads, and a silent Reel is almost always a mistake.
 */
function buildCardVideo(verticalPngPath, mp4Path) {
  const durationSec = 6;
  const fps = 25;
  const totalFrames = durationSec * fps;
  // Upscale before zoompan: at native size its integer rounding makes the zoom visibly jitter.
  const zoom = `scale=${WIDTH * 2}:${VIDEO_HEIGHT * 2},`
    + `zoompan=z='min(zoom+0.0007,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
    + `:d=${totalFrames}:s=${WIDTH}x${VIDEO_HEIGHT}:fps=${fps},format=yuv420p`;
  const tick = `aevalsrc=0.3*sin(2*PI*1400*t)*exp(-50*(t-floor(t))):s=44100:d=${durationSec}`;
  execFileSync('ffmpeg', [
    '-y',
    '-i', verticalPngPath,
    '-f', 'lavfi', '-i', tick,
    '-vf', zoom,
    '-frames:v', String(totalFrames),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    mp4Path,
  ], { stdio: 'ignore' });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--category='));
  const categoryArg = process.argv.find((a) => a.startsWith('--category='));
  const onlyCategory = categoryArg ? categoryArg.split('=')[1] : null;
  if (onlyCategory && !QUESTIONS[onlyCategory]) {
    console.error(`Unknown category "${onlyCategory}". Valid: ${Object.keys(QUESTIONS).join(', ')}`);
    process.exit(1);
  }

  const count = Number(args[0]) || 7;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const withVideo = hasFfmpeg();
  if (!withVideo) {
    console.warn('ffmpeg not found on PATH — skipping .mp4 generation, writing .png + .txt only.\n');
  }

  const used = loadUsed();
  const questions = pickQuestions(count, used, onlyCategory);
  const today = new Date().toISOString().slice(0, 10);

  for (const question of questions) {
    const svg = buildCardSvg(question);
    const base = `${today}-${question.id}`;
    const pngPath = path.join(OUT_DIR, `${base}.png`);
    const txtPath = path.join(OUT_DIR, `${base}.txt`);

    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    fs.writeFileSync(txtPath, buildCaption(question, CATEGORY_LABELS_TR[question.category] ?? question.category));

    if (withVideo) {
      const verticalPng = path.join(OUT_DIR, `${base}.vertical.png`);
      await sharp(Buffer.from(buildCardSvg(question, VIDEO_HEIGHT))).png().toFile(verticalPng);
      buildCardVideo(verticalPng, path.join(OUT_DIR, `${base}.mp4`));
      fs.unlinkSync(verticalPng);
      console.log(`  ${base}.png + .mp4`);
    } else {
      console.log(`  ${base}.png`);
    }

    used.add(question.id);
  }

  saveUsed(used);
  console.log(`\n${questions.length} card(s) written to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildCardSvg, buildCardVideo, buildCaption, fitsCard, loadUsed, saveUsed,
  CATEGORY_LABELS_TR, HEIGHT, VIDEO_HEIGHT,
};
