import { useState } from 'react';
import { PRESET_QUESTIONS } from './qa';
import type { Ply } from '../game/types';

export interface QuestionPanelProps {
  ply: Ply;
  disabled?: boolean;
  onAsk: (question: string) => void;
}

export function QuestionPanel({ ply, disabled, onAsk }: QuestionPanelProps) {
  const [draft, setDraft] = useState('');
  const history = ply.qa ?? [];

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || disabled) return;
    onAsk(q);
    setDraft('');
  };

  return (
    <section
      data-testid="question-panel"
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        background: '#fffdf8',
        border: '1px solid #e2d8c3',
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 13, color: '#6b5636', marginBottom: 8, fontWeight: 600 }}>
        问这一步
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {PRESET_QUESTIONS.map((q) => (
          <button
            key={q}
            data-testid="question-preset"
            disabled={disabled}
            onClick={() => submit(q)}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 14,
              border: '1px solid #c9bda6',
              background: '#fff',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              color: '#6b5636',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          data-testid="question-input"
          type="text"
          placeholder={disabled ? '当前不可提问' : '或者输入你的疑问…'}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            padding: '7px 10px',
            borderRadius: 7,
            border: '1px solid #c9bda6',
            background: disabled ? '#f5f0e6' : '#fff',
            outline: 'none',
          }}
        />
        <button
          data-testid="question-submit"
          type="submit"
          disabled={disabled || !draft.trim()}
          style={{
            fontSize: 13,
            padding: '7px 12px',
            borderRadius: 7,
            border: '1px solid #c9bda6',
            background: '#fffdf8',
            cursor: disabled || !draft.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !draft.trim() ? 0.45 : 1,
          }}
        >
          问
        </button>
      </form>

      {history.length > 0 && (
        <div
          data-testid="question-history"
          style={{ marginTop: 10, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10 }}
        >
          {history.map((item, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#444', fontWeight: 600 }}>你：{item.q}</div>
              <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6, marginTop: 2 }}>
                教练：{item.a}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
