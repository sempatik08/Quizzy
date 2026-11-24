'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Zap, Copy, Check, MessageCircle, Clock, Users, Loader2, ChevronDown } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useLanguage } from '@/context/LanguageContext';
import { useProfile } from '@/context/ProfileContext';
import { avatarGlyph } from '@/lib/avatars';
import { randomGuestName } from '@/lib/guestName';
import { track } from '@/lib/track';
import { SupportLink } from '@/components/shared/SupportLink';
import type { Category, OptionKey } from '@/types';

// --- Server payloads (see server/daily.js) -----------------------------------

interface DailyQuestion {
  id: string;
  category: Category;
  difficulty: number;
  text: string;
  text_tr: string;
  options: Record<OptionKey, string>;
  options_tr: Record<OptionKey, string>;
}

interface DailyMeta { date: string; day: number; total: number; seconds: number; nextAt: number }

interface BoardEntry { rank: number; name: string; avatar: string; score: number; ms: number; me: boolean }
interface Board { entries: BoardEntry[]; total: number; myRank: number | null }

type Cell = 'correct' | 'wrong' | 'timeout';

interface DailyResult extends DailyMeta {
  done: true;
  score: number;
  ms: number;
  grid: Cell[];
  review: Array<DailyQuestion & { answer: OptionKey; explanation: string | null; chosen: OptionKey | null; correct: boolean }>;
  board: Board;
}

type StatusPayload = (DailyMeta & { done: false; answered: number }) | DailyResult;
type StartPayload = (DailyMeta & { done: false; index: number; question: DailyQuestion }) | DailyResult;

interface AnsweredPayload {
  index: number;
  correct: boolean;
  correctAnswer: OptionKey;
  done: boolean;
  next?: { index: number; question: DailyQuestion };
  result?: DailyResult;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];
/** How long the right answer stays on screen before the next question. */
const REVEAL_MS = 1600;
const CELL_EMOJI: Record<Cell, string> = { correct: '🟩', wrong: '🟥', timeout: '⬜' };

const CATEGORY_LABEL_KEY: Record<Category, string> = {
  general: 'generalCulture', sports: 'sports', history: 'history', music: 'music', cinema: 'cinema',
  anime: 'anime', games: 'games', technology: 'technology', literature: 'literature', math: 'math',
  geography: 'geography', philosophy: 'philosophy', tr_magazine: 'trMagazine',
  world_magazine: 'worldMagazine', world_cup: 'worldCup',
};

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** The shareable text — Wordle-style: no spoilers, just the shape of the run. */
export function shareText(result: Pick<DailyResult, 'day' | 'grid' | 'score' | 'total' | 'ms'>, title: string, url: string, secLabel: string): string {
  const grid = result.grid.map((c) => CELL_EMOJI[c]).join('');
  return `Quizzy #${result.day} · ${title}\n${grid}\n${result.score}/${result.total} ⚡ ${Math.round(result.ms / 1000)} ${secLabel}\n${url}`;
}

