import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { answerQuestion } from './explain/qa';
import { SidePanel } from './side/SidePanel';
import { createPanelChannel, type PanelAction, type PanelLink, type PanelSnapshot } from './sync/panelSync';
import './index.css';

/** 独立面板窗口：只做展示，所有操作发回主窗口执行。 */
function PanelApp() {
  const [snap, setSnap] = useState<PanelSnapshot | null>(null);
  const linkRef = useRef<PanelLink | null>(null);

  useEffect(() => {
    const link = createPanelChannel((msg) => {
      if (msg.kind === 'state') setSnap(msg.snapshot);
    });
    linkRef.current = link;
    link.postAction({ type: 'requestState' });
    return () => link.close();
  }, []);

  if (!snap) {
    return (
      <div className="app">
        <p className="hint">正在等待主窗口连接…请先在主窗口点击「弹出独立面板」。</p>
      </div>
    );
  }

  const dispatch = (action: PanelAction) => linkRef.current?.postAction(action);

  return (
    <div className="app panel-app">
      <header className="panel-head">
        <h1>教练面板</h1>
        <p className="status">{snap.status}</p>
      </header>
      {snap.progress > 0 && snap.progress < 100 && (
        <div className="progress">引擎加载 {snap.progress}%</div>
      )}
      {snap.error && <pre className="error">{snap.error}</pre>}

      <SidePanel
        phase={snap.phase}
        result={snap.result}
        tone={snap.tone}
        playerColor={snap.playerColor}
        myTurn={snap.myTurn}
        plies={snap.plies}
        chineseMoves={snap.chineseMoves}
        card={snap.card}
        inspectActive={snap.inspectActive}
        preview={
          snap.previewIndex !== null
            ? { index: snap.previewIndex, total: snap.previewTotal ?? 0 }
            : null
        }
        onHighlight={(squares) => dispatch({ type: 'highlight', squares })}
        onPreviewEnter={() => dispatch({ type: 'previewEnter' })}
        onPreviewStep={(delta) => dispatch({ type: 'previewStep', delta })}
        onPreviewExit={() => dispatch({ type: 'previewExit' })}
        onInspect={(ply) => dispatch({ type: 'inspect', plyIndex: snap.plies.indexOf(ply) })}
        onAsk={(ply, question) =>
          dispatch({
            type: 'ask',
            plyIndex: snap.plies.indexOf(ply),
            question,
            answer: answerQuestion(ply, question, snap.tone, snap.difficulty),
          })
        }
        onDevMove={() => dispatch({ type: 'devMove' })}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>
);
