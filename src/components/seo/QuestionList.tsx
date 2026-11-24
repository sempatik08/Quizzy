import type { BankQuestion } from '@/lib/seo/bank';
import type { OptionKey } from '@/types';

const KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * Sample questions with the answer behind a <details>, so the page reads as a
 * quiz rather than an answer key — and the answer is still in the HTML for
 * search engines and for anyone who just wants to check.
 */
export function QuestionList({ questions, labels }: { questions: BankQuestion[]; labels?: string[] }) {
  return (
    <ol className="space-y-4">
      {questions.map((q, i) => (
        <li key={q.id} className="rounded-2xl bg-quizzy-card border border-quizzy-border p-5 shadow-card">
          <p className="text-xs font-semibold text-quizzy-muted mb-1">
            Soru {i + 1}{labels?.[i] ? ` · ${labels[i]}` : ''}
          </p>
          <h3 className="font-semibold text-quizzy-text leading-snug">{q.text_tr}</h3>
          <ul className="mt-3 grid gap-1.5 text-sm text-quizzy-text">
            {KEYS.map((k) => (
              <li key={k} className="flex gap-2">
                <span className="font-bold text-quizzy-muted w-4">{k}</span>
                <span>{q.options_tr[k]}</span>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-blue-soft select-none">Cevabı göster</summary>
            <p className="mt-2 text-quizzy-text">
              <span className="font-semibold">Doğru cevap: {q.answer})</span> {q.options_tr[q.answer]}
            </p>
          </details>
        </li>
      ))}
    </ol>
  );
}
