import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PublicBooking from './PublicBooking';
import CustomerPortal from './CustomerPortal';

const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname;
const bookMatch = path.match(/^\/book\/([^/]+)/);
const portalMatch = path.match(/^\/portal\/([^/]+)/);

if (bookMatch) {
  root.render(<PublicBooking orgSlug={bookMatch[1]} />);
} else if (portalMatch) {
  root.render(<CustomerPortal orgSlug={portalMatch[1]} />);
} else {
  root.render(<App />);
}