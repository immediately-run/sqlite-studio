import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatProviderState } from '@immediately-run/sdk/llm';
import ResultsView from './ResultsView';
import { describeSchema, extractSql, isReadOnlySql, type Database, type QueryResult } from '../lib/sqlite';
import { toCsv } from '../lib/csv';
import { errorCode, errorMessage } from '../lib/persist';
import { newId } from '../lib/store';

// The SDK's llm module is loaded lazily so the rest of the app never depends on
// a host being present (plain `vite dev` has none).
type LlmModule = typeof import('@immediately-run/sdk/llm');

export interface RunOutcome {
  result?: QueryResult;
  error?: string;
}

interface Props {
  db: Database | null;
  dbName: string;
  version: number;
  runSql: (sql: string) => RunOutcome;
  onShowInEditor: (sql: string) => void;
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sql?: string | null;
  readOnly?: boolean;
  outcome?: RunOutcome;
  streaming?: boolean;
  failure?: string;
}

type PanelState = { status: 'loading' } | { status: 'no-host' } | { status: 'failed'; message: string } | ChatProviderState;

declare const __APP_DEV__: boolean | undefined;
const isDev = () => typeof __APP_DEV__ !== 'undefined' && __APP_DEV__;

const SUGGESTIONS = [
  'Which genre earns the most revenue?',
  'Top 5 customers by total spent',
  'How many tracks does each artist have?',
  'Monthly revenue for 2024',
];

function systemPrompt(db: Database, dbName: string): string {
  return [
    `You are a SQLite expert helping a user explore the database "${dbName}" inside SQLite studio.`,
    'Answer questions by writing ONE SQLite SELECT (or WITH ... SELECT) statement in a ```sql fenced block.',
    'Rules: only read-only SQL; use only the tables and columns below; quote identifiers with double quotes when needed;',
    'prefer explicit column aliases; add ORDER BY and LIMIT when sensible; keep explanations to one or two short sentences.',
    'When the user asks to explain a result rather than a new question, explain it in plain language and do not include SQL.',
    '',
    'Schema (CREATE statements from sqlite_master, with up to 3 sample rows per table):',
    '',
    describeSchema(db, 3),
  ].join('\n');
}

const text = (t: string): ChatMessage['content'] => [{ type: 'text', text: t }];

