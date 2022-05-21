import React from 'react';
import { createRoot } from 'react-dom/client';
import 'regenerator-runtime/runtime';
import {
  BrowserRouter as Router, Switch, Route,
} from 'react-router-dom';
import '@mortvola/forms/dist/main.css';
import Intro from './Intro';
import Signin from './Signin';
import Signup from './Signup';
import usePageViews from './Tracker';
import './welcome.css';

const Welcome: React.FC = () => {
  usePageViews();

  return (
    <Switch>
      <Route path="/signup">
        <Signup />
      </Route>
      <Route path="/signin">
        <Signin />
      </Route>
      <Route path="/">
        <Intro />
      </Route>
    </Switch>
  );
};

const container = document.querySelector('.app');

if (container) {
  const root = createRoot(container);
  root.render(
    <Router>
      <Welcome />
    </Router>,
  );
}
