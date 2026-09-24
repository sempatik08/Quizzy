'use strict';

/**
 * Generates "can you guess this?" question cards for social media (PBI:
 * social content engine, growth-plan.md 3.4). Turns the 7200-question bank
 * into a rotating library of postable content instead of source no one but
 * players ever sees.
 *
 * Usage:
 *   node scripts/social-content.js [count]
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

/** Picks `count` questions, one per category where possible, skipping already-used ids. */
function pickQuestions(count, used) {
  const categories = Object.keys(QUESTIONS);
  const picks = [];
  let categoryIndex = Math.floor(Math.random() * categories.length);

  for (let i = 0; i < count; i++) {
    let picked = null;
    for (let attempt = 0; attempt < categories.length && !picked; attempt++) {
      const category = categories[(categoryIndex + attempt) % categories.length];
      const pool = QUESTIONS[category].filter((q) => !used.has(q.id) && !picks.some((p) => p.id === q.id));
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

function buildCardSvg(question) {
  const categoryLabel = CATEGORY_LABELS_TR[question.category] ?? question.category;
  const difficultyLabel = DIFFICULTY_LABELS_TR[question.difficulty] ?? '';
  const questionLines = wrapText(question.text_tr, 30);
  const optionLetters = ['A', 'B', 'C', 'D', 'E'];

  const questionY = 420;
  const lineHeight = 56;
  const questionSvg = questionLines
    .map((line, i) => `<text x="${WIDTH / 2}" y="${questionY + i * lineHeight}" text-anchor="middle" fill="#F9FAFB" font-size="46" font-weight="800" font-family="Inter, sans-serif">${escapeXml(line)}</text>`)
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

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#1E3A5F"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <text x="${WIDTH / 2}" y="130" text-anchor="middle" fill="#F9FAFB" font-size="56" font-weight="800" font-family="Inter, sans-serif">⚡ Quizzy</text>

  <rect x="${WIDTH / 2 - 160}" y="170" width="320" height="56" rx="28" fill="rgba(77,150,255,0.18)" stroke="#4D96FF"/>
  <text x="${WIDTH / 2}" y="207" text-anchor="middle" fill="#93C5FD" font-size="28" font-weight="700" font-family="Inter, sans-serif">${escapeXml(categoryLabel)}${difficultyLabel ? ' · ' + difficultyLabel : ''}</text>

  <text x="${WIDTH / 2}" y="300" text-anchor="middle" fill="#FF6B6B" font-size="40" font-weight="800" font-family="Inter, sans-serif">Bunu bilir misin? 🤔</text>

  ${questionSvg}
  ${optionsSvg}

  <text x="${WIDTH / 2}" y="${HEIGHT - 70}" text-anchor="middle" fill="#9CA3AF" font-size="30" font-weight="600" font-family="Inter, sans-serif">Cevabını yorumlara yaz 👇 · quizzy oyna, kayıt yok</text>
</svg>`;
}

function buildCaption(question, categoryLabel) {
  const hashtags = '#quiz #bilgiyarismasi #trivia #quizzy #' + question.category;
  return [
    `${categoryLabel} sorusu: ${question.text_tr}`,
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

/** Still image -> 6s Ken Burns video, so TikTok/YouTube (video-only) can carry the same card. */
function buildCardVideo(pngPath, mp4Path) {
  const durationSec = 6;
  const fps = 25;
  const totalFrames = durationSec * fps;
  execFileSync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', pngPath,
    '-vf', `zoompan=z='min(zoom+0.0008,1.15)':d=${totalFrames}:s=${WIDTH}x${HEIGHT}:fps=${fps},format=yuv420p`,
    '-t', String(durationSec),
    '-r', String(fps),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    mp4Path,
  ], { stdio: 'ignore' });
}

async function main() {
  const count = Number(process.argv[2]) || 7;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const withVideo = hasFfmpeg();
  if (!withVideo) {
    console.warn('ffmpeg not found on PATH — skipping .mp4 generation, writing .png + .txt only.\n');
  }

  const used = loadUsed();
  const questions = pickQuestions(count, used);
  const today = new Date().toISOString().slice(0, 10);

  for (const question of questions) {
    const svg = buildCardSvg(question);
    const base = `${today}-${question.id}`;
    const pngPath = path.join(OUT_DIR, `${base}.png`);
    const txtPath = path.join(OUT_DIR, `${base}.txt`);

    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    fs.writeFileSync(txtPath, buildCaption(question, CATEGORY_LABELS_TR[question.category] ?? question.category));

    if (withVideo) {
      buildCardVideo(pngPath, path.join(OUT_DIR, `${base}.mp4`));
      console.log(`  ${base}.png + .mp4`);
    } else {
      console.log(`  ${base}.png`);
    }

    used.add(question.id);
  }

  saveUsed(used);
  console.log(`\n${questions.length} card(s) written to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