export function DailyQuiz() {
  const { t, language } = useLanguage();
  const { profile } = useProfile();

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  const [question, setQuestion] = useState<{ index: number; q: DailyQuestion } | null>(null);
  const [chosen, setChosen] = useState<OptionKey | null>(null);
  const [reveal, setReveal] = useState<AnsweredPayload | null>(null);
  const [result, setResult] = useState<DailyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const deadline = useRef(0);
  const answeredRef = useRef(false);
  const pending = useRef<AnsweredPayload | null>(null);
  const secondsRef = useRef(20);

  const label = (key: string) => (t as unknown as Record<string, string>)[key] ?? key;

  // --- Socket wiring -------------------------------------------------------
  useEffect(() => {
    if (!profile) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onStatus = (p: StatusPayload) => {
      setStatus(p);
      setMeta(p);
      if (p.done) setResult(p);
    };
    const showQuestion = (index: number, q: DailyQuestion, seconds: number) => {
      setQuestion({ index, q });
      setChosen(null);
      setReveal(null);
      answeredRef.current = false;
      deadline.current = Date.now() + seconds * 1000;
      setTimeLeft(seconds);
    };
    const onState = (p: StartPayload) => {
      setStarting(false);
      setMeta(p);
      secondsRef.current = p.seconds;
      if (p.done) {
        setResult(p);
        return;
      }
      showQuestion(p.index, p.question, p.seconds);
    };
    const onAnswered = (p: AnsweredPayload) => {
      setReveal(p);
      pending.current = p;
      window.setTimeout(() => {
        const cur = pending.current;
        if (!cur || cur.index !== p.index) return;
        pending.current = null;
        if (cur.done && cur.result) {
          setResult(cur.result);
          setQuestion(null);
          track('daily_finished', { score: cur.result.score, day: cur.result.day });
        } else if (cur.next) {
          socket.emit('daily:shown', { profileId: profile.id, index: cur.next.index });
          showQuestion(cur.next.index, cur.next.question, secondsRef.current);
        }
      }, REVEAL_MS);
    };
    const onError = (e: { message: string }) => {
      setStarting(false);
      setError(e.message);
    };

    socket.on('daily:status:data', onStatus);
    socket.on('daily:state', onState);
    socket.on('daily:answered', onAnswered);
    socket.on('daily:error', onError);
    socket.emit('daily:status', { profileId: profile.id });

    return () => {
      socket.off('daily:status:data', onStatus);
      socket.off('daily:state', onState);
      socket.off('daily:answered', onAnswered);
      socket.off('daily:error', onError);
    };
  }, [profile]);

  const start = () => {
    if (!profile) return;
    setStarting(true);
    setError(null);
    getSocket().emit('daily:start', {
      profileId: profile.id,
      name: profile.name || randomGuestName(language),
      avatar: profile.avatar,
    });
  };

  const submit = useCallback((choice: OptionKey | null) => {
    if (!profile || !question || answeredRef.current) return;
    answeredRef.current = true;
    setChosen(choice);
    getSocket().emit('daily:answer', { profileId: profile.id, index: question.index, answer: choice });
  }, [profile, question]);

  // --- Question timer --------------------------------------------------------
  useEffect(() => {
    if (!question || reveal) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) submit(null);
    };
    tick();
    const handle = window.setInterval(tick, 250);
    return () => window.clearInterval(handle);
  }, [question, reveal, submit]);

  // --- Countdown to tomorrow ---------------------------------------------------
  useEffect(() => {
    if (!result) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [result]);

  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/gunun-quizi` : '/gunun-quizi';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('daily_shared', { via: 'copy' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the WhatsApp button still works.
    }
  };

  // --- Render ------------------------------------------------------------------
  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-quizzy-bg px-4 pt-20 pb-8 flex flex-col items-center">
      <Link href="/" className="inline-flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-2xl bg-blue-soft flex items-center justify-center shadow-md">
          <Zap size={20} className="text-white" fill="white" />
        </div>
        <span className="text-2xl font-extrabold tracking-tight text-quizzy-text">Quizzy</span>
      </Link>
      <div id="daily-quiz" className="w-full max-w-lg">{children}</div>
    </main>
  );

  if (error && !question && !result) {
    return shell(
      <div className="bg-quizzy-card rounded-2xl border border-quizzy-border p-6 text-center shadow-card">
        <p className="text-sm text-red-soft font-medium">{error}</p>
      </div>,
    );
  }

  if (result) {
    const text = shareText(result, t.dailyTitle, pageUrl, t.dailySeconds);
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(text)}`;
    return shell(
      <div className="space-y-4 animate-slide-up">
        <div className="bg-quizzy-card rounded-2xl border border-quizzy-border p-6 text-center shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-quizzy-muted">
            Quizzy #{result.day} · {t.dailyTitle}
          </p>
          <div id="daily-grid" className="text-2xl sm:text-3xl whitespace-nowrap my-4" aria-label={`${result.score}/${result.total}`}>
            {result.grid.map((c, i) => <span key={i}>{CELL_EMOJI[c]}</span>)}
          </div>
          <p className="text-quizzy-muted text-sm">{t.dailyYourScore}</p>
          <p id="daily-score" className="text-4xl font-extrabold text-quizzy-text">
            {result.score}/{result.total}
            <span className="text-base font-semibold text-quizzy-muted ml-2">⚡ {Math.round(result.ms / 1000)} {t.dailySeconds}</span>
          </p>
          {status?.done && <p className="text-xs text-quizzy-muted mt-2">{t.dailyAlready}</p>}

          <div className="flex flex-col sm:flex-row gap-2 mt-5">
            <a
              id="daily-whatsapp"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('daily_shared', { via: 'whatsapp' })}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <MessageCircle size={16} />
              {t.dailyShareWhatsapp}
            </a>
            <button
              id="daily-copy"
              onClick={() => copy(text)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-quizzy-text text-quizzy-card text-sm font-semibold hover:opacity-80 transition-opacity"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t.dailyCopied : t.dailyCopy}
            </button>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-xs text-quizzy-muted mt-4">
            <Clock size={13} />
            {t.dailyNextIn} <span className="font-mono tabular-nums text-quizzy-text">{formatCountdown(result.nextAt - now)}</span>
          </p>
        </div>

        <div className="bg-quizzy-card rounded-2xl border border-quizzy-border p-5 shadow-card">
          <p className="flex items-center gap-2 text-sm font-semibold text-quizzy-text mb-3">
            <Users size={16} className="text-quizzy-muted" />
            {t.dailyBoard}
            {result.board.myRank && (
              <span className="ml-auto text-xs font-medium text-quizzy-muted">
                {t.dailyYourRank}: {result.board.myRank}/{result.board.total}
              </span>
            )}
          </p>
          {result.board.entries.length === 0 ? (
            <p className="text-xs text-quizzy-muted">{t.dailyBoardEmpty}</p>
          ) : (
            <ol id="daily-board" className="space-y-1">
              {result.board.entries.map((e) => (
                <li key={e.rank} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${e.me ? 'bg-blue-pale font-semibold' : ''}`}>
                  <span className="w-6 text-quizzy-muted">{e.rank}.</span>
                  <span aria-hidden>{avatarGlyph(e.avatar)}</span>
                  <span className="flex-1 truncate text-quizzy-text">{e.name}</span>
                  <span className="tabular-nums text-quizzy-text">{e.score}/{result.total}</span>
                  <span className="tabular-nums text-xs text-quizzy-muted w-12 text-right">{Math.round(e.ms / 1000)} {t.dailySeconds}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="bg-quizzy-card rounded-2xl border border-quizzy-border shadow-card">
          <button
            onClick={() => setShowReview((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-quizzy-text"
            aria-expanded={showReview}
          >
            {t.dailyReview}
            <ChevronDown size={16} className={`transition-transform ${showReview ? 'rotate-180' : ''}`} />
          </button>
          {showReview && (
            <ol className="px-5 pb-5 space-y-4">
              {result.review.map((q, i) => {
                const opts = (language === 'tr' && q.options_tr) || q.options;
                return (
                  <li key={q.id} className="text-sm">
                    <p className="text-quizzy-text font-medium">
                      {CELL_EMOJI[result.grid[i]]} {(language === 'tr' && q.text_tr) || q.text}
                    </p>
                    <p className="text-green-700 dark:text-green-400 mt-1">✓ {q.answer}) {opts[q.answer]}</p>
                    {q.chosen && !q.correct && <p className="text-red-soft">✗ {q.chosen}) {opts[q.chosen]}</p>}
                    {language === 'en' && q.explanation && <p className="text-xs text-quizzy-muted mt-1">{q.explanation}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 transition-all"
          >
            <Users size={17} />
            {t.dailyPlayFriends}
          </Link>
          <SupportLink placement="daily" />
        </div>
      </div>,
    );
  }

  if (question && meta) {
    const q = question.q;
    const text = (language === 'tr' && q.text_tr) || q.text;
    const opts = (language === 'tr' && q.options_tr) || q.options;
    const pct = Math.max(0, Math.min(100, (timeLeft / meta.seconds) * 100));
    return shell(
      <div className="bg-quizzy-card rounded-2xl border border-quizzy-border p-6 shadow-card animate-fade-in">
        <div className="flex items-center justify-between text-xs font-semibold text-quizzy-muted mb-2">
          <span id="daily-progress">{t.dailyQuestion} {question.index + 1}/{meta.total}</span>
          <span>{label(CATEGORY_LABEL_KEY[q.category])}</span>
          <span className={`tabular-nums ${timeLeft <= 5 ? 'text-red-soft' : ''}`}>{timeLeft} {t.dailySeconds}</span>
        </div>
        <div className="h-1.5 rounded-full bg-quizzy-border overflow-hidden mb-5">
          <div className="h-full bg-blue-soft transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
        <h2 id="daily-question" className="text-lg font-bold text-quizzy-text mb-5 leading-snug">{text}</h2>
        <div className="flex flex-col gap-2.5">
          {OPTION_KEYS.map((k) => {
            const isRight = reveal?.correctAnswer === k;
            const isWrongPick = reveal && chosen === k && !reveal.correct;
            let cls = 'bg-quizzy-card border-quizzy-border text-quizzy-text hover:border-blue-soft hover:bg-blue-pale/30';
            if (isRight) cls = 'bg-green-50 border-green-400 text-green-800';
            else if (isWrongPick) cls = 'bg-red-pale border-red-soft text-red-soft';
            else if (chosen === k) cls = 'bg-blue-pale border-blue-soft text-quizzy-text';
            return (
              <button
                key={k}
                data-option={k}
                onClick={() => submit(k)}
                disabled={chosen !== null || answeredRef.current}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center gap-3 disabled:cursor-default ${cls}`}
              >
                <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold border border-current/30">{k}</span>
                <span className="text-sm font-medium">{opts[k]}</span>
              </button>
            );
          })}
        </div>
        {reveal && (
          <p className={`mt-4 text-center text-sm font-semibold ${reveal.correct ? 'text-green-600' : 'text-red-soft'}`}>
            {reveal.correct ? t.dailyCorrect : chosen === null ? t.dailyTimeUp : t.dailyWrong}
          </p>
        )}
      </div>,
    );
  }

  // Intro (or still loading the status).
  const inProgress = status && !status.done && status.answered > 0;
  return shell(
    <div className="bg-quizzy-card rounded-2xl border border-quizzy-border p-6 text-center shadow-card animate-slide-up">
      <p className="text-xs font-semibold uppercase tracking-widest text-quizzy-muted">
        {status ? `Quizzy #${status.day}` : ' '}
      </p>
      <h1 className="text-3xl font-extrabold text-quizzy-text mt-1">{t.dailyTitle}</h1>
      <p className="text-quizzy-muted mt-2">{t.dailyTagline}</p>
      <p className="text-xs text-quizzy-muted mt-1">{t.dailyRules}</p>
      <div className="flex justify-center gap-1 text-2xl my-5" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => <span key={i}>⬜</span>)}
      </div>
      <button
        id="daily-start"
        onClick={start}
        disabled={!status || starting}
        className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-soft text-white font-semibold hover:bg-blue-500 disabled:opacity-60 active:scale-95 transition-all"
      >
        {(!status || starting) && <Loader2 size={17} className="animate-spin" />}
        {inProgress ? t.dailyResume : t.dailyStart}
      </button>
    </div>,
  );
}