function AskPanel({ db, dbName, version, runSql, onShowInEditor }: Props) {
  const [mod, setMod] = useState<LlmModule | null>(null);
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    import('@immediately-run/sdk/llm')
      .then((m) => {
        if (cancelled) return;
        setMod(m);
        unsub = m.onChatProviderStateChange((s) => {
          if (timer) clearTimeout(timer);
          timer = null;
          setState(s);
          if (s.status === 'unknown' && isDev()) {
            // No host answers under plain vite dev: say so instead of spinning forever.
            timer = setTimeout(() => setState({ status: 'no-host' }), 4000);
          }
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: errorMessage(e) });
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsub?.();
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns]);

  const patchTurn = useCallback((id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)));
  }, []);

  const send = useCallback(
    async (userText: string, wireText = userText) => {
      if (!mod || !db || busy) return;
      const userTurn: Turn = { id: newId(), role: 'user', text: userText };
      const assistantTurn: Turn = { id: newId(), role: 'assistant', text: '', streaming: true };
      const priorTurns = turns;
      setTurns([...priorTurns, userTurn, assistantTurn]);
      setQuestion('');
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;

      const messages: ChatMessage[] = [
        { role: 'system', content: text(systemPrompt(db, dbName)) },
        ...priorTurns
          .filter((t) => t.text.trim())
          .map<ChatMessage>((t) => ({ role: t.role, content: text(t.text) })),
        { role: 'user', content: text(wireText) },
      ];

      let answer = '';
      try {
        for await (const d of mod.chat({ messages, modelHint: 'smart', maxTokens: 1200, signal: ac.signal })) {
          if (d.type === 'text-delta') {
            answer += d.text;
            patchTurn(assistantTurn.id, { text: answer });
          }
        }
        const sql = extractSql(answer);
        const readOnly = sql ? isReadOnlySql(sql) : false;
        let outcome: RunOutcome | undefined;
        if (sql) {
          onShowInEditor(sql);
          if (readOnly) outcome = runSql(sql);
        }
        patchTurn(assistantTurn.id, { text: answer, sql, readOnly, outcome, streaming: false });
      } catch (e) {
        const code = errorCode(e);
        const failure =
          code === 'auth-required'
            ? 'No LLM key is connected yet. Add one in immediately.run settings, then ask again.'
            : code === 'forbidden'
              ? 'This app is not allowed to use the LLM (llm:chat capability missing).'
              : ac.signal.aborted
                ? 'Stopped.'
                : errorMessage(e);
        patchTurn(assistantTurn.id, { text: answer, streaming: false, failure });
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [mod, db, busy, turns, dbName, patchTurn, onShowInEditor, runSql],
  );

  const explain = (t: Turn) => {
    const r = t.outcome?.result;
    if (!r) return;
    const sample = toCsv(r.columns, r.rows.slice(0, 20));
    const more = r.rows.length > 20 ? `\n(${r.rows.length - 20} more rows not shown)` : '';
    void send(
      'Explain this result',
      `Explain this result in plain language (no SQL needed). The query was:\n\`\`\`sql\n${t.sql}\n\`\`\`\nIt returned ${r.rows.length} rows; here are the first ones as CSV:\n${sample}${more}`,
    );
  };

  const runAnyway = (t: Turn) => {
    if (!t.sql) return;
    patchTurn(t.id, { outcome: runSql(t.sql) });
  };

  void version; // results embedded in turns are snapshots; the editor re-runs against the live db

  const ready = state.status === 'configured' && !!db;

  return (
    <section className="ask-panel">
      <div className="ask-log" ref={logRef}>
        {state.status === 'loading' && (
          <p className="hint">
            <span className="spinner" aria-hidden="true" /> Loading the assistant…
          </p>
        )}
        {state.status === 'unknown' && (
          <p className="hint">
            <span className="spinner" aria-hidden="true" /> Checking for an LLM provider…
          </p>
        )}
        {state.status === 'not-configured' && (
          <div className="notice">
            <b>Add an LLM key in immediately.run settings to enable this.</b>
            <p>Questions are answered by the model you connect; the app never sees your key.</p>
          </div>
        )}
        {state.status === 'no-host' && (
          <div className="notice">
            <b>Not running inside immediately.run.</b>
            <p>The assistant uses the platform's LLM connection, so it only works when the app is opened on immediately.run.</p>
          </div>
        )}
        {state.status === 'failed' && <p className="error">Could not load the assistant: {state.message}</p>}
        {state.status === 'configured' && !db && <p className="hint">Open a database first.</p>}

        {ready && turns.length === 0 && (
          <div className="ask-intro">
            <p className="hint">
              Ask a question about <b>{dbName}</b> in plain English. The model sees the schema and three sample rows per
              table, writes a SELECT, and the app runs it — read-only statements only.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <article key={t.id} className={`turn ${t.role}`}>
            <div className="turn-role mono">{t.role === 'user' ? 'You' : 'Assistant'}</div>
            {t.role === 'user' ? (
              <p className="turn-text">{t.text}</p>
            ) : (
              <>
                {t.text && <pre className="turn-text answer">{t.text}</pre>}
                {t.streaming && <span className="spinner" aria-label="thinking" />}
                {t.failure && <p className="error">{t.failure}</p>}
                {!t.streaming && t.sql && !t.readOnly && !t.outcome && (
                  <div className="notice warn">
                    <b>Not run automatically:</b> the statement is not a plain SELECT.
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => runAnyway(t)}>
                      Run anyway
                    </button>
                  </div>
                )}
                {t.outcome?.error && <pre className="error mono">{t.outcome.error}</pre>}
                {t.outcome?.result && (
                  <>
                    <ResultsView result={t.outcome.result} compact />
                    <div className="row">
                      <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => explain(t)}>
                        Explain this result
                      </button>
                      {t.sql && (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onShowInEditor(t.sql!)}>
                          Open in query editor
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) void send(question.trim());
        }}
      >
        <input
          className="input ask-input"
          placeholder={ready ? 'Ask about your data…' : 'Assistant unavailable'}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!ready || busy}
          aria-label="Question"
        />
        {busy ? (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" type="submit" disabled={!ready || !question.trim()}>
            Ask
          </button>
        )}
        {turns.length > 0 && !busy && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTurns([])}>
            Clear
          </button>
        )}
      </form>
    </section>
  );
}

export default AskPanel;
