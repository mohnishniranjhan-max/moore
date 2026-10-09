import { useState, lazy, Suspense } from 'react';
import { IntroSequence } from './components/intro/IntroSequence';
import './index.css';

const Explorer = lazy(() => import('./pages/Explorer'));
const GestureLab = lazy(() => import('./pages/GestureLab'));
const WatchCircleLab = lazy(() => import('./pages/WatchCircleLab'));

function App() {
  const [introDone, setIntroDone] = useState(false);
  const [explorerMounted, setExplorerMounted] = useState(false);

  // Path routing for standalone routes
  const isGestureLab = window.location.pathname === '/gesture-lab';
  const isWatchCircle = window.location.pathname === '/watch-circle';

  if (isGestureLab) {
    return (
      <Suspense fallback={<div style={{ background: '#000', width: '100vw', height: '100vh' }} />}>
        <GestureLab />
      </Suspense>
    );
  }

  if (isWatchCircle) {
    return (
      <Suspense fallback={<div style={{ background: '#020617', width: '100vw', height: '100vh' }} />}>
        <WatchCircleLab onExit={() => { window.location.pathname = '/'; }} />
      </Suspense>
    );
  }

  // Mount Explorer as soon as intro starts transitioning out
  const handleIntroComplete = () => {
    setExplorerMounted(true);
    setTimeout(() => setIntroDone(true), 100);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
      {/* Always mount the 3D world so it loads in background */}
      {explorerMounted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: introDone ? 1 : 0,
            transition: 'opacity 1.2s ease',
          }}
        >
          <Suspense fallback={<div style={{ background: '#000', width: '100%', height: '100%' }} />}>
            <Explorer />
          </Suspense>
        </div>
      )}

      {/* Intro overlay — unmount after fully faded */}
      {!introDone && (
        <IntroSequence onComplete={handleIntroComplete} />
      )}
    </div>
  );
}

export default App;
