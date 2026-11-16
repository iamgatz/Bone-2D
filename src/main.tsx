import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/app.css';
import { App } from './editor/App';

if (import.meta.env.DEV) {
  // Handy for poking at state from the devtools console.
  void Promise.all([import('./store/doc'), import('./store/ui'), import('./store/assets'), import('./store/actions'), import('./store/sample'), import('./editor/scene'), import('./store/project'), import('./store/meshActions'), import('./store/ikActions')]).then(([doc, ui, assets, actions, sample, scene, project, meshActions, ikActions]) => {
    (window as unknown as Record<string, unknown>).__bone2d = { ...doc, ...ui, ...assets, actions, sample, scene, project, meshActions, ikActions };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
