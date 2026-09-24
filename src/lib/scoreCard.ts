import type { TeamColor } from '@/types';

interface ScoreCardParams {
  winnerTeam: TeamColor;
  blueScore: number;
  redScore: number;
  blueLabel: string;
  redLabel: string;
  winsLabel: string;
}

const WIDTH = 1080;
const HEIGHT = 1080;

const COLORS = {
  bg: '#111827',
  bgAccent: '#1E3A5F',
  blue: '#4D96FF',
  red: '#FF6B6B',
  text: '#F9FAFB',
  muted: '#9CA3AF',
};

/** Draws a square, share-ready score card for the just-finished match (PBI: result sharing). */
export async function generateScoreCardBlob(params: ScoreCardParams): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    await document.fonts.ready;
  } catch {
    // Font loading can throw in odd embed contexts — canvas still renders
    // with the system fallback below.
  }
  const fontStack = '"Inter", system-ui, sans-serif';

  // Background
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, COLORS.bg);
  gradient.addColorStop(1, COLORS.bgAccent);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = 'center';

  // Brand
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 64px ${fontStack}`;
  ctx.fillText('⚡ Quizzy', WIDTH / 2, 160);

  // Trophy + winner label
  const winnerColor = params.winnerTeam === 'blue' ? COLORS.blue : COLORS.red;
  const winnerLabel = params.winnerTeam === 'blue' ? params.blueLabel : params.redLabel;
  ctx.font = '140px sans-serif';
  ctx.fillText('🏆', WIDTH / 2, 400);

  ctx.fillStyle = winnerColor;
  ctx.font = `800 72px ${fontStack}`;
  ctx.fillText(`${winnerLabel} ${params.winsLabel}`, WIDTH / 2, 500);

  // Score row
  const scoreY = 700;
  ctx.font = `800 140px ${fontStack}`;
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(String(params.blueScore), WIDTH / 2 - 180, scoreY);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 90px ${fontStack}`;
  ctx.fillText('–', WIDTH / 2, scoreY - 30);
  ctx.fillStyle = COLORS.red;
  ctx.font = `800 140px ${fontStack}`;
  ctx.fillText(String(params.redScore), WIDTH / 2 + 180, scoreY);

  ctx.font = `600 36px ${fontStack}`;
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(params.blueLabel, WIDTH / 2 - 180, scoreY + 70);
  ctx.fillStyle = COLORS.red;
  ctx.fillText(params.redLabel, WIDTH / 2 + 180, scoreY + 70);

  // Footer
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 32px ${fontStack}`;
  ctx.fillText('Gerçek zamanlı takım yarışması — kayıt gerektirmez', WIDTH / 2, 960);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
