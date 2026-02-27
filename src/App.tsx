import React, { useEffect, useRef } from 'react';
import { startGame } from './game/loop';
import { useState } from 'react';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return () => {};
    }
    return startGame(canvas);
  }, []);

  useEffect(() => {
    if (started) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setStarted(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [started]);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative', backgroundColor: '#000' }}>

      <canvas id="c" ref={canvasRef} width={800} height={600} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'auto' }} />
      {!started && (
        <button
          id="startOverlay"
          type="button"
          onClick={() => setStarted(true)}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            backgroundColor: 'transparent',
            color: '#44ff88',
            fontFamily: 'monospace',
            fontSize: '24px',
            cursor: 'pointer',
            userSelect: 'none',
            border: '2px solid #44ff88',
            borderRadius: '8px',
            padding: '16px 32px',
          }}
        >
          CLICK TO START
        </button>
      )}
      <button
        id="tiltBtn"
        type="button"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#4488ff',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '14px 28px',
          fontSize: '18px',
          fontFamily: 'monospace',
          zIndex: 10,
          cursor: 'pointer',
        }}
      >
        ENABLE TILT
      </button>
      <div
        id="nameEntry"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: 'rgba(0,0,0,0.85)',
          padding: '16px',
          fontFamily: 'monospace',
          color: '#fff',
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
          TAP LETTER TO CHANGE - SWIPE UP/DOWN
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
          {[0, 1, 2].map((idx) => (
            <div className="init-col" data-idx={idx} key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button type="button" className="init-up" style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '6px 16px', fontSize: '20px', fontFamily: 'monospace', cursor: 'pointer' }}>
                ▲
              </button>
              <div className="init-letter" style={{ fontSize: '40px', fontWeight: 'bold', lineHeight: 1.2, color: idx === 0 ? '#44ff88' : '#888' }}>
                A
              </div>
              <button type="button" className="init-down" style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '6px 16px', fontSize: '20px', fontFamily: 'monospace', cursor: 'pointer' }}>
                ▼
              </button>
            </div>
          ))}
        </div>
        <button
          id="nameSubmitBtn"
          type="button"
          style={{
            background: '#44ff88',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 32px',
            fontSize: '18px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          SUBMIT SCORE
        </button>
      </div>
    </div>
  );
};

export default App;
