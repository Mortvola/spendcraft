import React from 'react';
import { createRoot } from 'react-dom/client';
import 'regenerator-runtime/runtime';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@mortvola/forms/dist/main.css';
import Intro from './Intro';
import Signin from './Signin';
import Signup from './Signup';
import usePageViews from './Tracker';
import './welcome.css';
import RecoverPassword from './RecoverPassword';

const Welcome: React.FC = () => {
  usePageViews();

  return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/recover-password" element={<RecoverPassword />} />
      <Route path="/" element={<Intro />} />
    </Routes>
  );
};

const container = document.querySelector('.app');

if (container) {
  const root = createRoot(container);
  root.render(
    <BrowserRouter>
      <Welcome />
    </BrowserRouter>,
  );
}
