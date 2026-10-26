/***
 * MARK: main
 * @description Entry point for the KainBain frontend application.
 *   Normalises legacy entry URLs (`#docs`, `?view=`, `?task=`, `#/task/:id`)
 *   onto canonical hashes BEFORE the router boots (history-replacing, so no
 *   extra history entry), then renders the top-level App component within
 *   StrictMode.
 ***/
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { normalizeLegacyUrl } from './routing';
import './index.css';

if (typeof window !== 'undefined' && window.history?.replaceState) {
  const canonical = normalizeLegacyUrl(window.location);
  if (canonical) {
    window.history.replaceState(null, '', `${window.location.pathname}${canonical}`);
  }
}

ReactDOM.createRoot(document.querySelector('#root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
