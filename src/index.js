import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname;
const bookMatch = path.match(/^\/book\/([^/]+)/);
const portalMatch = path.match(/^\/portal\/([^/]+)/);

if (bookMatch) {
  import('./PublicBooking').then(({ default: PublicBooking }) => {
    root.render(<PublicBooking orgSlug={bookMatch[1]} />);
  });
} else if (portalMatch) {
  import('./CustomerPortal').then(({ default: CustomerPortal }) => {
    root.render(<CustomerPortal orgSlug={portalMatch[1]} />);
  });
} else {
  import('./App').then(({ default: App }) => {
    root.render(<App />);
  });
}